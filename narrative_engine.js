/* narrative_engine.js v2.4 — Bộ sinh thuyết minh & phân tích định lượng tự động theo số liệu thực tế */
(function (global) {
  "use strict";

  const pct = (v, d = 2) => (isFinite(v) ? `${(v * 100).toFixed(d)}%` : "--");
  const num = (v, d = 2) => (isFinite(v) ? Number(v).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }) : "--");

  function boxHTML(title, summary, bullets, verdictCls = "badge-info", verdictText = "") {
    return `
      <div class="insight-head">
        <span class="insight-title">📝 Thuyết minh &amp; Phân tích: ${title}</span>
        ${verdictText ? `<span class="badge ${verdictCls}">${verdictText}</span>` : ""}
      </div>
      <p class="insight-summary">${summary}</p>
      <ul class="insight-list">
        ${bullets.map(b => `<li>${b}</li>`).join("")}
      </ul>
    `;
  }

  // 1. Thuyết minh Credit Scorecard 8 Bước
  function explainScorecard(res, cutoffSim, cutoffVal) {
    const valGini = res.valMetrics.gini;
    const valKs = res.valMetrics.ks;
    const giniEval = valGini >= 0.45 ? "rất mạnh (chuẩn mô hình bán lẻ xuất sắc)" :
                     (valGini >= 0.30 ? "đạt chuẩn triển khai ngân hàng thương mại" : "ở mức trung bình, cần bổ sung biến dự báo");
    const ksEval = valKs >= 0.30 ? "khả năng tách biệt nhóm Tốt / Xấu tốt" :
                   (valKs >= 0.20 ? "khả năng phân tách ở mức chấp nhận được" : "khả năng phân tách còn yếu");
    const psiText = res.psi < 0.10
      ? `PSI = <strong>${res.psi.toFixed(4)}</strong> (&lt; 0,10): Phân phối điểm giữa tập Train và Validation <strong>rất ổn định</strong>, chưa có dấu hiệu trượt dân số (population drift).`
      : (res.psi < 0.25
        ? `PSI = <strong>${res.psi.toFixed(4)}</strong> (0,10 – 0,25): Có biến động nhẹ về cơ cấu khách hàng, cần theo dõi định kỳ hàng quý.`
        : `PSI = <strong>${res.psi.toFixed(4)}</strong> (&gt; 0,25): Quần thể bị lệch đáng kể, cần hiệu chỉnh lại trọng số hoặc tái huấn luyện mô hình.`);

    const topVar = res.modelSummary[0];
    const maxVif = Math.max(...res.modelSummary.map(m => m.vif));
    const g1 = res.masterScale[0];
    const g10 = res.masterScale[res.masterScale.length - 1];

    const summary = `Mô hình hồi quy Logistic trên <strong>${res.nTotal.toLocaleString("vi-VN")} khách hàng</strong> (tỷ lệ nợ xấu chung <strong>${pct(res.overallBadRate, 2)}</strong>) đạt <strong>Gini Validation = ${pct(valGini, 2)}</strong> (AUC = ${res.valMetrics.auc.toFixed(3)}) — đánh giá ${giniEval}.`;

    const bullets = [
      `<strong>Sức phân tách (KS):</strong> Đạt <strong>${pct(valKs, 2)}</strong> tại <strong>Top ${res.valMetrics.maxKSPct.toFixed(1)}%</strong> khách hàng rủi ro cao nhất (${ksEval}).`,
      `<strong>Kiểm định ổn định &amp; phân tán:</strong> ${psiText} Chỉ số tập trung <strong>HHI = ${res.hhi.toFixed(4)}</strong> (${res.hhi < 0.15 ? "phân bổ đều qua 10 hạng, không bị dồn cục" : "có dấu hiệu dồn cụm vào một vài hạng"}).`,
      topVar ? `<strong>Biến dự báo mạnh nhất &amp; Đa cộng tuyến:</strong> Biến <code>${topVar.feature}</code> dẫn đầu với <strong>IV = ${topVar.iv.toFixed(4)}</strong> (${topVar.monotonic}). Hệ số phóng đại phương sai lớn nhất <strong>VIF = ${maxVif.toFixed(2)}</strong> (${maxVif < 5 ? "không có đa cộng tuyến nghiêm trọng" : "cần xem xét loại bớt biến tương quan cao"}).` : "",
      `<strong>Phổ hạng Master Scale:</strong> Tỷ lệ nợ xấu phân tầng rõ rệt từ <strong>${pct(g1.badRate, 2)}</strong> ở <em>${g1.grade}</em> (an toàn nhất) tăng lên <strong>${pct(g10.badRate, 2)}</strong> ở <em>${g10.grade}</em> (rủi ro cao nhất).`,
      cutoffSim ? `<strong>Tác động điểm cắt Cut-off (${cutoffVal} điểm):</strong> Ngân hàng sẽ phê duyệt <strong>${pct(cutoffSim.approvalRate, 1)}</strong> hồ sơ, giúp kéo tỷ lệ nợ xấu danh mục sau duyệt xuống còn <strong>${pct(cutoffSim.approvedBadRate, 2)}</strong> và chặn trước được <strong>${pct(cutoffSim.rejectedBadsCapture, 1)}</strong> tổng số khách hàng nợ xấu.` : ""
    ].filter(Boolean);

    const vCls = valGini >= 0.30 && res.psi < 0.25 ? "badge-success" : "badge-warning";
    const vTxt = valGini >= 0.30 && res.psi < 0.25 ? "Đạt chuẩn vận hành" : "Cần theo dõi / Tinh chỉnh";
    return boxHTML("Credit Scorecard 8 Bước", summary, bullets, vCls, vTxt);
  }

  // 2. Thuyết minh Doanh nghiệp (Altman Z + 5 Nhóm tỷ số + 6C)
  function explainCorporate(res, qualState) {
    const r = res.ratios;
    const c6Avg = Object.values(qualState.c6).reduce((a, b) => a + b, 0) / 6;
    const summary = `Doanh nghiệp đạt <strong>Altman Z = ${res.Z.score.toFixed(2)}</strong> (<em>${res.Z.zone.label}</em>), <strong>Z' = ${res.Z_prime.score.toFixed(2)}</strong> (<em>${res.Z_prime.zone.label}</em>) và <strong>Z'' = ${res.Z_double.score.toFixed(2)}</strong> (<em>${res.Z_double.zone.label}</em>).`;

    const liqComment = r.liquidity.currentRatio >= 1.5
      ? "tốt, tài sản ngắn hạn dư sức trang trải nợ ngắn hạn"
      : (r.liquidity.currentRatio >= 1.0 ? "ở mức vừa đủ, cần theo dõi vòng quay tồn kho và phải thu" : "căng thẳng (< 1,0x), tiềm ẩn rủi ro mất khả năng thanh toán ngắn hạn");

    const levComment = r.leverage.debtToEquity <= 1.5
      ? "đòn bẩy tài chính an toàn"
      : (r.leverage.debtToEquity <= 2.5 ? "đòn bẩy trung bình, cần kiểm soát chi phí lãi vay" : "đòn bẩy nợ cao, áp lực trả gốc và lãi lớn");

    const bullets = [
      `<strong>Động lực cấu thành Z-Score:</strong> Tỷ số Vốn lưu động/Tổng TS (<code>X1</code>) = <strong>${res.components.X1.toFixed(3)}</strong>; EBIT/Tổng TS (<code>X3</code> — hệ số sinh lời cốt lõi có trọng số cao nhất 3,3) = <strong>${res.components.X3.toFixed(3)}</strong>; Vòng quay tài sản (<code>X5</code>) = <strong>${res.components.X5.toFixed(2)}x</strong>.`,
      `<strong>Thanh khoản &amp; Khả năng trả lãi:</strong> Current Ratio = <strong>${r.liquidity.currentRatio.toFixed(2)}x</strong>, Quick Ratio = <strong>${r.liquidity.quickRatio.toFixed(2)}x</strong> (${liqComment}). Hệ số bao phủ lãi vay EBIT/Lãi = <strong>${r.liquidity.interestCoverage.toFixed(2)}x</strong> (${r.liquidity.interestCoverage >= 3 ? "khả năng trả lãi rất vững" : "cần cảnh giác áp lực lãi vay"}).`,
      `<strong>Cấu trúc nợ &amp; Sinh lời:</strong> Tỷ số nợ/Tổng TS = <strong>${pct(r.leverage.totalDebtRatio, 1)}</strong>, D/E = <strong>${r.leverage.debtToEquity.toFixed(2)}x</strong> (${levComment}). Hiệu quả sinh lời đạt <strong>ROA = ${pct(r.profitability.roa, 2)}</strong> và <strong>ROE = ${pct(r.profitability.roe, 2)}</strong>.`,
      res.grover && res.zmijewski && res.springate ? `<strong>Đối chiếu 3 mô hình phá sản bổ sung:</strong> Grover G = <strong>${res.grover.score.toFixed(3)}</strong> (<em>${res.grover.zone.label}</em>), Zmijewski X = <strong>${res.zmijewski.score.toFixed(3)}</strong> (xác suất phá sản Probit <strong>${pct(res.zmijewski.prob, 2)}</strong> — <em>${res.zmijewski.zone.label}</em>), và Springate S = <strong>${res.springate.score.toFixed(3)}</strong> (<em>${res.springate.zone.label}</em>).` : "",
      `<strong>Đánh giá định tính 6C:</strong> Điểm bình quân đạt <strong>${c6Avg.toFixed(1)}/10</strong> (${c6Avg >= 7.5 ? "hồ sơ phi tài chính & uy tín tốt, hỗ trợ tích cực cho quyết định cấp tín dụng" : "cần thẩm định bổ sung năng lực điều hành và tài sản bảo đảm"}).`
    ];

    return boxHTML("Phân tích Doanh nghiệp (Altman Z & Tài chính)", summary, bullets, res.Z.zone.cls, res.Z.zone.label);
  }

  // 3. Thuyết minh Tín dụng Tiêu dùng
  function explainConsumer(res, inputs) {
    const gap = res.total - 28;
    const summary = `Khách hàng đạt tổng <strong>${res.total} / 43 điểm</strong> (${gap > 0 ? `vượt ngưỡng tối thiểu 28 điểm là <strong>+${gap} điểm</strong>` : `thấp hơn ngưỡng tối thiểu 29 điểm là <strong>${29 - res.total} điểm</strong>`}). Kết luận hệ thống: <strong>${res.decision}</strong>.`;

    const items = [
      { name: "Nghề nghiệp", v: Number(inputs.job), max: 10 },
      { name: "Xếp hạng tín dụng (CIC)", v: Number(inputs.creditRating), max: 10 },
      { name: "Trạng thái nhà ở", v: Number(inputs.housing), max: 6 },
      { name: "Kinh nghiệm nghề nghiệp", v: Number(inputs.experience), max: 5 },
      { name: "Tài khoản tại NH", v: Number(inputs.bankAccount), max: 4 },
      { name: "Người phụ thuộc", v: Number(inputs.dependents), max: 4 }
    ].sort((a, b) => (b.v / b.max) - (a.v / a.max));

    const best = items[0];
    const worst = items[items.length - 1];

    const bullets = [
      `<strong>Điểm cộng nổi bật nhất:</strong> Tiêu chí <em>${best.name}</em> đạt <strong>${best.v}/${best.max} điểm</strong>, đóng góp tích cực vào độ tin cậy trả nợ.`,
      `<strong>Điểm yếu cần cải thiện:</strong> Tiêu chí <em>${worst.name}</em> mới đạt <strong>${worst.v}/${worst.max} điểm</strong> — nếu cải thiện tiêu chí này khách hàng có thể nâng bậc hạn mức.`,
      `<strong>Chính sách hạn mức:</strong> Theo khung điểm tiêu dùng chuẩn, nhóm ≤28đ bị từ chối; từ 29đ trở lên hạn mức tăng dần theo từng nấc điểm từ $500 đến tối đa $8.000 (≥41đ).`
    ];

    return boxHTML("Điểm số Tín dụng Tiêu dùng", summary, bullets, res.cls, res.limit > 0 ? `Hạn mức $${res.limit.toLocaleString("en-US")}` : "Từ chối");
  }

  // 4. Thuyết minh Cấu trúc Kỳ hạn & Basel I / II / III
  function explainBaselAll(tsRes, irbRes, b3Res) {
    const y1 = tsRes.years[0], y3 = tsRes.years[2];
    const summary = `Hệ thống đo lường đồng thời rủi ro vỡ nợ kỳ hạn 3 năm (<strong>Cp = ${pct(y3.cumPD, 2)}</strong>), vốn nội bộ <strong>Basel II IRB (RWA = ${num(irbRes.RWA, 2)} Tr. USD)</strong> và kiểm định 6 chuẩn an toàn <strong>Basel III</strong>.`;

    const bullets = [
      `<strong>Cấu trúc kỳ hạn RRTD:</strong> Chênh lệch lãi suất rủi ro (Risk Premium) năm 1 là <strong>${pct(y1.spread, 2)}</strong> kéo theo xác suất vỡ nợ năm 1 là <strong>${pct(y1.annualPD, 2)}</strong>; sau 3 năm xác suất vỡ nợ tích lũy tăng lên <strong>${pct(y3.cumPD, 2)}</strong> (nếu tăng hệ số thu hồi TSĐB <code>β</code>, mức thưởng rủi ro yêu cầu và PD hàm ý sẽ dịch chuyển tương ứng).`,
      `<strong>Basel II IRB (Nội bộ):</strong> Với PD = ${pct(irbRes.PD, 2)}, LGD = ${pct(irbRes.LGD, 0)}, hệ số tương quan hệ thống <strong>ρ = ${irbRes.rho.toFixed(4)}</strong> và kỳ hạn hiệu chỉnh <strong>MA = ${irbRes.MA.toFixed(3)}</strong>. Trong kịch bản khủng hoảng tin cậy 99,9%, xác suất vỡ nợ xấu nhất tăng vọt lên <strong>WCDR = ${pct(irbRes.wcdr, 2)}</strong> → Tổn thất kỳ vọng <strong>EL = ${irbRes.EL.toFixed(3)} Tr.</strong>, vốn tối thiểu phải dự phòng cho tổn thất ngoài dự kiến là <strong>${irbRes.minCapital.toFixed(2)} Tr. USD</strong> (8% RWA).`,
      `<strong>Basel III — Vốn lõi &amp; Output Floor 72,5%:</strong> CET1 đạt <strong>${pct(b3Res.cet1Ratio, 2)}</strong> (chuẩn tối thiểu gồm CCB 2,5% + CCyB ${pct(b3Res.ccyb, 2)} là <strong>${pct(b3Res.reqCet1, 2)}</strong>). ${b3Res.floorTriggered ? `<strong>Lưu ý quan trọng:</strong> RWA nội bộ (${num(b3Res.rwaIrb, 1)}) thấp hơn sàn 72,5% RWA chuẩn hóa (${num(b3Res.outputFloorRwa, 1)}), nên <strong>Output Floor đã kích hoạt</strong>, buộc tính vốn trên RWA = ${num(b3Res.effectiveRwa, 1)} Tr. USD.` : `RWA nội bộ (${num(b3Res.rwaIrb, 1)}) cao hơn mức sàn 72,5% (${num(b3Res.outputFloorRwa, 1)}), không bị kích hoạt Output Floor.`}`,
      `<strong>Basel III — Đòn bẩy &amp; Thanh khoản:</strong> Leverage Ratio = <strong>${pct(b3Res.leverageRatio, 2)}</strong> (${b3Res.checks.levPass ? "đạt ≥ 3,0%" : "dưới chuẩn 3,0%"}). Thanh khoản ngắn hạn <strong>LCR = ${pct(b3Res.lcr, 1)}</strong> và dài hạn <strong>NSFR = ${pct(b3Res.nsfr, 1)}</strong> (${b3Res.checks.lcrPass && b3Res.checks.nsfrPass ? "đều vượt chuẩn ≥ 100%, chống chịu tốt khi bị rút tiền 30 ngày" : "cần bổ sung HQLA hoặc tăng nguồn vốn ổn định dài hạn"}).`
    ];

    return boxHTML("Cấu trúc Kỳ hạn & Chuẩn vốn Basel I / II / III", summary, bullets, b3Res.allPass ? "badge-success" : "badge-danger", b3Res.allPass ? "Đạt chuẩn Basel III" : "Cảnh báo chuẩn Basel III");
  }

  // 5. Thuyết minh Dự án, Trả nợ & Nợ xấu NPL
  function explainProjectAndNpl(pfRes, repRes, nplRes, discountRatePct) {
    const npvOk = pfRes.npv > 0;
    const nplOk = nplRes.nplRatio <= 0.03;
    const summary = `Dự án đầu tư có <strong>NPV = ${num(pfRes.npv, 1)} Tr. VND</strong> (${npvOk ? "khả thi về tài chính" : "không khả thi, phá hủy giá trị"}) và danh mục tín dụng hiện có tỷ lệ nợ xấu <strong>NPL = ${pct(nplRes.nplRatio, 2)}</strong> (${nplOk ? "nằm trong ngưỡng kiểm soát ≤ 3%" : "vượt ngưỡng cảnh báo 3%"}).`;

    const bullets = [
      `<strong>Hiệu quả dự án:</strong> Suất sinh lời nội bộ <strong>IRR = ${pfRes.irr !== null ? pct(pfRes.irr, 2) : "N/A"}</strong> ${pfRes.irr !== null && pfRes.irr * 100 > Number(discountRatePct) ? `cao hơn lãi suất chiết khấu ${discountRatePct}%` : `thấp hơn lãi suất chiết khấu ${discountRatePct}%`}, chỉ số sinh lợi <strong>BCR = ${pfRes.bcr.toFixed(2)}x</strong> (${pfRes.bcr > 1 ? "thu lớn hơn chi theo hiện giá" : "không bù đắp đủ chi phí"}).`,
      `<strong>Điểm hòa vốn (BEP):</strong> Doanh nghiệp cần tiêu thụ tối thiểu <strong>${num(pfRes.Qhv, 1)} sản phẩm</strong> (doanh thu <strong>${num(pfRes.DThv, 1)} Tr. VND</strong>), tương ứng mất khoảng <strong>${num(pfRes.Thv, 0)} ngày</strong> hoạt động để hòa vốn; mọi sản lượng vượt qua mốc này sẽ trực tiếp tạo lợi nhuận EBIT.`,
      `<strong>Khả năng trả nợ dự án (Cty X):</strong> Tổng lãi thi công phát sinh qua 5 đợt giải ngân là <strong>${num(repRes.constructionInterest, 1)} Tr.</strong>, nâng tổng dư nợ nhận nợ lên <strong>${num(repRes.totalDebtStart, 1)} Tr.</strong> Hệ số bao phủ nghĩa vụ trả nợ <strong>DSCR = ${repRes.dscr.toFixed(2)}x</strong> (${repRes.dscr >= 1.2 ? "nguồn khấu hao + lợi nhuận giữ lại đảm bảo trả nợ an toàn" : "nguồn trả nợ khá sát, dễ hụt dòng tiền nếu doanh thu giảm"}).`,
      `<strong>Chất lượng danh mục nợ (5 nhóm):</strong> Tỷ lệ nợ quá hạn (Nhóm 2–5) là <strong>${pct(nplRes.overdueRatio, 2)}</strong>, trong đó Nợ xấu (Nhóm 3–5) chiếm <strong>${pct(nplRes.nplRatio, 2)}</strong>. Hiệu suất sử dụng vốn <strong>H1 (Cho vay / Huy động) = ${pct(nplRes.h1, 1)}</strong> (${nplRes.h1 <= 0.85 ? "tuân thủ tốt trần LDR ≤ 85%" : "tỷ lệ cho vay trên huy động cao, cần kiểm soát thanh khoản"}).`
    ];

    const cls = npvOk && nplOk ? "badge-success" : "badge-warning";
    return boxHTML("Thẩm định Dự án, Kế hoạch Trả nợ & Nợ xấu (NPL)", summary, bullets, cls, npvOk && nplOk ? "Dự án khả thi & Nợ xấu an toàn" : "Cần lưu ý rủi ro");
  }

  // 6. Thuyết minh Chương 2: Lãi suất, LSHVBQ & Arbitrage
  function explainInterest(res) {
    const diffComp = res.compoundFV - res.simpleFV;
    const e1 = res.yieldCurve.forward[0], e4 = res.yieldCurve.forward[3];
    const curveShape = e4 > e1 ? "dốc lên (thị trường kỳ vọng lãi suất tương lai tăng)" : "phẳng/đảo ngược (kỳ vọng lãi suất giảm)";
    const a = res.arbitrage;

    const summary = `Lãi suất hòa vốn bình quân tổng nguồn vốn <strong>LSHVBQ = ${pct(res.avgLshvbq, 4)}/tháng</strong>; cộng lãi gộp mục tiêu (+0,18%/tháng), ngân hàng cần cho vay bình quân tối thiểu <strong>${pct(res.suggestedLendingRate, 4)}/tháng</strong> để đạt lợi nhuận ngành.`;

    const bullets = [
      `<strong>Hiệu ứng lãi kép:</strong> Ghép lãi định kỳ tạo thêm <strong>+${num(diffComp, 2)} Tr. VND</strong> tiền lãi so với lãi đơn; lãi suất thực trả (Effective Rate) đạt <strong>${pct(res.effectiveRate, 2)}/năm</strong>.`,
      `<strong>Chiến lược huy động theo LSHVBQ:</strong> Những kỳ hạn có LSHVBQ thấp hơn mức bình quân <strong>${pct(res.avgLshvbq, 3)}/tháng</strong> (như không kỳ hạn, 1–2 tháng) là nguồn vốn giá rẻ cần đẩy mạnh huy động; ngược lại kỳ hạn dài (&gt;6–12 tháng) có chi phí vốn cao hơn bình quân.`,
      `<strong>Dự báo đường cong lãi suất:</strong> Đường cong lãi suất Forward đi từ <strong>${pct(e1, 2)}</strong> (năm 1) đến <strong>${pct(e4, 2)}</strong> (năm 4) — dạng ${curveShape}. Đây là cơ sở để định giá các hợp đồng hoán đổi lãi suất cố định/thả nổi.`,
      `<strong>Quyết định Arbitrage có bảo hiểm:</strong> Lãi suất ngoại tệ quy đổi sang nội tệ là <strong>${pct(a.RC_to_T, 3)}</strong> so với lãi suất nội tệ <strong>${pct(a.RT, 2)}</strong> → Hành động tối ưu: <strong>${a.arbDecision}</strong> với biên lợi nhuận phi rủi ro <strong>${(a.arbProfitPerUnit * 100).toFixed(4)}%/kỳ</strong>.`
    ];

    return boxHTML("Các phép đo Lãi suất, LSHVBQ & Arbitrage (Chương 2)", summary, bullets, "badge-info", "Định giá vốn & Arbitrage");
  }

  // 7. Thuyết minh Chương 3 & 4: Rủi ro Lãi suất (GAP, Duration, Convexity & Phái sinh)
  function explainRateRisk(res, deltaR) {
    const d = res.duration;
    const gapSign = res.cgap1Y < 0 ? "âm (TSN nhạy cảm lớn hơn TSC nhạy cảm)" : "dương (TSC nhạy cảm lớn hơn TSN nhạy cảm)";
    const impactDir = d.dE < 0 ? "bị suy giảm" : "được gia tăng";
    const eqPct = (d.dE / Math.max(1e-6, d.E)) * 100;

    const summary = `Với cú sốc lãi suất <strong>ΔR = ${Number(deltaR) >= 0 ? "+" : ""}${deltaR}%</strong>, mô hình định giá lại ghi nhận <strong>ΔNII = ${res.dNii1Y >= 0 ? "+" : ""}${num(res.dNii1Y, 3)} Tr. USD</strong>, còn mô hình Thời lượng (Duration) cho thấy vốn tự có ${impactDir} <strong>${d.dE >= 0 ? "+" : ""}${d.dE.toFixed(2)} Tr. USD (${eqPct >= 0 ? "+" : ""}${eqPct.toFixed(1)}% VTC)</strong>.`;

    const bullets = [
      `<strong>Mô hình Định giá lại (GAP):</strong> CGAP tích lũy 1 năm = <strong>${num(res.cgap1Y, 1)} Tr. USD</strong> — trạng thái ${gapSign}. Khi lãi suất tăng, GAP âm sẽ làm chi phí huy động tăng nhanh hơn thu nhập cho vay, khiến thu nhập lãi ròng giảm.`,
      `<strong>Mô hình Thời lượng (Duration) &amp; Miễn nhiễm rủi ro:</strong> Chênh lệch thời lượng đã điều chỉnh đòn bẩy <code>D_A - k·D_L</code> = <strong>${d.dGap.toFixed(2)} năm</strong>. Để miễn nhiễm hoàn toàn (<code>ΔE = 0</code>), nhà quản trị có thể <strong>giảm D_A xuống ${d.immunizeDA.toFixed(2)} năm</strong> hoặc <strong>kéo dài D_L lên ${d.immunizeDL.toFixed(2)} năm</strong>.`,
      `<strong>Hiệu ứng Độ lồi (Convexity):</strong> Trái phiếu chuẩn 6 năm có thời lượng <strong>D = ${res.convexity.bondD.toFixed(2)} năm</strong> và độ lồi <strong>CX = ${res.convexity.CX.toFixed(1)}</strong>. Nhờ độ lồi dương, khi lãi suất tăng mạnh thì giá thực tế giảm <em>ít hơn</em> dự báo tuyến tính, còn khi lãi suất giảm thì giá tăng <em>nhanh hơn</em>.`,
      `<strong>Phòng ngừa Phái sinh (Chương 4):</strong> Tại mức lãi suất thả nổi hiện hành, hợp đồng Swap (trả cố định / nhận thả nổi) tạo dòng tiền ròng <strong>${res.derivatives.swapNet >= 0 ? "+" : ""}${res.derivatives.swapNet.toFixed(2)} Tr. USD</strong>; quyền chọn trần <strong>Cap</strong> giúp khóa cứng chi phí vay tối đa, còn chiến lược <strong>Collar</strong> (mua Cap + bán Floor) giúp giảm phí mua quyền chọn.`
    ];

    const cls = Math.abs(eqPct) > 15 ? "badge-danger" : (Math.abs(eqPct) > 5 ? "badge-warning" : "badge-success");
    return boxHTML("Lượng hóa & Phòng ngừa Rủi ro Lãi suất (Chương 3–4)", summary, bullets, cls, Math.abs(eqPct) > 15 ? "Biến động VTC lớn" : "Rủi ro kiểm soát được");
  }

  // 8. Thuyết minh Chương 5, 7, 9: Ngoại hối, Thanh khoản & Chứng khoán hóa CMO
  function explainFxLiqSec(res, shockPct) {
    const fx = res.fx, liq = res.liquidity, cmo = res.cmo;
    const summary = `Trạng thái ngoại tệ ròng đang ở mức <strong>${fx.netFxPos >= 0 ? "+" : ""}${num(fx.netFxPos, 1)} Tr. USD</strong>; tỷ lệ khả năng chi trả ngay đạt <strong>${liq.immediateRatio.toFixed(2)}x</strong> (${liq.immediateRatio >= 1 ? "đạt chuẩn NHNN ≥ 1,0" : "dưới chuẩn thanh khoản tối thiểu"}).`;

    const bullets = [
      `<strong>Rủi ro Ngoại hối (Chương 5):</strong> Ngân hàng đang giữ <em>${fx.fxStatus}</em>. Khi tỷ giá biến động <strong>${Number(shockPct) >= 0 ? "+" : ""}${shockPct}%</strong> (về mức ${num(fx.newSpot, 0)} VND/USD), khoản lãi/lỗ quy đổi đạt <strong>${fx.fxPnlVnd >= 0 ? "+" : ""}${num(fx.fxPnlVnd / 1000, 2)} Tỷ VND</strong>. Để phòng ngừa triệt để cần cân xứng cả số lượng lẫn kỳ hạn ngoại tệ.`,
      `<strong>Rủi ro Thanh khoản (Chương 7):</strong> Độ lệch tài trợ (<code>Loans - Core Deposits</code>) = <strong>${num(liq.financingGap, 0)}</strong> (${liq.financingGap > 0 ? "ngân hàng phải đi vay thêm trên thị trường tiền tệ để tài trợ cho phần dư nợ vượt tiền gửi cốt lõi" : "tiền gửi cốt lõi dư sức tài trợ cho hoạt động cho vay"}). Trạng thái thanh khoản ròng (Cung – Cầu) = <strong>${liq.netLiquidityPos >= 0 ? "+" : ""}${num(liq.netLiquidityPos, 0)}</strong>.`,
      `<strong>Chứng khoán hóa CMO &amp; Tách IO / PO (Chương 9):</strong> Dòng tiền trả gốc (kể cả hoàn trả trước hạn) được ưu tiên thanh toán tuần tự theo thác nước: trả hết <strong>Hạng A</strong> (ngắn hạn, rủi ro trả trước cao) → chuyển sang <strong>Hạng B</strong> → cuối cùng là <strong>Hạng C</strong> (dài hạn). Hiện giá tách rời đạt <strong>PV(IO - chỉ hưởng lãi) = ${num(cmo.pvIO, 1)} Tr.</strong> và <strong>PV(PO - chỉ hưởng gốc) = ${num(cmo.pvPO, 1)} Tr. USD</strong>.`
    ];

    const cls = liq.immediateRatio >= 1 && liq.netLiquidityPos >= 0 ? "badge-success" : "badge-danger";
    return boxHTML("Ngoại hối, Thanh khoản & Chứng khoán hóa (Chương 5–7–9)", summary, bullets, cls, liq.immediateRatio >= 1 ? "Thanh khoản đảm bảo" : "Cảnh báo thanh khoản");
  }

  // 9. Thuyết minh Chương 10 & 11: An toàn Vốn (CAR) & CAMEL
  function explainCarCamel(res) {
    const c = res.car, r = res.ratios, cm = res.camel;
    const pillars = [
      { name: "C — An toàn vốn", s: cm.rateC },
      { name: "A — Chất lượng tài sản", s: cm.rateA },
      { name: "M — Năng lực quản trị", s: cm.rateM },
      { name: "E — Khả năng sinh lời", s: cm.rateE },
      { name: "L — Thanh khoản", s: cm.rateL }
    ].sort((a, b) => a.s - b.s);
    const strongest = pillars[0];
    const weakest = pillars[pillars.length - 1];

    const summary = `Ngân hàng đạt <strong>CAR chịu rủi ro = ${pct(c.riskBasedCar, 2)}</strong> (so với ngưỡng tối thiểu 8%) và điểm tổng hợp <strong>CAMEL = ${cm.composite.toFixed(2)} — ${cm.camelGrade}</strong>.`;

    const bullets = [
      `<strong>An toàn vốn (Chương 10):</strong> Tổng tài sản quy đổi rủi ro <strong>RWA = ${num(c.totalRwa, 0)}</strong> (trong đó nội bảng: ${num(c.rwaOn, 0)}, ngoại bảng sau hệ số chuyển đổi CCF: ${num(c.rwaOff, 0)}). Tỷ lệ CAR đơn giản là <strong>${pct(c.simpleCar, 2)}</strong>; sau khi điều chỉnh trọng số rủi ro đạt <strong>${pct(c.riskBasedCar, 2)}</strong> (${c.carStatus}).`,
      `<strong>Phân tích sinh lời DuPont (Chương 11):</strong> <strong>ROA = ${pct(r.roa, 2)}</strong> kết hợp đòn bẩy vốn chủ sở hữu <strong>EM = ${r.em.toFixed(2)}x</strong> tạo ra <strong>ROE = ${pct(r.roe, 2)}</strong>. Biên lãi ròng <strong>NIM = ${pct(r.nim, 2)}</strong> và tỷ lệ chi phí trên thu nhập <strong>CIR = ${pct(r.cir, 1)}</strong> (${r.cir <= 0.45 ? "kiểm soát chi phí hoạt động rất hiệu quả" : "cần tối ưu hóa chi phí vận hành"}).`,
      `<strong>Chẩn đoán 5 trụ cột CAMEL:</strong> Trụ cột vững nhất là <strong>${strongest.name}</strong> (hạng ${strongest.s}/5); trụ cột cần ưu tiên cải thiện là <strong>${weakest.name}</strong> (hạng ${weakest.s}/5).`
    ];

    return boxHTML("An toàn Vốn (CAR) & Khung Đánh giá CAMEL (Chương 10–11)", summary, bullets, cm.camelCls, cm.camelGrade);
  }

  // 10. Thuyết minh Tổng hợp Toàn ngân hàng (Tab 1)
  function explainOverview(state) {
    if (!state.sc || !state.corp || !state.b3 || !state.npl || !state.rr || !state.cc) return "";
    const alerts = [];
    if (state.sc.psi >= 0.25) alerts.push(`Scorecard PSI (${state.sc.psi.toFixed(3)}) vượt ngưỡng 0,25`);
    if (state.npl.nplRatio > 0.03) alerts.push(`Tỷ lệ Nợ xấu NPL (${pct(state.npl.nplRatio, 2)}) vượt ngưỡng 3%`);
    if (!state.b3.allPass) alerts.push("Có chỉ tiêu Basel III chưa đạt chuẩn tối thiểu");
    if (state.fxliq && state.fxliq.liquidity.immediateRatio < 1) alerts.push("Tỷ lệ chi trả ngay dưới chuẩn 1,0x");
    if (state.cc.car.riskBasedCar < 0.08) alerts.push(`CAR (${pct(state.cc.car.riskBasedCar, 2)}) dưới chuẩn 8%`);

    const summary = alerts.length === 0
      ? `Bức tranh quản trị rủi ro tổng thể của ngân hàng đang ở trạng thái <strong>lành mạnh và cân bằng</strong> trên cả 4 trụ cột: Tín dụng, Lãi suất, Thanh khoản và An toàn vốn.`
      : `Hệ thống ghi nhận <strong>${alerts.length} điểm cảnh báo rủi ro cần ưu tiên xử lý</strong>: ${alerts.join("; ")}.`;

    const bullets = [
      `<strong>Rủi ro Tín dụng:</strong> Mô hình Scorecard đạt <strong>Gini = ${pct(state.sc.valMetrics.gini, 1)}</strong>, <strong>KS = ${pct(state.sc.valMetrics.ks, 1)}</strong>; danh mục có <strong>NPL = ${pct(state.npl.nplRatio, 2)}</strong>; khách hàng doanh nghiệp mẫu có <strong>Altman Z = ${state.corp.Z.score.toFixed(2)}</strong> (${state.corp.Z.zone.label}).`,
      `<strong>Rủi ro Thị trường &amp; Lãi suất:</strong> Với cú sốc lãi suất hiện tại, vốn tự có biến động <strong>${state.rr.duration.dE >= 0 ? "+" : ""}${state.rr.duration.dE.toFixed(2)} Tr. USD</strong> theo mô hình Duration; trạng thái ngoại tệ ròng là <strong>${state.fxliq.fx.netFxPos >= 0 ? "+" : ""}${state.fxliq.fx.netFxPos} Tr. USD</strong>.`,
      `<strong>An toàn vốn &amp; Xếp hạng tổng thể:</strong> CAR chịu rủi ro đạt <strong>${pct(state.cc.car.riskBasedCar, 2)}</strong>, xếp hạng tổng hợp <strong>${state.cc.camel.camelGrade}</strong> (CAMEL = ${state.cc.camel.composite.toFixed(2)}), ROE = <strong>${pct(state.cc.ratios.roe, 1)}</strong>.`
    ];

    return boxHTML("Báo cáo Điều hành Tổng hợp Toàn hệ thống", summary, bullets, alerts.length === 0 ? "badge-success" : "badge-warning", alerts.length === 0 ? "Hệ thống An toàn" : `${alerts.length} Cảnh báo ưu tiên`);
  }

  global.NarrativeEngine = {
    explainScorecard,
    explainCorporate,
    explainConsumer,
    explainBaselAll,
    explainProjectAndNpl,
    explainInterest,
    explainRateRisk,
    explainFxLiqSec,
    explainCarCamel,
    explainOverview
  };
})(window);

/* bi_dashboard.js v2.7 — Tab 0: Power BI + Data Analyst Executive Dashboard */
(function (global) {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const fmtPct = (v, d = 2) => (isFinite(v) ? `${(v * 100).toFixed(d)}%` : "--");
  const fmtNum = (v, d = 2) => (isFinite(v) ? Number(v).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }) : "--");

  const biFilters = {
    pillar: "all",       // all | credit | market | capital
    scenario: "base",    // base | mild | severe
    gradeGroup: "all"    // all | safe | mid | high
  };

  let lastState = null;

  function getScenarioMultipliers(scenario) {
    if (scenario === "mild") {
      return { name: "Căng thẳng nhẹ (Mild Stress)", nplMult: 1.35, rateAdd: 1.5, fxAdd: -3.0, lcrMult: 0.90, carAdd: -0.012, badRateMult: 1.25 };
    }
    if (scenario === "severe") {
      return { name: "Khủng hoảng (Severe Stress)", nplMult: 2.0, rateAdd: 3.0, fxAdd: -6.0, lcrMult: 0.78, carAdd: -0.028, badRateMult: 1.65 };
    }
    return { name: "Cơ sở (Base Case)", nplMult: 1.0, rateAdd: 0.0, fxAdd: 0.0, lcrMult: 1.0, carAdd: 0.0, badRateMult: 1.0 };
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function renderBIDashboard(state) {
    if (!state || !state.sc || !state.corp || !state.b3 || !state.npl || !state.rr || !state.cc || !state.fxliq) return;
    lastState = state;

    const scen = getScenarioMultipliers(biFilters.scenario);

    // Áp dụng kịch bản Stress Test lên các chỉ tiêu hiển thị trên Dashboard BI
    const gini = state.sc.valMetrics.gini;
    const ks = state.sc.valMetrics.ks;
    const psi = state.sc.psi;
    const nplRatio = state.npl.nplRatio * scen.nplMult;
    const carRatio = Math.max(0.02, state.cc.car.riskBasedCar + scen.carAdd);
    const cet1Ratio = Math.max(0.02, state.b3.cet1Ratio + scen.carAdd * 0.85);
    const lcrRatio = state.b3.lcr * scen.lcrMult;
    const nsfrRatio = state.b3.nsfr * (0.5 + 0.5 * scen.lcrMult);
    const immLiq = state.fxliq.liquidity.immediateRatio * scen.lcrMult;
    const dE = state.rr.duration.dE + (scen.rateAdd > 0 ? -(state.rr.duration.dGap * state.rr.duration.A * (scen.rateAdd / 100) / 1.1) : 0);
    const roe = Math.max(-0.2, state.cc.ratios.roe - (scen.nplMult - 1) * 0.06);

    // Tính điểm sức khỏe 6 trụ cột (0 - 100)
    const sScorecard = clamp(Math.round((gini / 0.55) * 70 + (psi < 0.1 ? 30 : (psi < 0.25 ? 18 : 5))), 10, 100);
    const sNpl       = clamp(Math.round(100 - (nplRatio * 100) * 14), 10, 100);
    const sCorp      = clamp(Math.round((state.corp.Z.score / 3.5) * 100), 10, 100);
    const sMarket    = clamp(Math.round(100 - Math.abs(dE / Math.max(1, state.rr.duration.E)) * 120), 10, 100);
    const sLiq       = clamp(Math.round(Math.min(100, (lcrRatio / 1.2) * 55 + (immLiq / 1.15) * 45)), 10, 100);
    const sCapital   = clamp(Math.round(Math.min(100, (carRatio / 0.12) * 55 + (cet1Ratio / 0.095) * 45)), 10, 100);

    const overallHealth = Math.round((sScorecard + sNpl + sCorp + sMarket + sLiq + sCapital) / 6);
    const healthBadge = overallHealth >= 80 ? { txt: "Vững mạnh", cls: "badge-success" }
                      : (overallHealth >= 65 ? { txt: "Ổn định", cls: "badge-info" }
                      : (overallHealth >= 50 ? { txt: "Cảnh báo", cls: "badge-warning" } : { txt: "Rủi ro cao", cls: "badge-danger" }));

    // 1. Cập nhật 6 thẻ Power BI KPI Cards
    $("bi_health_val").textContent = `${overallHealth} / 100`;
    $("bi_health_bar").style.width = `${overallHealth}%`;
    $("bi_health_sub").innerHTML = `<span class="badge ${healthBadge.cls}">${healthBadge.txt}</span> • ${scen.name}`;

    $("bi_gini_val").textContent = `${fmtPct(gini, 1)} / ${fmtPct(ks, 1)}`;
    $("bi_gini_bar").style.width = `${clamp(gini * 160, 10, 100)}%`;
    $("bi_gini_sub").textContent = `PSI = ${psi.toFixed(4)} (${psi < 0.1 ? "Ổn định" : "Cần theo dõi"}) • HHI = ${state.sc.hhi.toFixed(3)}`;

    $("bi_npl_val").textContent = fmtPct(nplRatio, 2);
    $("bi_npl_bar").style.width = `${clamp((nplRatio / 0.06) * 100, 5, 100)}%`;
    $("bi_npl_bar").className = `bi-progress-fill ${nplRatio <= 0.03 ? "fill-ok" : (nplRatio <= 0.05 ? "fill-warn" : "fill-bad")}`;
    $("bi_npl_sub").textContent = nplRatio <= 0.03 ? "Đạt chuẩn kiểm soát (≤ 3,0%)" : "Vượt ngưỡng cảnh báo 3,0%";

    $("bi_car_val").textContent = `${fmtPct(carRatio, 1)} / ${fmtPct(cet1Ratio, 1)}`;
    $("bi_car_bar").style.width = `${clamp((carRatio / 0.15) * 100, 10, 100)}%`;
    $("bi_car_bar").className = `bi-progress-fill ${carRatio >= 0.08 && cet1Ratio >= state.b3.reqCet1 ? "fill-ok" : "fill-bad"}`;
    $("bi_car_sub").textContent = `CAR ≥ 8% | CET1 ≥ ${fmtPct(state.b3.reqCet1, 1)} (Basel III)`;

    $("bi_liq_val").textContent = `${fmtPct(lcrRatio, 0)} / ${immLiq.toFixed(2)}x`;
    $("bi_liq_bar").style.width = `${clamp((lcrRatio / 1.4) * 100, 10, 100)}%`;
    $("bi_liq_bar").className = `bi-progress-fill ${lcrRatio >= 1.0 && immLiq >= 1.0 ? "fill-ok" : "fill-bad"}`;
    $("bi_liq_sub").textContent = `LCR ≥ 100% | NSFR = ${fmtPct(nsfrRatio, 0)} | Chi trả ≥ 1,0x`;

    $("bi_mkt_val").textContent = `${dE >= 0 ? "+" : ""}${dE.toFixed(2)} Tr.`;
    $("bi_mkt_bar").style.width = `${sMarket}%`;
    $("bi_mkt_bar").className = `bi-progress-fill ${sMarket >= 70 ? "fill-ok" : (sMarket >= 45 ? "fill-warn" : "fill-bad")}`;
    $("bi_mkt_sub").textContent = `ΔE Duration | ROE dự kiến: ${fmtPct(roe, 1)}`;

    // Tính trước dữ liệu lọc Master Scale ở phạm vi ngoài để dùng chung cho Biểu đồ & Thuyết minh
    let filteredGrades = state.sc.masterScale.map((m, idx) => ({ ...m, idx }));
    if (biFilters.gradeGroup === "safe") filteredGrades = filteredGrades.filter(m => m.idx <= 3);
    else if (biFilters.gradeGroup === "mid") filteredGrades = filteredGrades.filter(m => m.idx >= 4 && m.idx <= 6);
    else if (biFilters.gradeGroup === "high") filteredGrades = filteredGrades.filter(m => m.idx >= 7);

    const totVol = filteredGrades.reduce((s, m) => s + m.total, 0);
    const totBad = filteredGrades.reduce((s, m) => s + m.bads, 0);
    const grpBadRate = totVol > 0 ? Math.min(0.99, (totBad / totVol) * scen.badRateMult) : 0;
    if ($("biGradeFilterSummary")) {
      $("biGradeFilterSummary").textContent = `Đang lọc ${filteredGrades.length} hạng: ${totVol.toLocaleString("vi-VN")} KH | Bad Rate bình quân: ${fmtPct(grpBadRate, 2)}`;
    }

    // 2. Biểu đồ BI #1: Radar Sức khỏe 6 Trụ cột
    const renderChartFn = global.ChartStudio ? global.ChartStudio.render : null;
    if (renderChartFn) {
      renderChartFn("chartBiRadar", {
        type: "radar",
        data: {
          labels: ["Scorecard (Gini/PSI)", "Chất lượng nợ (NPL)", "DN (Altman Z)", "Lãi suất & GAP", "Thanh khoản & FX", "Vốn Basel III & CAR"],
          datasets: [
            {
              label: `Điểm Thực tế (${scen.name})`,
              data: [sScorecard, sNpl, sCorp, sMarket, sLiq, sCapital],
              backgroundColor: "rgba(29, 78, 216, 0.22)",
              borderColor: "#1d4ed8",
              pointBackgroundColor: "#1d4ed8",
              borderWidth: 2.5
            },
            {
              label: "Ngưỡng chuẩn an toàn (75đ)",
              data: [75, 75, 75, 75, 75, 75],
              backgroundColor: "rgba(16, 185, 129, 0.08)",
              borderColor: "#059669",
              borderDash: [5, 4],
              pointRadius: 0,
              borderWidth: 1.8
            }
          ]
        },
        options: { scales: { r: { min: 0, max: 100, ticks: { stepSize: 25 } } } }
      });

      // 3. Biểu đồ BI #2: Cross-filtered Master Scale theo Grade Slicer

      renderChartFn("chartBiCreditMix", {
        data: {
          labels: filteredGrades.map(m => m.grade),
          datasets: [
            {
              type: "bar",
              label: "Số lượng Khách hàng (Volume)",
              data: filteredGrades.map(m => m.total),
              backgroundColor: "rgba(56, 189, 248, 0.55)",
              borderColor: "#0284c7",
              borderWidth: 1,
              yAxisID: "y"
            },
            {
              type: "line",
              label: "Tỷ lệ Nợ xấu — Bad Rate (%)",
              data: filteredGrades.map(m => +(Math.min(99, m.badRate * 100 * scen.badRateMult)).toFixed(2)),
              borderColor: "#be123c",
              backgroundColor: "#ffffff",
              pointRadius: 5,
              pointBorderWidth: 2.5,
              borderWidth: 3,
              yAxisID: "y1"
            }
          ]
        },
        options: {
          scales: {
            y: { position: "left", title: { display: true, text: "Volume (KH)" } },
            y1: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Bad Rate (%)" } }
          }
        }
      }, { masterScale: filteredGrades });

      // 4. Biểu đồ BI #3: Stress Test So sánh Cơ sở vs Kịch bản đang chọn
      renderChartFn("chartBiCapitalStress", {
        type: "bar",
        data: {
          labels: ["CET1 (%)", "CAR (%)", "NPL (%)", "LCR (÷10 %)", "NSFR (÷10 %)", "ROE (%)"],
          datasets: [
            {
              label: "Kịch bản Cơ sở (Base)",
              data: [
                +(state.b3.cet1Ratio * 100).toFixed(2),
                +(state.cc.car.riskBasedCar * 100).toFixed(2),
                +(state.npl.nplRatio * 100).toFixed(2),
                +(state.b3.lcr * 10).toFixed(2),
                +(state.b3.nsfr * 10).toFixed(2),
                +(state.cc.ratios.roe * 100).toFixed(2)
              ],
              backgroundColor: "rgba(148, 163, 184, 0.7)"
            },
            {
              label: scen.name,
              data: [
                +(cet1Ratio * 100).toFixed(2),
                +(carRatio * 100).toFixed(2),
                +(nplRatio * 100).toFixed(2),
                +(lcrRatio * 10).toFixed(2),
                +(nsfrRatio * 10).toFixed(2),
                +(roe * 100).toFixed(2)
              ],
              backgroundColor: biFilters.scenario === "base" ? "#1d4ed8" : (biFilters.scenario === "mild" ? "#d97706" : "#dc2626")
            }
          ]
        },
        options: {}
      });

      // 5. Biểu đồ BI #4: Cơ cấu RWA & Phơi nhiễm
      renderChartFn("chartBiRwaMix", {
        type: "doughnut",
        data: {
          labels: ["RWA Nội bảng (C10)", "RWA Ngoại bảng CCF (C10)", "RWA Basel II IRB (×100)", "Nợ xấu Nhóm 3–5"],
          datasets: [{
            label: "Quy mô Rủi ro",
            data: [
              Math.round(state.cc.car.rwaOn),
              Math.round(state.cc.car.rwaOff),
              Math.round(state.irb ? state.irb.RWA * 100 : 3900),
              Math.round(state.npl.npl)
            ],
            backgroundColor: ["#1d4ed8", "#0f766e", "#7c3aed", "#dc2626"]
          }]
        },
        options: {}
      });
    }

    // 3. Bảng Ma trận Giám sát Rủi ro Data Analyst (lọc theo Pillar Slicer)
    const matrixRows = [
      { pillar: "credit", pillarName: "Tín dụng", metric: "Credit Scorecard (Gini / KS)", val: `${fmtPct(gini, 1)} / ${fmtPct(ks, 1)}`, bench: "Gini ≥ 30%", score: sScorecard, ok: gini >= 0.30, tab: "tab-credit-all", block: "sec-scorecard" },
      { pillar: "credit", pillarName: "Tín dụng", metric: "Ổn định quần thể (PSI)", val: psi.toFixed(4), bench: "< 0,10 (Tốt)", score: psi < 0.1 ? 95 : (psi < 0.25 ? 65 : 30), ok: psi < 0.25, tab: "tab-credit-all", block: "sec-scorecard" },
      { pillar: "credit", pillarName: "Tín dụng", metric: "Altman Z-Score (DN SX)", val: state.corp.Z.score.toFixed(2), bench: "> 2,99 An toàn", score: sCorp, ok: state.corp.Z.score > 1.8, tab: "tab-credit-all", block: "sec-corporate" },
      { pillar: "credit", pillarName: "Tín dụng", metric: "PD Tích lũy 3 năm (Term Struct.)", val: state.ts ? fmtPct(state.ts.years[2].cumPD, 2) : "--", bench: "< 15%", score: state.ts ? clamp(Math.round(100 - state.ts.years[2].cumPD * 300), 20, 100) : 70, ok: !state.ts || state.ts.years[2].cumPD < 0.15, tab: "tab-credit-all", block: "sec-basel" },
      { pillar: "credit", pillarName: "Tín dụng", metric: "Tỷ lệ Nợ xấu (NPL Nhóm 3–5)", val: fmtPct(nplRatio, 2), bench: "≤ 3,0%", score: sNpl, ok: nplRatio <= 0.03, tab: "tab-credit-all", block: "sec-project" },
      { pillar: "market", pillarName: "Lãi suất & FX", metric: "Lãi suất Hòa vốn (LSHVBQ)", val: state.ch2 ? `${fmtPct(state.ch2.avgLshvbq, 3)}/th` : "--", bench: "Tối ưu vốn rẻ", score: 82, ok: true, tab: "tab-interest", block: null },
      { pillar: "market", pillarName: "Lãi suất & FX", metric: "Biến động Vốn ΔE (Duration)", val: `${dE >= 0 ? "+" : ""}${dE.toFixed(2)} Tr.`, bench: "|ΔE/E| ≤ 15%", score: sMarket, ok: Math.abs(dE / Math.max(1, state.rr.duration.E)) <= 0.15, tab: "tab-raterisk", block: null },
      { pillar: "market", pillarName: "Lãi suất & FX", metric: "Trạng thái Ngoại tệ ròng (FX)", val: `${state.fxliq.fx.netFxPos >= 0 ? "+" : ""}${state.fxliq.fx.netFxPos} Tr. USD`, bench: "Cân xứng kỳ hạn", score: 76, ok: true, tab: "tab-fxliq", block: null },
      { pillar: "capital", pillarName: "Vốn & Thanh khoản", metric: "Basel III CET1 / LCR", val: `${fmtPct(cet1Ratio, 1)} / ${fmtPct(lcrRatio, 0)}`, bench: `≥ ${fmtPct(state.b3.reqCet1, 1)} / ≥ 100%`, score: Math.round((sCapital + sLiq) / 2), ok: cet1Ratio >= state.b3.reqCet1 && lcrRatio >= 1.0, tab: "tab-credit-all", block: "sec-basel" },
      { pillar: "capital", pillarName: "Vốn & Thanh khoản", metric: "CAR Chịu rủi ro & CAMEL", val: `${fmtPct(carRatio, 1)} / ${state.cc.camel.composite.toFixed(2)}`, bench: "CAR ≥ 8% | Hạng 1–2", score: sCapital, ok: carRatio >= 0.08, tab: "tab-carcamel", block: null }
    ];

    const visibleRows = biFilters.pillar === "all" ? matrixRows : matrixRows.filter(r => r.pillar === biFilters.pillar);
    $("tblBiMatrix").innerHTML = visibleRows.map(r => `
      <tr>
        <td><span class="badge badge-info">${r.pillarName}</span></td>
        <td><strong>${r.metric}</strong></td>
        <td class="num"><strong>${r.val}</strong></td>
        <td class="num">${r.bench}</td>
        <td style="min-width:130px;">
          <div class="bi-mini-bar"><div class="bi-progress-fill ${r.score >= 75 ? "fill-ok" : (r.score >= 50 ? "fill-warn" : "fill-bad")}" style="width:${r.score}%"></div></div>
        </td>
        <td><span class="badge ${r.ok ? "badge-success" : "badge-danger"}">${r.ok ? "Đạt chuẩn" : "Cảnh báo"}</span></td>
        <td class="num">
          <button type="button" class="ct-btn" onclick="window.BIDashboard.jumpTo('${r.tab}', '${r.block || ""}')">Mở chi tiết →</button>
        </td>
      </tr>
    `).join("");

    // 4. Thuyết minh Data Analyst cho Tab 0
    const failedCount = matrixRows.filter(r => !r.ok).length;
    const weakestPillar = [
      { n: "Scorecard", s: sScorecard }, { n: "Nợ xấu NPL", s: sNpl }, { n: "Doanh nghiệp Altman Z", s: sCorp },
      { n: "Lãi suất & GAP", s: sMarket }, { n: "Thanh khoản & FX", s: sLiq }, { n: "Vốn Basel III & CAR", s: sCapital }
    ].sort((a, b) => a.s - b.s)[0];

    const biNarrative = $("insight_bi_dashboard");
    if (biNarrative) {
      biNarrative.innerHTML = `
        <div class="insight-head">
          <span class="insight-title">📊 Nhận định Data Analyst — Kịch bản: ${scen.name}</span>
          <span class="badge ${failedCount === 0 ? "badge-success" : "badge-warning"}">${failedCount === 0 ? "10/10 chỉ tiêu đạt chuẩn" : `${failedCount}/10 chỉ tiêu cần hành động`}</span>
        </div>
        <p class="insight-summary">
          Chỉ số sức khỏe rủi ro tổng hợp toàn ngân hàng đạt <strong>${overallHealth}/100 điểm</strong> (<em>${healthBadge.txt}</em>).
          Dưới kịch bản <strong>${scen.name}</strong>, tỷ lệ nợ xấu ở mức <strong>${fmtPct(nplRatio, 2)}</strong>, CAR đạt <strong>${fmtPct(carRatio, 2)}</strong> và thanh khoản LCR đạt <strong>${fmtPct(lcrRatio, 1)}</strong>.
        </p>
        <ul class="insight-list">
          <li><strong>Trọng tâm ưu tiên (Bottleneck):</strong> Trụ cột có điểm thấp nhất hiện là <strong>${weakestPillar.n} (${weakestPillar.s}/100đ)</strong> — bạn có thể bấm nút <em>"Mở chi tiết →"</em> ở bảng ma trận phía trên để điều chỉnh tham số trực tiếp.</li>
          <li><strong>Phân tích phân khúc đang lọc:</strong> Bộ lọc <em>Master Scale</em> đang chọn <strong>${filteredGrades.length} hạng</strong> với <strong>${totVol.toLocaleString("vi-VN")} khách hàng</strong> và Bad Rate bình quân <strong>${fmtPct(grpBadRate, 2)}</strong>.</li>
          <li><strong>Khuyến nghị điều hành:</strong> ${biFilters.scenario === "base" ? "Duy trì khẩu vị rủi ro hiện tại, thử chuyển bộ lọc kịch bản sang Mild / Severe Stress để kiểm tra sức chịu đựng vốn (Stress Testing)." : `Trong kịch bản ${scen.name}, cần chủ động nâng điểm cắt Cut-off ở Tab 2.1, bổ sung bộ đệm vốn CET1 và thu hẹp chênh lệch Duration ở Tab 4.`}</li>
        </ul>
      `;
    }
  }

  function setFilter(key, val) {
    biFilters[key] = val;
    if (lastState) renderBIDashboard(lastState);
  }

  function resetFilters() {
    biFilters.pillar = "all";
    biFilters.scenario = "base";
    biFilters.gradeGroup = "all";
    if ($("biSlicerPillar")) $("biSlicerPillar").value = "all";
    if ($("biSlicerScenario")) $("biSlicerScenario").value = "base";
    if ($("biSlicerGrade")) $("biSlicerGrade").value = "all";
    if (lastState) renderBIDashboard(lastState);
  }

  function jumpTo(tabId, blockId) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (global.switchTab) global.switchTab(tabId, btn);
    if (blockId && global.scrollToBlock) {
      setTimeout(() => global.scrollToBlock(blockId), 80);
    }
  }

  function exportBICSV() {
    const rows = Array.from(document.querySelectorAll("#tblBiMatrix tr")).map(tr => {
      const tds = tr.querySelectorAll("td");
      if (tds.length < 6) return null;
      return [tds[0].innerText, tds[1].innerText, tds[2].innerText, tds[3].innerText, tds[5].innerText]
        .map(x => `"${String(x).replace(/"/g, '""')}"`).join(",");
    }).filter(Boolean);
    const csv = ["Tru cot,Chi tieu,Gia tri hien tai,Nguong chuan,Trang thai", ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Crisk-boy_BI_Report_${biFilters.scenario}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  global.BIDashboard = {
    render: renderBIDashboard,
    setFilter,
    resetFilters,
    jumpTo,
    exportBICSV
  };
})(window);

/* app.js — Điều khiển giao diện, Biểu đồ trực quan (Chart.js) & Nạp dữ liệu CSV/Excel (SheetJS) */
(function (global) {
  "use strict";

  const Engine = global.CreditModelsEngine;
  const BankEngine = global.BankRiskEngine;
  const Sample = global.CreditSampleData;
  const Narrative = global.NarrativeEngine;
  const liveState = {};

  const charts = {};
  let activeDataset = [];
  let lastScorecardResult = null;
  let qualState = JSON.parse(JSON.stringify(Sample.PRESETS.qualitative));

  // Helpers
  const $ = (id) => document.getElementById(id);
  const fmtNum = (v, dec = 2) => (isFinite(v) ? Number(v).toLocaleString("vi-VN", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : "--");
  const fmtPct = (v, dec = 2) => (isFinite(v) ? `${(v * 100).toFixed(dec)}%` : "--");

  function setStatus(id, text, type = "ok") {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = `status-msg status-${type}`;
  }


  function toggleInsights() {
    const hidden = document.body.classList.toggle("hide-insights");
    const btn = $("btnToggleInsights");
    if (btn) btn.textContent = hidden ? "📝 Hiện thuyết minh" : "📝 Ẩn thuyết minh";
  }

  function refreshOverviewInsight() {
    const el = $("insight_overview");
    if (el && Narrative) el.innerHTML = Narrative.explainOverview(liveState);
    if (global.BIDashboard) global.BIDashboard.render(liveState);
  }

  function refreshBaselInsight() {
    const el = $("insight_basel_all");
    if (el && Narrative && liveState.ts && liveState.irb && liveState.b3) {
      el.innerHTML = Narrative.explainBaselAll(liveState.ts, liveState.irb, liveState.b3);
    }
  }

  function refreshProjectNplInsight() {
    const el = $("insight_project_npl");
    if (el && Narrative && liveState.pf && liveState.rep && liveState.npl) {
      el.innerHTML = Narrative.explainProjectAndNpl(liveState.pf, liveState.rep, liveState.npl, $("pf_r").value);
    }
  }

  function renderChart(canvasId, config, meta = {}) {
    if (global.ChartStudio) {
      global.ChartStudio.render(canvasId, config, meta);
      return;
    }
    if (typeof Chart === "undefined") return;
    const canvas = $(canvasId);
    if (!canvas) return;
    if (charts[canvasId]) {
      charts[canvasId].destroy();
    }
    charts[canvasId] = new Chart(canvas.getContext("2d"), config);
  }

  // =========================================================================
  // ĐIỀU HƯỚNG TAB
  // =========================================================================
  function switchTab(tabId, btnEl) {
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    const panel = $(tabId);
    if (panel) panel.classList.add("active");
    if (btnEl) btnEl.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => {
      if (global.ChartStudio) global.ChartStudio.resizeAll();
      Object.values(charts).forEach(c => {
        if (c && typeof c.resize === "function") c.resize();
      });
    }, 40);
  }

  function scrollToBlock(blockId) {
    const el = $(blockId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function runCreditRiskSuiteUI() {
    try {
      setStatus("crSuiteStatus", "Đang chạy lại 5 khối Rủi ro Tín dụng...", "info");
      runScorecardUI();
      runCorporateUI();
      runConsumerUI();
      runTermStructureUI();
      runBaselUI();
      runBaselIIIUI();
      runProjectUI();
      runNplUI();
      setStatus("crSuiteStatus", "Đã cập nhật toàn bộ 5 khối Tín dụng!", "ok");
    } catch (err) {
      setStatus("crSuiteStatus", `Lỗi: ${err.message}`, "err");
    }
  }

  // =========================================================================
  // NẠP DỮ LIỆU CSV / EXCEL & TẢI FILE MẪU
  // =========================================================================
  function setActiveScorecardDataset(rows) {
    if (Array.isArray(rows) && rows.length) activeDataset = rows;
  }

  function handleFileUpload(file) {
    if (!file) return;
    if (global.DataImporter) {
      global.DataImporter.importExcelWorkbook(file);
      return;
    }
    try {
      setStatus("uploadStatus", `Đang đọc file ${file.name}...`, "info");
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          if (typeof XLSX === "undefined") {
            throw new Error("Thư viện SheetJS chưa nạp được (kiểm tra kết nối mạng).");
          }
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
          if (!rows.length) throw new Error("Tệp dữ liệu trống.");
          if (!("TARGET" in rows[0])) {
            throw new Error("Không tìm thấy cột 'TARGET' (0 = Tốt, 1 = Nợ xấu) trong file.");
          }
          activeDataset = rows;
          setStatus("uploadStatus", `Đã nạp thành công ${rows.length.toLocaleString("vi-VN")} dòng từ ${file.name}`, "ok");
          runScorecardUI();
        } catch (err) {
          setStatus("uploadStatus", `Lỗi đọc file: ${err.message}`, "err");
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setStatus("uploadStatus", `Lỗi: ${err.message}`, "err");
    }
  }

  function resetToSampleData() {
    activeDataset = Sample.generateHomeCreditSample(1500, 2026);
    setStatus("uploadStatus", `Đang dùng bộ dữ liệu mẫu Home Credit (${activeDataset.length} KH)`, "info");
    runScorecardUI();
  }

  function exportSampleCSV() {
    try {
      const rows = activeDataset.length ? activeDataset : Sample.generateHomeCreditSample(1500, 2026);
      const headers = Object.keys(rows[0]);
      const lines = [headers.join(",")];
      rows.forEach(r => lines.push(headers.map(h => r[h]).join(",")));
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "home_credit_sample_1500.csv";
      a.click();
      URL.revokeObjectURL(url);
      setStatus("globalStatus", "Đã tải file CSV mẫu!", "ok");
    } catch (err) {
      setStatus("globalStatus", `Lỗi xuất CSV: ${err.message}`, "err");
    }
  }

  // =========================================================================
  // TAB 2: CREDIT SCORECARD 8 BƯỚC
  // =========================================================================
  function runScorecardUI() {
    try {
      setStatus("scStatus", "Đang huấn luyện Logistic & WoE...", "info");
      const opts = {
        baseScore: Number($("scBaseScore").value) || 600,
        baseOdds: Number($("scBaseOdds").value) || 50,
        pdo: Number($("scPdo").value) || 20,
        ivThreshold: Number($("scIvThresh").value) || 0.02,
        trainRatio: Number($("scTrainRatio").value) || 0.7
      };
      const res = Engine.runCreditScorecardPipeline(activeDataset, opts);
      lastScorecardResult = res;
      liveState.sc = res;

      // KPIs
      $("scGini").textContent = `${fmtPct(res.trainMetrics.gini, 1)} / ${fmtPct(res.valMetrics.gini, 1)}`;
      $("scAuc").textContent = `AUC (Val): ${res.valMetrics.auc.toFixed(3)} | Bad Rate: ${fmtPct(res.overallBadRate, 1)}`;
      $("scKs").textContent = fmtPct(res.valMetrics.ks, 2);
      $("scKsPos").textContent = `Đạt đỉnh tại Top ${res.valMetrics.maxKSPct.toFixed(1)}% KH rủi ro nhất`;
      $("scPsi").textContent = res.psi.toFixed(4);
      const psiEval = res.psi < 0.1 ? "Ổn định (< 0.10)" : (res.psi < 0.25 ? "Biến động nhẹ (0.10–0.25)" : "Cảnh báo lệch (> 0.25)");
      $("scPsiBadge").textContent = psiEval;
      $("scHhi").textContent = res.hhi.toFixed(4);
      $("scHhiBadge").textContent = res.hhi < 0.15 ? "Phân bố đều tốt (< 0.15)" : "Tập trung cao";

      // Overview sync
      $("ovGiniKs").textContent = `${fmtPct(res.valMetrics.gini, 1)} / ${fmtPct(res.valMetrics.ks, 1)}`;
      $("ovScorecardMeta").textContent = `N=${res.nTotal} | AUC=${res.valMetrics.auc.toFixed(3)}`;
      $("ovPsiHhi").textContent = `${res.psi.toFixed(3)} / ${res.hhi.toFixed(3)}`;
      $("ovPsiStatus").textContent = psiEval;

      // 1. ROC Curve
      renderChart("chartRoc", {
        type: "line",
        data: {
          datasets: [
            {
              label: `ROC Curve (AUC = ${res.valMetrics.auc.toFixed(3)}, Gini = ${fmtPct(res.valMetrics.gini, 1)})`,
              data: res.valMetrics.rocPoints.map(p => ({ x: p.fpr, y: p.tpr })),
              borderColor: "#b91c1c",
              backgroundColor: "rgba(185, 28, 28, 0.12)",
              fill: true,
              pointRadius: 0,
              borderWidth: 2.5
            },
            {
              label: "Đoán mò (Random)",
              data: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
              borderColor: "#334155",
              borderDash: [6, 4],
              pointRadius: 0,
              borderWidth: 1.5
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { type: "linear", min: 0, max: 1, title: { display: true, text: "Tỷ lệ cảnh báo sai (FPR)" } },
            y: { min: 0, max: 1, title: { display: true, text: "Tỷ lệ bắt đúng Nợ xấu (TPR)" } }
          }
        }
      }, { rocInfo: { gini: res.valMetrics.gini, auc: res.valMetrics.auc } });

      // 2. KS Chart
      renderChart("chartKs", {
        type: "line",
        data: {
          datasets: [
            {
              label: "Nợ xấu tích lũy (Cum. Bads %)",
              data: res.valMetrics.ksCurve.map(p => ({ x: p.pct, y: p.cumBadPct })),
              borderColor: "#b91c1c",
              pointRadius: 0,
              borderWidth: 2.5
            },
            {
              label: "Nợ tốt tích lũy (Cum. Goods %)",
              data: res.valMetrics.ksCurve.map(p => ({ x: p.pct, y: p.cumGoodPct })),
              borderColor: "#0f172a",
              pointRadius: 0,
              borderWidth: 2.2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { type: "linear", min: 0, max: 100, title: { display: true, text: "% Khách hàng (Rủi ro cao → thấp)" } },
            y: { min: 0, max: 100, title: { display: true, text: "% Tích lũy" } }
          }
        }
      }, { ksInfo: { ks: res.valMetrics.ks, maxKSPct: res.valMetrics.maxKSPct } });

      // 3. Master Scale 10 Risk Grades (Volume Bars + Bad Rate % Line)
      renderChart("chartMasterScale", {
        data: {
          labels: res.masterScale.map(m => m.grade),
          datasets: [
            {
              type: "bar",
              label: "Số lượng Khách hàng (Volume)",
              data: res.masterScale.map(m => m.total),
              backgroundColor: "rgba(186, 230, 253, 0.85)",
              borderColor: "#38bdf8",
              borderWidth: 1,
              yAxisID: "y"
            },
            {
              type: "line",
              label: "Tỷ lệ Nợ xấu thực tế — Bad Rate (%)",
              data: res.masterScale.map(m => +(m.badRate * 100).toFixed(2)),
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
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { position: "left", title: { display: true, text: "Số lượng KH (Volume)" } },
            y1: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Bad Rate (%)" } }
          }
        }
      }, { masterScale: res.masterScale });

      // 4. IV Bar Chart
      renderChart("chartIv", {
        type: "bar",
        data: {
          labels: res.allFeatureSpecs.map(s => s.feature),
          datasets: [{
            label: "Information Value (IV)",
            data: res.allFeatureSpecs.map(s => +s.iv.toFixed(4)),
            backgroundColor: res.allFeatureSpecs.map(s => s.iv >= opts.ivThreshold ? "#1d4ed8" : "#94a3b8")
          }]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } }
        }
      });

      // 5. Tables
      $("tblMultivariate").innerHTML = res.modelSummary.map(m => `
        <tr>
          <td><strong>${m.feature}</strong></td>
          <td class="num">${m.iv.toFixed(4)}</td>
          <td>${m.monotonic}</td>
          <td class="num">${m.coef.toFixed(4)}</td>
          <td class="num"><span class="badge ${m.vif < 5 ? "badge-success" : "badge-warning"}">${m.vif.toFixed(2)}</span></td>
        </tr>
      `).join("");

      $("tblScorecardBins").innerHTML = res.scorecardTable.map(row => `
        <tr>
          <td><strong>${row.feature}</strong></td>
          <td>${row.bin}</td>
          <td class="num">${row.total}</td>
          <td class="num">${fmtPct(row.badRate, 2)}</td>
          <td class="num">${row.woe.toFixed(3)}</td>
          <td class="num"><strong>${row.points > 0 ? "+" + row.points : row.points}</strong></td>
        </tr>
      `).join("");

      // Cutoff slider range
      const slider = $("cutoffSlider");
      slider.min = res.scoreRange.min;
      slider.max = res.scoreRange.max;
      slider.value = Math.round((res.scoreRange.min + res.scoreRange.max) / 2);
      updateCutoffUI();

      setStatus("scStatus", `Hoàn tất (${res.modelSummary.length} biến đạt chuẩn IV)`, "ok");
    } catch (err) {
      setStatus("scStatus", `Lỗi Scorecard: ${err.message}`, "err");
    }
  }

  function updateCutoffUI() {
    if (!lastScorecardResult) return;
    const cutoff = Number($("cutoffSlider").value);
    $("cutoffValLabel").textContent = cutoff;
    const sim = Engine.simulateCutoff(lastScorecardResult.valScores, lastScorecardResult.valTargets, cutoff);
    $("cutApproval").textContent = `${fmtPct(sim.approvalRate, 1)} (${sim.approved}/${sim.total} KH)`;
    $("cutBadRate").textContent = fmtPct(sim.approvedBadRate, 2);
    $("cutCapture").textContent = fmtPct(sim.rejectedBadsCapture, 1);
    if ($("insight_scorecard") && Narrative) $("insight_scorecard").innerHTML = Narrative.explainScorecard(lastScorecardResult, sim, cutoff);
    refreshOverviewInsight();
  }

  // =========================================================================
  // TAB 3: DOANH NGHIỆP (ALTMAN Z, Z', Z'' + 5 NHÓM TỶ SỐ + 6C/5P/CAMPARI)
  // =========================================================================
  function initCorporateInputs() {
    const p = Sample.PRESETS.corporate;
    const map = {
      c_ca: p.currentAssets, c_inv: p.inventories, c_cash: p.cash, c_cl: p.currentLiabilities,
      c_ta: p.totalAssets, c_tl: p.totalLiabilities, c_ltd: p.longTermDebt, c_eq: p.totalEquity,
      c_re: p.retainedEarnings, c_sales: p.sales, c_cogs: p.cogs, c_rec: p.receivables,
      c_ebit: p.ebit, c_int: p.interestExpense, c_ni: p.netIncome, c_mve: p.marketValueEquity,
      c_shares: p.shares, c_price: p.stockPrice
    };
    Object.entries(map).forEach(([id, val]) => { if ($(id)) $(id).value = val; });
    renderQualitativeSliders();
  }

  function renderQualitativeSliders() {
    const wrap = $("qualSlidersWrap");
    if (!wrap) return;
    const c6Keys = Object.keys(qualState.c6);
    wrap.innerHTML = `
      <div style="font-size:0.85rem; font-weight:700; margin-bottom:8px;">Tiêu chuẩn 6C (Kéo thanh trượt để chấm điểm 1–10):</div>
      ${c6Keys.map(k => `
        <div class="range-row" style="margin-bottom:6px;">
          <span style="width:110px; font-size:0.84rem;">${k}</span>
          <input type="range" min="1" max="10" value="${qualState.c6[k]}" oninput="window.updateQualScore('${k}', this.value)" />
          <strong id="qv_${k}" style="width:26px; text-align:right;">${qualState.c6[k]}</strong>
        </div>
      `).join("")}
    `;
    renderQualitativeChart();
  }

  function updateQualScore(key, val) {
    qualState.c6[key] = Number(val);
    if ($("qv_" + key)) $("qv_" + key).textContent = val;
    renderQualitativeChart();
    if (liveState.corp && $("insight_corporate") && Narrative) $("insight_corporate").innerHTML = Narrative.explainCorporate(liveState.corp, qualState);
  }

  function renderQualitativeChart() {
    const c6Vals = Object.values(qualState.c6);
    const avgC6 = c6Vals.reduce((a, b) => a + b, 0) / c6Vals.length;
    const avgP5 = Object.values(qualState.p5).reduce((a, b) => a + b, 0) / 5;
    const avgCam = Object.values(qualState.campari).reduce((a, b) => a + b, 0) / 7;
    $("qualSummaryBadge").textContent = `6C: ${avgC6.toFixed(1)}/10 | 5P: ${avgP5.toFixed(1)}/10 | CAMPARI: ${avgCam.toFixed(1)}/10`;

    renderChart("chartQualitative", {
      type: "radar",
      data: {
        labels: Object.keys(qualState.c6),
        datasets: [{
          label: "Điểm Định tính 6C",
          data: c6Vals,
          backgroundColor: "rgba(29, 78, 216, 0.18)",
          borderColor: "#1d4ed8",
          pointBackgroundColor: "#1d4ed8"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { r: { min: 0, max: 10 } }
      }
    });
  }

  function runCorporateUI() {
    try {
      const d = {
        currentAssets: $("c_ca").value, inventories: $("c_inv").value, cash: $("c_cash").value,
        currentLiabilities: $("c_cl").value, totalAssets: $("c_ta").value, totalLiabilities: $("c_tl").value,
        longTermDebt: $("c_ltd").value, totalEquity: $("c_eq").value, retainedEarnings: $("c_re").value,
        sales: $("c_sales").value, cogs: $("c_cogs").value, receivables: $("c_rec").value,
        ebit: $("c_ebit").value, interestExpense: $("c_int").value, netIncome: $("c_ni").value,
        marketValueEquity: $("c_mve").value, shares: $("c_shares").value, stockPrice: $("c_price").value
      };
      const res = Engine.calculateCorporateModels(d);

      $("resZ").textContent = res.Z.score.toFixed(3);
      $("resZBadge").innerHTML = `<span class="badge ${res.Z.zone.cls}">${res.Z.zone.label}</span>`;
      $("resZp").textContent = res.Z_prime.score.toFixed(3);
      $("resZpBadge").innerHTML = `<span class="badge ${res.Z_prime.zone.cls}">${res.Z_prime.zone.label}</span>`;
      $("resZpp").textContent = res.Z_double.score.toFixed(3);
      $("resZppBadge").innerHTML = `<span class="badge ${res.Z_double.zone.cls}">${res.Z_double.zone.label}</span>`;

      $("ovAltmanZ").textContent = res.Z.score.toFixed(2);
      $("ovAltmanZone").textContent = `${res.Z.zone.label} (Z'=${res.Z_prime.score.toFixed(2)}, Z''=${res.Z_double.score.toFixed(2)})`;

      renderChart("chartAltman", {
        type: "bar",
        data: {
          labels: ["Altman Z (CPH SX)", "Altman Z' (Chưa CPH)", "Altman Z'' (Phi SX)"],
          datasets: [{
            label: "Điểm Z-Score",
            data: [+res.Z.score.toFixed(2), +res.Z_prime.score.toFixed(2), +res.Z_double.score.toFixed(2)],
            backgroundColor: ["#1d4ed8", "#0f766e", "#7c3aed"]
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });

      const r = res.ratios;
      const rows = [
        ["Thanh khoản", "Khả năng TT hiện thời (Current Ratio)", fmtNum(r.liquidity.currentRatio, 2) + "x"],
        ["Thanh khoản", "Khả năng TT nhanh (Quick Ratio)", fmtNum(r.liquidity.quickRatio, 2) + "x"],
        ["Thanh khoản", "Khả năng TT tiền mặt (Cash Ratio)", fmtNum(r.liquidity.cashRatio, 2) + "x"],
        ["Thanh khoản", "Hệ số thanh toán lãi vay (EBIT/Lãi)", fmtNum(r.liquidity.interestCoverage, 2) + "x"],
        ["Đòn bẩy", "Tỷ số nợ (Total Debt Ratio)", fmtPct(r.leverage.totalDebtRatio, 1)],
        ["Đòn bẩy", "Nợ / Vốn chủ sở hữu (D/E)", fmtNum(r.leverage.debtToEquity, 2) + "x"],
        ["Đòn bẩy", "Hệ số tự tài trợ (Equity Ratio)", fmtPct(r.leverage.equityRatio, 1)],
        ["Đòn bẩy", "Tỷ số nợ dài hạn (LDR)", fmtPct(r.leverage.longTermDebtRatio, 1)],
        ["Hoạt động", "Vòng quay tổng tài sản (Asset Turnover)", fmtNum(r.efficiency.assetTurnover, 2) + " vòng"],
        ["Hoạt động", "Kỳ thu tiền bình quân (ACP)", fmtNum(r.efficiency.acp, 1) + " ngày"],
        ["Hoạt động", "Vòng quay hàng tồn kho (ITR)", fmtNum(r.efficiency.inventoryTurnover, 2) + " vòng"],
        ["Sinh lời", "Biên lợi nhuận ròng (Net Margin)", fmtPct(r.profitability.netProfitMargin, 2)],
        ["Sinh lời", "ROA (LNST / Tổng tài sản)", fmtPct(r.profitability.roa, 2)],
        ["Sinh lời", "ROE (LNST / Vốn chủ sở hữu)", fmtPct(r.profitability.roe, 2)],
        ["Thị trường", "EPS (nghìn VND/CP)", fmtNum(r.market.eps, 2)],
        ["Thị trường", "P/E (lần)", fmtNum(r.market.pe, 2) + "x"],
        ["Thị trường", "P/B (lần)", fmtNum(r.market.pb, 2) + "x"]
      ];
      $("tblCorpRatios").innerHTML = rows.map(row => `<tr><td>${row[0]}</td><td>${row[1]}</td><td class="num"><strong>${row[2]}</strong></td></tr>`).join("");
      liveState.corp = res;
      if ($("insight_corporate") && Narrative) $("insight_corporate").innerHTML = Narrative.explainCorporate(res, qualState);
      refreshOverviewInsight();
      setStatus("corpStatus", "Đã tính xong", "ok");
    } catch (err) {
      setStatus("corpStatus", `Lỗi: ${err.message}`, "err");
    }
  }

  // =========================================================================
  // TAB 4: ĐIỂM SỐ TÍN DỤNG TIÊU DÙNG
  // =========================================================================
  function runConsumerUI() {
    const c = {
      job: $("con_job").value,
      housing: $("con_housing").value,
      creditRating: $("con_rating").value,
      experience: $("con_exp").value,
      residenceTime: $("con_res").value,
      landline: $("con_phone").value,
      dependents: $("con_dep").value,
      bankAccount: $("con_bank").value
    };
    const res = Engine.calculateConsumerScore(c);
    $("conTotalScore").textContent = res.total;
    const badge = $("conDecisionBadge");
    badge.textContent = res.decision;
    badge.className = `badge ${res.cls}`;

    $("ovConsumerScore").textContent = `${res.total} / 43đ`;
    $("ovConsumerLimit").textContent = res.decision;
    if ($("insight_consumer") && Narrative) $("insight_consumer").innerHTML = Narrative.explainConsumer(res, c);

    renderChart("chartConsumer", {
      type: "bar",
      data: {
        labels: ["Nghề nghiệp", "Nhà ở", "Xếp hạng TD", "Kinh nghiệm", "Cư trú", "ĐT cố định", "Người phụ thuộc", "TK Ngân hàng"],
        datasets: [{
          label: "Điểm đạt được",
          data: [c.job, c.housing, c.creditRating, c.experience, c.residenceTime, c.landline, c.dependents, c.bankAccount].map(Number),
          backgroundColor: "#0f766e"
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 10 } } }
    });
  }

  // =========================================================================
  // TAB 5: CẤU TRÚC KỲ HẠN RRTD & BASEL I / II
  // =========================================================================
  function initBaselInputs() {
    const ts = Sample.PRESETS.termStructure;
    $("ts_i1").value = ts.i1; $("ts_i2").value = ts.i2; $("ts_i3").value = ts.i3;
    $("ts_k1").value = ts.k1; $("ts_k2").value = ts.k2; $("ts_k3").value = ts.k3;
    $("ts_beta").value = ts.beta;

    const b = Sample.PRESETS.baselIRB;
    $("b_ead").value = b.ead; $("b_pd").value = b.pd; $("b_lgd").value = b.lgd; $("b_m").value = b.maturity;
  }

  function runTermStructureUI() {
    const res = Engine.calculateTermStructure({
      i1: $("ts_i1").value, i2: $("ts_i2").value, i3: $("ts_i3").value,
      k1: $("ts_k1").value, k2: $("ts_k2").value, k3: $("ts_k3").value,
      beta: $("ts_beta").value
    });

    $("tblTermStruct").innerHTML = res.years.map(y => `
      <tr>
        <td>Năm ${y.year}</td>
        <td class="num">${fmtPct(y.rf, 2)}</td>
        <td class="num">${fmtPct(y.corp, 2)}</td>
        <td class="num">${fmtPct(y.spread, 2)}</td>
        <td class="num">${fmtPct(y.annualPD, 2)}</td>
        <td class="num"><strong>${fmtPct(y.cumPD, 2)}</strong></td>
      </tr>
    `).join("");

    $("ovCumPd3").textContent = fmtPct(res.years[2].cumPD, 2);
    liveState.ts = res;
    refreshBaselInsight();

    renderChart("chartTermStruct", {
      type: "line",
      data: {
        labels: res.years.map(y => `Năm ${y.year}`),
        datasets: [
          { label: "PD Hàng năm (%)", data: res.years.map(y => +(y.annualPD * 100).toFixed(2)), borderColor: "#d97706", borderWidth: 2.5, tension: 0.2 },
          { label: "PD Tích lũy Cp (%)", data: res.years.map(y => +(y.cumPD * 100).toFixed(2)), borderColor: "#dc2626", backgroundColor: "rgba(220,38,38,0.1)", fill: true, borderWidth: 2.5, tension: 0.2 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  function runBaselUI() {
    const params = {
      ead: $("b_ead").value,
      pd: $("b_pd").value,
      lgd: $("b_lgd").value,
      maturity: $("b_m").value
    };
    const res = Engine.calculateBaselIRB(params);
    $("b_rho").textContent = res.rho.toFixed(4);
    $("b_ma").textContent = res.MA.toFixed(3);
    $("b_wcdr").textContent = fmtPct(res.wcdr, 2);
    $("b_el").textContent = `${res.EL.toFixed(3)} Tr.`;
    $("b_rwa").textContent = `${res.RWA.toFixed(2)} Tr.`;
    $("b_cap").textContent = `${res.minCapital.toFixed(2)} Tr.`;

    $("ovBaselRwa").textContent = `${res.RWA.toFixed(1)} Tr.`;
    $("ovBaselCap").textContent = `Vốn tối thiểu 8%: ${res.minCapital.toFixed(2)} Tr. (WCDR ${fmtPct(res.wcdr, 1)})`;
    liveState.irb = res;
    refreshBaselInsight();

    // Độ nhạy RWA theo PD (0.1% -> 10%)
    const pdGrid = [0.1, 0.5, 1, 2, 3, 5, 8, 10];
    const rwaGrid = pdGrid.map(pdVal => +Engine.calculateBaselIRB({ ...params, pd: pdVal }).RWA.toFixed(2));
    renderChart("chartBaselSens", {
      type: "line",
      data: {
        labels: pdGrid.map(p => `${p}%`),
        datasets: [{
          label: "RWA IRB theo PD (Tr. USD)",
          data: rwaGrid,
          borderColor: "#1d4ed8",
          backgroundColor: "rgba(29,78,216,0.12)",
          fill: true,
          borderWidth: 2.5
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

    // Bảng Standardized Approach
    let sumAmt = 0, sumRwa = 0;
    $("tblBaselSA").innerHTML = Sample.PRESETS.baselStandardized.map(item => {
      const rwa = item.amount * (item.weight / 100);
      sumAmt += item.amount;
      sumRwa += rwa;
      return `
        <tr>
          <td>${item.name}</td>
          <td class="num">${fmtNum(item.amount, 1)}</td>
          <td class="num">${item.weight}%</td>
          <td class="num"><strong>${fmtNum(rwa, 2)}</strong></td>
          <td class="num">${fmtNum(rwa * 0.08, 2)}</td>
        </tr>
      `;
    }).join("") + `
      <tr style="background:#f1f5f9; font-weight:700;">
        <td>TỔNG CỘNG DANH MỤC</td>
        <td class="num">${fmtNum(sumAmt, 1)}</td>
        <td class="num">${((sumRwa / sumAmt) * 100).toFixed(1)}% (BQ)</td>
        <td class="num">${fmtNum(sumRwa, 2)}</td>
        <td class="num">${fmtNum(sumRwa * 0.08, 2)}</td>
      </tr>
    `;
    $("baselSaSummary").textContent = `Tổng RWA Chuẩn hóa: ${fmtNum(sumRwa, 2)} Tr. USD | Vốn 8%: ${fmtNum(sumRwa * 0.08, 2)} Tr. USD`;
  }


  function initBaselIIIInputs() {
    const b3 = Sample.PRESETS.baselIII;
    $("b3_cet1").value = b3.cet1;
    $("b3_at1").value = b3.at1;
    $("b3_t2").value = b3.tier2;
    $("b3_rwaStd").value = b3.rwaStd;
    $("b3_rwaIrb").value = b3.rwaIrb;
    $("b3_exp").value = b3.totalExposure;
    $("b3_ccyb").value = b3.ccybPct;
    $("b3_hqla").value = b3.hqla;
    $("b3_outflow").value = b3.netOutflows30d;
    $("b3_asfrsf").value = `${b3.asf} / ${b3.rsf}`;
  }

  function runBaselIIIUI() {
    const parts = String($("b3_asfrsf").value).split("/").map(s => Number(s.trim()));
    const asf = !isNaN(parts[0]) && parts[0] > 0 ? parts[0] : 185;
    const rsf = !isNaN(parts[1]) && parts[1] > 0 ? parts[1] : 160;

    const res = Engine.calculateBaselIII({
      cet1: $("b3_cet1").value,
      at1: $("b3_at1").value,
      tier2: $("b3_t2").value,
      rwaStd: $("b3_rwaStd").value,
      rwaIrb: $("b3_rwaIrb").value,
      totalExposure: $("b3_exp").value,
      ccybPct: $("b3_ccyb").value,
      hqla: $("b3_hqla").value,
      netOutflows30d: $("b3_outflow").value,
      asf,
      rsf
    });

    $("res_b3_cet1").textContent = fmtPct(res.cet1Ratio, 2);
    $("res_b3_cet1Req").textContent = `Yêu cầu (4.5%+CCB+CCyB): ≥ ${fmtPct(res.reqCet1, 2)}`;
    $("res_b3_car").textContent = `${fmtPct(res.tier1Ratio, 1)} / ${fmtPct(res.totalCar, 1)}`;
    $("res_b3_floor").textContent = res.floorTriggered
      ? `Kích hoạt Output Floor 72.5%: RWA hiệu dụng = ${fmtNum(res.effectiveRwa, 1)}`
      : `RWA hiệu dụng (IRB): ${fmtNum(res.effectiveRwa, 1)}`;
    $("res_b3_lev").textContent = fmtPct(res.leverageRatio, 2);
    $("res_b3_levStatus").textContent = res.checks.levPass ? "Đạt chuẩn Leverage ≥ 3.0%" : "Dưới chuẩn Leverage (< 3.0%)";
    $("res_b3_liq").textContent = `${fmtPct(res.lcr, 1)} / ${fmtPct(res.nsfr, 1)}`;
    $("res_b3_liqStatus").textContent = (res.checks.lcrPass && res.checks.nsfrPass) ? "LCR & NSFR đều đạt ≥ 100%" : "Cảnh báo thanh khoản Basel III";

    const badge = $("b3OverallBadge");
    badge.textContent = res.allPass ? "ĐẠT TRỌN BỘ CHUẨN BASEL III" : "CÓ CHỈ TIÊU DƯỚI CHUẨN BASEL III";
    badge.className = `badge ${res.allPass ? "badge-success" : "badge-danger"}`;
    liveState.b3 = res;
    refreshBaselInsight();
    refreshOverviewInsight();

    renderChart("chartBaselIII", {
      type: "bar",
      data: {
        labels: ["CET1 (%)", "Tier 1 (%)", "Total CAR (%)", "Leverage (%)", "LCR (÷10 %)", "NSFR (÷10 %)"],
        datasets: [
          {
            label: "Thực tế ngân hàng",
            data: [
              +(res.cet1Ratio * 100).toFixed(2),
              +(res.tier1Ratio * 100).toFixed(2),
              +(res.totalCar * 100).toFixed(2),
              +(res.leverageRatio * 100).toFixed(2),
              +(res.lcr * 10).toFixed(2),
              +(res.nsfr * 10).toFixed(2)
            ],
            backgroundColor: "#1d4ed8"
          },
          {
            label: "Ngưỡng tối thiểu Basel III",
            data: [
              +(res.reqCet1 * 100).toFixed(2),
              +(res.reqTier1 * 100).toFixed(2),
              +(res.reqTotal * 100).toFixed(2),
              3.0,
              10.0,
              10.0
            ],
            backgroundColor: "rgba(220, 38, 38, 0.35)",
            borderColor: "#dc2626",
            borderWidth: 1.5
          }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  // =========================================================================
  // TAB 6: DỰ ÁN, TRẢ NỢ & PHÂN LOẠI NỢ 5 NHÓM (NPL)
  // =========================================================================
  function initProjectInputs() {
    const pf = Sample.PRESETS.projectFinance;
    $("pf_r").value = pf.discountRate;
    $("pf_cfs").value = pf.cashFlows.join(", ");
    $("pf_f").value = pf.fixedCost;
    $("pf_p").value = pf.pricePerUnit;
    $("pf_vu").value = pf.varCostPerUnit;
    $("pf_q").value = pf.periodQuantity;

    const np = Sample.PRESETS.portfolioNPL;
    $("npl_g1").value = np.g1; $("npl_g2").value = np.g2; $("npl_g3").value = np.g3;
    $("npl_g4").value = np.g4; $("npl_g5").value = np.g5; $("npl_dep").value = np.totalDeposits;
  }

  function runProjectUI() {
    const cfs = $("pf_cfs").value.split(",").map(s => Number(s.trim())).filter(v => !isNaN(v));
    const F = Number($("pf_f").value), P = Number($("pf_p").value), Vu = Number($("pf_vu").value), Q = Number($("pf_q").value);
    const res = Engine.calculateProjectFinance({
      discountRate: $("pf_r").value, cashFlows: cfs, fixedCost: F, pricePerUnit: P, varCostPerUnit: Vu, periodQuantity: Q, periodDays: 360
    });

    $("res_npv").textContent = fmtNum(res.npv, 1);
    $("res_irr").textContent = res.irr !== null ? fmtPct(res.irr, 2) : "N/A";
    $("res_bcr").textContent = res.bcr.toFixed(2) + "x";
    $("res_qhv").textContent = fmtNum(res.Qhv, 1);
    $("res_dthv").textContent = fmtNum(res.DThv, 1);
    $("res_thv").textContent = `${fmtNum(res.Thv, 0)} ngày`;

    $("ovProjectNpv").textContent = `${fmtNum(res.npv, 0)} Tr.`;
    $("ovProjectIrr").textContent = `IRR: ${res.irr !== null ? fmtPct(res.irr, 1) : "N/A"} | BCR: ${res.bcr.toFixed(2)}x`;

    // Biểu đồ Điểm hòa vốn (BEP)
    const maxQ = Math.max(Q, res.Qhv * 1.5);
    const qSteps = [0, 0.25, 0.5, 0.75, 1.0].map(f => Math.round(maxQ * f));
    renderChart("chartBep", {
      type: "line",
      data: {
        labels: qSteps.map(q => `Q=${q}`),
        datasets: [
          { label: "Doanh thu (TR)", data: qSteps.map(q => P * q), borderColor: "#059669", borderWidth: 2.5 },
          { label: "Tổng chi phí (TC = F + Vu*Q)", data: qSteps.map(q => F + Vu * q), borderColor: "#dc2626", borderWidth: 2.5 },
          { label: "Chi phí cố định (F)", data: qSteps.map(() => F), borderColor: "#64748b", borderDash: [5, 5], borderWidth: 1.5 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

    // Lịch trả nợ Cty X
    const rep = Engine.calculateRepaymentPlan(Sample.PRESETS.repayment);
    liveState.pf = res;
    liveState.rep = rep;
    refreshProjectNplInsight();
    $("repaySummaryBadge").textContent = `Lãi thi công: ${fmtNum(rep.constructionInterest, 1)} Tr. | Tổng nợ nhận: ${fmtNum(rep.totalDebtStart, 1)} Tr. | DSCR: ${rep.dscr.toFixed(2)}x`;
    $("tblRepayment").innerHTML = rep.schedule.map(row => `
      <tr>
        <td>Kỳ ${row.period} (6 tháng)</td>
        <td class="num">${fmtNum(row.beginBalance, 1)}</td>
        <td class="num">${fmtNum(row.principal, 1)}</td>
        <td class="num">${fmtNum(row.interest, 1)}</td>
        <td class="num"><strong>${fmtNum(row.totalPay, 1)}</strong></td>
        <td class="num">${fmtNum(row.endBalance, 1)}</td>
      </tr>
    `).join("");
  }

  function runNplUI() {
    const res = Engine.calculatePortfolioNPL({
      g1: $("npl_g1").value, g2: $("npl_g2").value, g3: $("npl_g3").value,
      g4: $("npl_g4").value, g5: $("npl_g5").value,
      totalDeposits: $("npl_dep").value,
      totalAssets: Sample.PRESETS.portfolioNPL.totalAssets,
      riskWeightedAssets: Sample.PRESETS.portfolioNPL.riskWeightedAssets,
      totalCustomers: Sample.PRESETS.portfolioNPL.totalCustomers,
      overdueCustomers: Sample.PRESETS.portfolioNPL.overdueCustomers,
      totalExposureOfOverdue: Sample.PRESETS.portfolioNPL.totalExposureOfOverdue
    });

    $("res_npl").textContent = fmtPct(res.nplRatio, 2);
    $("res_overdue").textContent = fmtPct(res.overdueRatio, 2);
    $("res_h1").textContent = fmtPct(res.h1, 1);

    $("ovNplRatio").textContent = fmtPct(res.nplRatio, 2);
    $("ovOverdueRatio").textContent = `Nợ quá hạn (N2–N5): ${fmtPct(res.overdueRatio, 2)}`;
    liveState.npl = res;
    refreshProjectNplInsight();
    refreshOverviewInsight();

    renderChart("chartNpl", {
      type: "doughnut",
      data: {
        labels: ["Nhóm 1 (Đủ TC)", "Nhóm 2 (Cần chú ý)", "Nhóm 3 (Dưới TC)", "Nhóm 4 (Nghi ngờ)", "Nhóm 5 (Mất vốn)"],
        datasets: [{
          data: res.groups,
          backgroundColor: ["#10b981", "#f59e0b", "#f97316", "#ef4444", "#7f1d1d"]
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }


  // =========================================================================
  // TAB 7: PHÉP ĐO LÃI SUẤT, LSHVBQ, DỰ BÁO & ARBITRAGE (CHƯƠNG 2)
  // =========================================================================
  function initCh2Inputs() {
    const p = Sample.PRESETS.ch2Interest;
    $("ch2_p0").value = p.principal;
    $("ch2_r").value = p.nominalRate;
    $("ch2_t").value = p.years;
    $("ch2_n").value = p.compoundingPerYear;
    $("ch2_r1").value = p.r1; $("ch2_r2").value = p.r2; $("ch2_r3").value = p.r3; $("ch2_r4").value = p.r4;
    $("ch2_arbRT").value = p.arbRT; $("ch2_arbRC").value = p.arbRC;
    $("ch2_arbS").value = p.arbSpot; $("ch2_arbF").value = p.arbForward; $("ch2_arbM").value = p.arbMonths;
  }

  function runInterestUI() {
    const p = Sample.PRESETS.ch2Interest;
    const res = BankEngine.calcInterestMeasures({
      principal: $("ch2_p0").value,
      nominalRate: $("ch2_r").value,
      years: $("ch2_t").value,
      compoundingPerYear: $("ch2_n").value,
      grossMargin: p.grossMargin,
      lshvbqTable: p.lshvbqTable,
      r1: $("ch2_r1").value, r2: $("ch2_r2").value, r3: $("ch2_r3").value, r4: $("ch2_r4").value,
      arbRT: $("ch2_arbRT").value, arbRC: $("ch2_arbRC").value,
      arbSpot: $("ch2_arbS").value, arbForward: $("ch2_arbF").value, arbMonths: $("ch2_arbM").value
    });

    $("res_ch2_simple").textContent = fmtNum(res.simpleFV, 1);
    $("res_ch2_comp").textContent = fmtNum(res.compoundFV, 1);
    $("res_ch2_eff").textContent = fmtPct(res.effectiveRate, 2);
    $("res_ch2_inst").textContent = fmtNum(res.installmentC, 2);

    $("tblCh2Amort").innerHTML = res.schedule.map(s => `
      <tr>
        <td>Kỳ ${s.period}</td>
        <td class="num">${fmtNum(s.payment, 2)}</td>
        <td class="num">${fmtNum(s.interest, 2)}</td>
        <td class="num">${fmtNum(s.principal, 2)}</td>
        <td class="num">${fmtNum(s.balance, 2)}</td>
      </tr>
    `).join("");

    renderChart("chartYieldCurve", {
      type: "line",
      data: {
        labels: ["1 Năm", "2 Năm", "3 Năm", "4 Năm"],
        datasets: [
          { label: "Lãi suất Coupon (R)", data: res.yieldCurve.coupon.map(v => +(v * 100).toFixed(3)), borderColor: "#64748b", borderDash: [4, 4], borderWidth: 2 },
          { label: "LS Chiết khấu Zero (d)", data: res.yieldCurve.zero.map(v => +(v * 100).toFixed(3)), borderColor: "#1d4ed8", borderWidth: 2.5 },
          { label: "LS Dự báo Forward (E)", data: res.yieldCurve.forward.map(v => +(v * 100).toFixed(3)), borderColor: "#dc2626", borderWidth: 2.5 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

    const a = res.arbitrage;
    $("res_ch2_arbBox").innerHTML = `
      <strong>Quy đổi:</strong> R_C→T = <strong>${fmtPct(a.RC_to_T, 3)}</strong> (so với R_T = ${fmtPct(a.RT, 2)}) |
      R_T→C = <strong>${fmtPct(a.RT_to_C, 3)}</strong> (so với R_C = ${fmtPct(a.RC, 2)})<br/>
      <strong>Quyết định:</strong> ${a.arbDecision} — Lãi Arbitrage: <strong>${(a.arbProfitPerUnit * 100).toFixed(4)}% / kỳ</strong>
    `;

    $("tblCh2Lsh").innerHTML = res.lshvbqRows.map(r => `
      <tr>
        <td>${r.term}</td>
        <td class="num">${r.rate.toFixed(2)}%</td>
        <td class="num">${r.reserve}%</td>
        <td class="num">${r.util}%</td>
        <td class="num">${r.weight}%</td>
        <td class="num"><strong>${fmtPct(r.lshvbq, 2)}</strong></td>
      </tr>
    `).join("");

    $("ch2LshBadge").textContent = `LSHVBQ Tổng nguồn: ${fmtPct(res.avgLshvbq, 4)}/tháng | LS cho vay gợi ý (+0,18% lãi gộp): ${fmtPct(res.suggestedLendingRate, 4)}/tháng`;
    $("ovLshvbq").textContent = `${fmtPct(res.avgLshvbq, 3)}/th`;
    $("ovArbInfo").textContent = `LS vay gợi ý: ${fmtPct(res.suggestedLendingRate, 3)}/th`;
    liveState.ch2 = res;
    if ($("insight_interest") && Narrative) $("insight_interest").innerHTML = Narrative.explainInterest(res);
    refreshOverviewInsight();
  }

  // =========================================================================
  // TAB 8: RỦI RO LÃI SUẤT (GAP, DURATION, CONVEXITY) & PHÁI SINH (CHƯƠNG 3 & 4)
  // =========================================================================
  function initCh34Inputs() {
    const p = Sample.PRESETS.ch34RateRisk;
    $("rr_dR").value = p.deltaR;
    $("rr_A").value = p.totalAssets;
    $("rr_L").value = p.totalLiabilities;
    $("rr_DA").value = p.durationA;
    $("rr_DL").value = p.durationL;
    $("rr_notional").value = p.swapNotional;
    $("rr_swapFix").value = p.swapFixed;
    $("rr_swapFlt").value = p.swapFloat;
    $("rr_cap").value = p.capStrike;
    $("rr_floor").value = p.floorStrike;
  }

  function runRateRiskUI() {
    const p = Sample.PRESETS.ch34RateRisk;
    const res = BankEngine.calcInterestRateRisk({
      deltaR: $("rr_dR").value,
      repricingBuckets: p.repricingBuckets,
      totalAssets: $("rr_A").value,
      totalLiabilities: $("rr_L").value,
      durationA: $("rr_DA").value,
      durationL: $("rr_DL").value,
      baseRate: p.baseRate,
      swapNotional: $("rr_notional").value,
      swapFixed: $("rr_swapFix").value,
      swapFloat: $("rr_swapFlt").value,
      capStrike: $("rr_cap").value,
      floorStrike: $("rr_floor").value,
      capPremium: p.capPremium
    });

    $("res_rr_cgap").textContent = `${fmtNum(res.cgap1Y, 1)} Tr.`;
    $("res_rr_dnii").textContent = `ΔNII (1Y): ${res.dNii1Y >= 0 ? "+" : ""}${fmtNum(res.dNii1Y, 3)} Tr. USD`;
    $("res_rr_dgap").textContent = `${res.duration.dGap.toFixed(2)} năm`;
    $("res_rr_immunize").textContent = `Phòng ngừa (ΔE=0): Giảm D_A→${res.duration.immunizeDA.toFixed(2)} hoặc tăng D_L→${res.duration.immunizeDL.toFixed(2)}`;
    $("res_rr_dE").textContent = `${res.duration.dE >= 0 ? "+" : ""}${res.duration.dE.toFixed(2)} Tr.`;
    $("res_rr_newE").textContent = `VTC mới: ${res.duration.newE.toFixed(2)} Tr. (từ ${res.duration.E.toFixed(1)} Tr.)`;
    $("res_rr_cx").textContent = `${res.convexity.bondD.toFixed(2)}Y / ${res.convexity.CX.toFixed(1)}`;

    $("ovDurDeltaE").textContent = `${res.duration.dE >= 0 ? "+" : ""}${res.duration.dE.toFixed(2)} Tr.`;
    $("ovGapNii").textContent = `CGAP 1Y: ${res.cgap1Y} | ΔNII: ${res.dNii1Y.toFixed(2)}`;
    liveState.rr = res;
    if ($("insight_raterisk") && Narrative) $("insight_raterisk").innerHTML = Narrative.explainRateRisk(res, $("rr_dR").value);
    refreshOverviewInsight();

    $("tblGap").innerHTML = res.gapRows.map(g => `
      <tr>
        <td>${g.bucket}</td>
        <td class="num">${g.rsa}</td>
        <td class="num">${g.rsl}</td>
        <td class="num"><strong>${g.gap >= 0 ? "+" + g.gap : g.gap}</strong></td>
        <td class="num">${g.cumGap >= 0 ? "+" + g.cumGap : g.cumGap}</td>
      </tr>
    `).join("");

    renderChart("chartGap", {
      type: "bar",
      data: {
        labels: res.gapRows.map(g => g.bucket),
        datasets: [{
          label: "GAP (RSA - RSL)",
          data: res.gapRows.map(g => g.gap),
          backgroundColor: res.gapRows.map(g => g.gap >= 0 ? "#059669" : "#dc2626")
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    renderChart("chartConvexity", {
      type: "line",
      data: {
        labels: res.convexity.convexitySeries.map(s => `${s.shockPct >= 0 ? "+" : ""}${s.shockPct}%`),
        datasets: [
          { label: "Thị giá Thực tế (Độ lồi)", data: res.convexity.convexitySeries.map(s => +s.actual.toFixed(2)), borderColor: "#059669", borderWidth: 3 },
          { label: "Ước lượng Duration tuyến tính", data: res.convexity.convexitySeries.map(s => +s.linearApprox.toFixed(2)), borderColor: "#dc2626", borderDash: [6, 4], borderWidth: 2 },
          { label: "Duration + Convexity", data: res.convexity.convexitySeries.map(s => +s.convexApprox.toFixed(2)), borderColor: "#1d4ed8", borderWidth: 2 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

    $("rrDerivBadge").textContent = `Swap Net (Pay Fix/Rec Float): ${res.derivatives.swapNet >= 0 ? "+" : ""}${res.derivatives.swapNet.toFixed(2)} Tr. | Cap Payoff: ${res.derivatives.capPayoff.toFixed(2)} Tr.`;
    renderChart("chartDerivatives", {
      type: "line",
      data: {
        labels: res.derivatives.derivPayoffs.map(d => `${d.rate}%`),
        datasets: [
          { label: "Interest Rate Swap (Pay Fix)", data: res.derivatives.derivPayoffs.map(d => d.swap), borderColor: "#1d4ed8", borderWidth: 2.5 },
          { label: "Long Interest Rate Cap", data: res.derivatives.derivPayoffs.map(d => d.cap), borderColor: "#059669", borderWidth: 2.5 },
          { label: "Collar (Long Cap + Short Floor)", data: res.derivatives.derivPayoffs.map(d => d.collar), borderColor: "#d97706", borderDash: [5, 4], borderWidth: 2.5 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  // =========================================================================
  // TAB 9: NGOẠI HỐI, THANH KHOẢN & CHỨNG KHOÁN HÓA (CHƯƠNG 5, 7, 9)
  // =========================================================================
  function initCh579Inputs() {
    const p = Sample.PRESETS.ch579FxLiqCmo;
    $("fx_A").value = p.fxAssets; $("fx_L").value = p.fxLiabilities;
    $("fx_buy").value = p.fxBought; $("fx_sell").value = p.fxSold;
    $("fx_spot").value = p.fxSpot; $("fx_shock").value = p.fxShockPct;
    $("liq_aNow").value = p.liqAssetsNow; $("liq_lNow").value = p.liqLiabNow;
    $("liq_loans").value = p.liqLoans; $("liq_core").value = p.liqCoreDeposits;
    $("liq_sup").value = p.liqSupply; $("liq_dem").value = p.liqDemand;
    $("cmo_pool").value = p.cmoPool; $("cmo_rate").value = p.cmoRate; $("cmo_prepay").value = p.cmoPrepay;
  }

  function runFxLiqSecUI() {
    const p = Sample.PRESETS.ch579FxLiqCmo;
    const res = BankEngine.calcFxLiquiditySec({
      fxAssets: $("fx_A").value, fxLiabilities: $("fx_L").value,
      fxBought: $("fx_buy").value, fxSold: $("fx_sell").value,
      fxSpot: $("fx_spot").value, fxShockPct: $("fx_shock").value,
      liqAssetsNow: $("liq_aNow").value, liqLiabNow: $("liq_lNow").value,
      liqLoans: $("liq_loans").value, liqCoreDeposits: $("liq_core").value,
      liqLiquidAssets: p.liqLiquidAssets, liqShortFunding: p.liqShortFunding, liqMedLongFromShort: p.liqMedLongFromShort,
      liqSupply: $("liq_sup").value, liqDemand: $("liq_dem").value,
      cmoPool: $("cmo_pool").value, cmoRate: $("cmo_rate").value, cmoPrepay: $("cmo_prepay").value
    });

    $("res_fx_net").textContent = `${res.fx.netFxPos >= 0 ? "+" : ""}${fmtNum(res.fx.netFxPos, 1)} Tr. USD`;
    $("res_fx_status").textContent = res.fx.fxStatus;
    $("res_fx_pnl").textContent = `${res.fx.fxPnlVnd >= 0 ? "+" : ""}${fmtNum(res.fx.fxPnlVnd / 1000, 2)} Tỷ VND`;
    $("res_fx_newspot").textContent = `Tỷ giá sau cú sốc: ${fmtNum(res.fx.newSpot, 0)} VND/USD`;

    $("res_liq_imm").textContent = `${res.liquidity.immediateRatio.toFixed(2)}x`;
    $("res_liq_gap").textContent = `${fmtNum(res.liquidity.financingGap, 0)}`;
    $("res_liq_net").textContent = `${res.liquidity.netLiquidityPos >= 0 ? "+" : ""}${fmtNum(res.liquidity.netLiquidityPos, 0)}`;

    $("ovFxLiq").textContent = `${res.liquidity.immediateRatio.toFixed(2)}x / ${res.fx.netFxPos >= 0 ? "+" : ""}${res.fx.netFxPos}M`;
    $("ovFxSub").textContent = `FX P&L: ${(res.fx.fxPnlVnd / 1000).toFixed(1)} Tỷ | Net Liq: ${res.liquidity.netLiquidityPos >= 0 ? "+" : ""}${fmtNum(res.liquidity.netLiquidityPos, 0)}`;
    liveState.fxliq = res;
    if ($("insight_fxliq") && Narrative) $("insight_fxliq").innerHTML = Narrative.explainFxLiqSec(res, $("fx_shock").value);
    refreshOverviewInsight();

    $("cmoSummaryBadge").textContent = `PV Trái phiếu IO (Lãi): ${fmtNum(res.cmo.pvIO, 1)} Tr. | PV Trái phiếu PO (Gốc): ${fmtNum(res.cmo.pvPO, 1)} Tr.`;
    $("tblCmo").innerHTML = res.cmo.cmoFlow.map(c => `
      <tr>
        <td>Năm ${c.year}</td>
        <td class="num">${fmtNum(c.interestPool, 1)}</td>
        <td class="num">${fmtNum(c.schedPrinc, 1)}</td>
        <td class="num">${fmtNum(c.payA, 1)}</td>
        <td class="num">${fmtNum(c.payB, 1)}</td>
        <td class="num">${fmtNum(c.payC, 1)}</td>
      </tr>
    `).join("");

    renderChart("chartCmo", {
      type: "bar",
      data: {
        labels: res.cmo.cmoFlow.map(c => `Năm ${c.year}`),
        datasets: [
          { label: "Trả gốc Hạng A", data: res.cmo.cmoFlow.map(c => +c.payA.toFixed(1)), backgroundColor: "#1d4ed8", stack: "s1" },
          { label: "Trả gốc Hạng B", data: res.cmo.cmoFlow.map(c => +c.payB.toFixed(1)), backgroundColor: "#0f766e", stack: "s1" },
          { label: "Trả gốc Hạng C", data: res.cmo.cmoFlow.map(c => +c.payC.toFixed(1)), backgroundColor: "#d97706", stack: "s1" }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
    });
  }

  // =========================================================================
  // TAB 10: VỐN TỰ CÓ (CAR) & KHUNG CAMEL (CHƯƠNG 10 & 11)
  // =========================================================================
  function initCh1011Inputs() {
    const p = Sample.PRESETS.ch1011CarCamel;
    $("cc_t1").value = p.tier1Capital; $("cc_t2").value = p.tier2Capital; $("cc_ded").value = p.capitalDeductions;
    $("cc_on0").value = p.on0; $("cc_on20").value = p.on20; $("cc_on50").value = p.on50; $("cc_on100").value = p.on100;
    $("cc_off100").value = p.off100; $("cc_off50").value = p.off50;
    $("cc_ni").value = p.bankNetIncome; $("cc_nii").value = p.bankNii;
    $("cc_opinc").value = p.bankOpIncome; $("cc_opexp").value = p.bankOpExpense;
    $("cc_npl").value = p.camelNplPct; $("cc_liq").value = p.camelLiqPct;
  }

  function runCarCamelUI() {
    const p = Sample.PRESETS.ch1011CarCamel;
    const res = BankEngine.calcCarAndCamel({
      tier1Capital: $("cc_t1").value, tier2Capital: $("cc_t2").value, capitalDeductions: $("cc_ded").value,
      on0: $("cc_on0").value, on20: $("cc_on20").value, on50: $("cc_on50").value, on100: $("cc_on100").value,
      off100: $("cc_off100").value, off50: $("cc_off50").value, off2: p.off2,
      bankNetIncome: $("cc_ni").value, bankNii: $("cc_nii").value,
      bankOpIncome: $("cc_opinc").value, bankOpExpense: $("cc_opexp").value,
      bankEarningAssets: p.bankEarningAssets,
      camelNplPct: $("cc_npl").value, camelLiqPct: $("cc_liq").value
    });

    $("res_car_rwa").textContent = fmtNum(res.car.totalRwa, 0);
    $("res_car_simple").textContent = fmtPct(res.car.simpleCar, 2);
    $("res_car_risk").textContent = fmtPct(res.car.riskBasedCar, 2);
    $("res_car_status").textContent = res.car.carStatus;

    $("res_cc_roa").textContent = fmtPct(res.ratios.roa, 2);
    $("res_cc_roe").textContent = fmtPct(res.ratios.roe, 2);
    $("res_cc_nim").textContent = fmtPct(res.ratios.nim, 2);
    $("res_cc_cir").textContent = fmtPct(res.ratios.cir, 1);

    const cb = $("res_camel_badge");
    cb.textContent = `CAMEL: ${res.camel.composite.toFixed(2)} — ${res.camel.camelGrade}`;
    cb.className = `badge ${res.camel.camelCls}`;

    $("ovCarCamel").textContent = `${fmtPct(res.car.riskBasedCar, 1)} / ${res.camel.composite.toFixed(1)}`;
    $("ovRoeRoa").textContent = `ROE: ${fmtPct(res.ratios.roe, 1)} | ROA: ${fmtPct(res.ratios.roa, 2)} | ${res.camel.camelGrade}`;
    liveState.cc = res;
    if ($("insight_carcamel") && Narrative) $("insight_carcamel").innerHTML = Narrative.explainCarCamel(res);
    refreshOverviewInsight();

    // Đảo ngược thang (6 - score) để trên biểu đồ Radar điểm càng lớn ra ngoài càng tốt
    renderChart("chartCamel", {
      type: "radar",
      data: {
        labels: ["C (Vốn)", "A (Chất lượng TS)", "M (Quản trị)", "E (Sinh lời)", "L (Thanh khoản)"],
        datasets: [{
          label: "Sức khỏe CAMEL (5 = Mạnh nhất, 1 = Yếu nhất)",
          data: [6 - res.camel.rateC, 6 - res.camel.rateA, 6 - res.camel.rateM, 6 - res.camel.rateE, 6 - res.camel.rateL],
          backgroundColor: "rgba(5, 150, 105, 0.2)",
          borderColor: "#059669",
          pointBackgroundColor: "#059669"
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { r: { min: 0, max: 5, ticks: { stepSize: 1 } } } }
    });
  }

  // =========================================================================
  // CHẠY TỰ ĐỘNG TOÀN BỘ MÔ HÌNH
  // =========================================================================
  function runAllModels() {
    try {
      setStatus("globalStatus", "Đang chạy toàn bộ 10 module...", "info");
      runScorecardUI();
      runCorporateUI();
      runConsumerUI();
      runTermStructureUI();
      runBaselUI();
      runBaselIIIUI();
      runProjectUI();
      runNplUI();
      runInterestUI();
      runRateRiskUI();
      runFxLiqSecUI();
      runCarCamelUI();
      setStatus("globalStatus", "Tất cả mô hình đã chạy tự động & cập nhật!", "ok");
      if (global.WorkspaceState) global.WorkspaceState.saveWorkspace();
    } catch (err) {
      setStatus("globalStatus", `Có lỗi: ${err.message}`, "err");
    }
  }

  // Drag & Drop support
  function setupDropzone() {
    const dz = $("dropzone");
    if (!dz) return;
    ["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("dragover"); }));
    ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("dragover"); }));
    dz.addEventListener("drop", e => {
      const files = e.dataTransfer?.files;
      if (files && files.length) {
        if (global.DataImporter && global.DataImporter.importMultipleFiles) {
          global.DataImporter.importMultipleFiles(files);
        } else {
          handleFileUpload(files[0]);
        }
      }
    });
  }

  // Gắn toàn bộ hàm vào window để sự kiện inline HTML không bao giờ lỗi
  global.switchTab = switchTab;
  global.toggleInsights = toggleInsights;
  global.scrollToBlock = scrollToBlock;
  global.runCreditRiskSuiteUI = runCreditRiskSuiteUI;
  global.runAllModels = runAllModels;
  global.exportSampleCSV = exportSampleCSV;
  global.setActiveScorecardDataset = setActiveScorecardDataset;
  global.handleFileUpload = handleFileUpload;
  global.resetToSampleData = resetToSampleData;
  global.runScorecardUI = runScorecardUI;
  global.updateCutoffUI = updateCutoffUI;
  global.runCorporateUI = runCorporateUI;
  global.updateQualScore = updateQualScore;
  global.runConsumerUI = runConsumerUI;
  global.runTermStructureUI = runTermStructureUI;
  global.runBaselUI = runBaselUI;
  global.runBaselIIIUI = runBaselIIIUI;
  global.runProjectUI = runProjectUI;
  global.runNplUI = runNplUI;
  global.runInterestUI = runInterestUI;
  global.runRateRiskUI = runRateRiskUI;
  global.runFxLiqSecUI = runFxLiqSecUI;
  global.runCarCamelUI = runCarCamelUI;

  document.addEventListener("DOMContentLoaded", function () {
    activeDataset = Sample.generateHomeCreditSample(1500, 2026);
    initCorporateInputs();
    initBaselInputs();
    initBaselIIIInputs();
    initProjectInputs();
    initCh2Inputs();
    initCh34Inputs();
    initCh579Inputs();
    initCh1011Inputs();
    setupDropzone();
    const wasRestored = global.WorkspaceState ? global.WorkspaceState.restoreWorkspace() : false;
    runAllModels();
    if (global.MultiYearEngine) global.MultiYearEngine.init();
    if (wasRestored) {
      setStatus("globalStatus", "💾 Đã tự động khôi phục dữ liệu đã lưu trước đó (F5 không bị mất)!", "ok");
      setStatus("uploadStatus", "💾 Đang dùng dữ liệu đã lưu trong trình duyệt (bấm 'Xóa dữ liệu lưu' nếu muốn đổi công ty khác).", "ok");
    }
  });
})(window);

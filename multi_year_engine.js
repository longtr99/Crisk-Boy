/* multi_year_engine.js v2.12 — Lưu trữ & Phân tích Xu hướng Đa năm (Altman Z, NPL, CAR, ROE) */
(function (global) {
  "use strict";

  const STORAGE_KEY = "criskboy_multiyear_v212";
  const $ = (id) => document.getElementById(id);
  const fmtPct = (v, d = 2) => (isFinite(v) ? `${(v * 100).toFixed(d)}%` : "--");

  let yearStore = {}; // { "2023": { year, sources: [], isSample, inputs: {}, metrics: {} } }
  let activeYear = null;

  const TRACKED_INPUT_IDS = [
    "c_ca", "c_inv", "c_cash", "c_cl", "c_ta", "c_tl", "c_ltd", "c_eq",
    "c_re", "c_sales", "c_cogs", "c_rec", "c_ebit", "c_int", "c_ni", "c_mve", "c_shares", "c_price",
    "npl_g1", "npl_g2", "npl_g3", "npl_g4", "npl_g5", "npl_dep",
    "cc_t1", "cc_t2", "cc_ded", "cc_on0", "cc_on20", "cc_on50", "cc_on100", "cc_off100", "cc_off50",
    "cc_ni", "cc_nii", "cc_opinc", "cc_opexp", "cc_npl", "cc_liq"
  ];

  function readCurrentDomInputs() {
    const out = {};
    TRACKED_INPUT_IDS.forEach(id => {
      const el = $(id);
      if (el && el.value !== "") out[id] = Number(el.value);
    });
    return out;
  }

  function applyInputsToDom(inputs) {
    if (!inputs) return;
    Object.entries(inputs).forEach(([id, val]) => {
      const el = $(id);
      if (el && val !== undefined && val !== "" && isFinite(Number(val))) {
        el.value = val;
      }
    });
  }

  function computeMetricsForInputs(rawInputs) {
    const base = readCurrentDomInputs();
    const d = { ...base, ...rawInputs };
    const Engine = global.CreditModelsEngine;
    const BankEngine = global.BankRiskEngine;
    const Sample = global.CreditSampleData;

    let altmanZ = 0, zZone = "--", corpRoe = 0;
    if (Engine && d.c_ta) {
      const corp = Engine.calculateCorporateModels({
        currentAssets: d.c_ca, inventories: d.c_inv, cash: d.c_cash,
        currentLiabilities: d.c_cl, totalAssets: d.c_ta, totalLiabilities: d.c_tl,
        longTermDebt: d.c_ltd, totalEquity: d.c_eq, retainedEarnings: d.c_re,
        sales: d.c_sales, cogs: d.c_cogs, receivables: d.c_rec,
        ebit: d.c_ebit, interestExpense: d.c_int, netIncome: d.c_ni,
        marketValueEquity: d.c_mve, shares: d.c_shares, stockPrice: d.c_price
      });
      altmanZ = corp.Z.score;
      zZone = corp.Z.zone.label;
      corpRoe = corp.ratios.roe;
    }

    let nplRatio = 0;
    if (Engine && d.npl_g1 !== undefined) {
      const np = Sample.PRESETS.portfolioNPL;
      const npl = Engine.calculatePortfolioNPL({
        g1: d.npl_g1, g2: d.npl_g2, g3: d.npl_g3, g4: d.npl_g4, g5: d.npl_g5,
        totalDeposits: d.npl_dep || np.totalDeposits,
        totalAssets: np.totalAssets, riskWeightedAssets: np.riskWeightedAssets,
        totalCustomers: np.totalCustomers, overdueCustomers: np.overdueCustomers,
        totalExposureOfOverdue: np.totalExposureOfOverdue
      });
      nplRatio = npl.nplRatio;
    }

    let carRatio = 0, bankRoe = 0, camelComposite = 0, camelGrade = "--";
    if (BankEngine && d.cc_t1) {
      const p = Sample.PRESETS.ch1011CarCamel;
      const cc = BankEngine.calcCarAndCamel({
        tier1Capital: d.cc_t1, tier2Capital: d.cc_t2, capitalDeductions: d.cc_ded,
        on0: d.cc_on0, on20: d.cc_on20, on50: d.cc_on50, on100: d.cc_on100,
        off100: d.cc_off100, off50: d.cc_off50, off2: p.off2,
        bankNetIncome: d.cc_ni, bankNii: d.cc_nii,
        bankOpIncome: d.cc_opinc, bankOpExpense: d.cc_opexp,
        bankEarningAssets: p.bankEarningAssets,
        camelNplPct: d.cc_npl !== undefined ? d.cc_npl : +(nplRatio * 100).toFixed(2),
        camelLiqPct: d.cc_liq
      });
      carRatio = cc.car.riskBasedCar;
      bankRoe = cc.ratios.roe;
      camelComposite = cc.camel.composite;
      camelGrade = cc.camel.camelGrade;
    }

    // Ưu tiên ROE doanh nghiệp nếu chỉ nạp dữ liệu DN, ngược lại dùng ROE ngân hàng
    const displayRoe = bankRoe || corpRoe;

    return {
      altmanZ: +altmanZ.toFixed(2),
      zZone,
      nplPct: +(nplRatio * 100).toFixed(2),
      carPct: +(carRatio * 100).toFixed(2),
      roePct: +(displayRoe * 100).toFixed(2),
      corpRoePct: +(corpRoe * 100).toFixed(2),
      camelComposite: +camelComposite.toFixed(2),
      camelGrade
    };
  }

  function detectYearFromFilenameOrText(fileName, textSample = "") {
    const fnMatch = String(fileName || "").match(/(?:^|[^\d])(20[1-3]\d)(?:[^\d]|$)/);
    if (fnMatch) return fnMatch[1];

    const txt = String(textSample || "");
    const patterns = [
      /(?:năm\s*tài\s*chính|cho\s*năm|năm)\s*(20[1-3]\d)/i,
      /31[\/\-]12[\/\-](20[1-3]\d)/,
      /(?:FY|Year)\s*(20[1-3]\d)/i,
      /\b(20[1-3]\d)\b/
    ];
    for (const rx of patterns) {
      const m = txt.match(rx);
      if (m) return m[1];
    }
    return String(new Date().getFullYear());
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ yearStore, activeYear }));
    } catch (_) { /* ignore storage quota errors */ }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.yearStore && Object.keys(parsed.yearStore).length > 0) {
        yearStore = parsed.yearStore;
        activeYear = parsed.activeYear || Object.keys(yearStore).sort().slice(-1)[0];
        return true;
      }
    } catch (_) { /* ignore */ }
    return false;
  }

  function buildSample3Years() {
    const base = readCurrentDomInputs();
    const scale = (obj, overrides) => ({ ...obj, ...overrides });

    const y2023 = scale(base, {
      c_sales: Math.round((base.c_sales || 145000) * 0.84),
      c_ebit: Math.round((base.c_ebit || 16800) * 0.78),
      c_ni: Math.round((base.c_ni || 10880) * 0.76),
      c_re: Math.round((base.c_re || 19500) * 0.80),
      npl_g3: Math.round((base.npl_g3 || 2400) * 1.30),
      npl_g4: Math.round((base.npl_g4 || 1300) * 1.25),
      cc_t1: Math.round((base.cc_t1 || 12500) * 0.86),
      cc_ni: Math.round((base.cc_ni || 2450) * 0.78),
      cc_npl: 2.85
    });

    const y2024 = scale(base, {
      c_sales: Math.round((base.c_sales || 145000) * 0.93),
      c_ebit: Math.round((base.c_ebit || 16800) * 0.90),
      c_ni: Math.round((base.c_ni || 10880) * 0.89),
      c_re: Math.round((base.c_re || 19500) * 0.91),
      npl_g3: Math.round((base.npl_g3 || 2400) * 1.12),
      npl_g4: Math.round((base.npl_g4 || 1300) * 1.10),
      cc_t1: Math.round((base.cc_t1 || 12500) * 0.94),
      cc_ni: Math.round((base.cc_ni || 2450) * 0.90),
      cc_npl: 2.40
    });

    const y2025 = { ...base };

    yearStore = {
      "2023": { year: "2023", sources: ["Dữ liệu mẫu 2023"], isSample: true, inputs: y2023, metrics: computeMetricsForInputs(y2023) },
      "2024": { year: "2024", sources: ["Dữ liệu mẫu 2024"], isSample: true, inputs: y2024, metrics: computeMetricsForInputs(y2024) },
      "2025": { year: "2025", sources: ["Dữ liệu mẫu 2025"], isSample: true, inputs: y2025, metrics: computeMetricsForInputs(y2025) }
    };
    activeYear = "2025";
    saveToStorage();
  }

  function clearSampleIfNeeded() {
    const keys = Object.keys(yearStore);
    if (keys.length && keys.every(k => yearStore[k].isSample)) {
      yearStore = {};
    }
  }

  function upsertYearData(year, partialInputs, sourceName, isSample = false) {
    const yr = String(year).trim();
    if (!isSample) clearSampleIfNeeded();

    const prev = yearStore[yr];
    const mergedInputs = { ...(prev ? prev.inputs : readCurrentDomInputs()), ...partialInputs };
    const sources = prev ? Array.from(new Set([...prev.sources, sourceName])) : [sourceName];

    // Đồng bộ cc_npl theo 5 nhóm nợ nếu có nạp nhóm nợ
    if (partialInputs.npl_g1 !== undefined) {
      const g1 = Math.abs(Number(mergedInputs.npl_g1) || 0);
      const g2 = Math.abs(Number(mergedInputs.npl_g2) || 0);
      const g3 = Math.abs(Number(mergedInputs.npl_g3) || 0);
      const g4 = Math.abs(Number(mergedInputs.npl_g4) || 0);
      const g5 = Math.abs(Number(mergedInputs.npl_g5) || 0);
      const tot = g1 + g2 + g3 + g4 + g5;
      if (tot > 0) mergedInputs.cc_npl = +(((g3 + g4 + g5) / tot) * 100).toFixed(2);
    }

    yearStore[yr] = {
      year: yr,
      sources,
      isSample,
      inputs: mergedInputs,
      metrics: computeMetricsForInputs(mergedInputs)
    };
    activeYear = yr;
    saveToStorage();
    return yearStore[yr];
  }

  function getSortedYears() {
    return Object.keys(yearStore).sort((a, b) => Number(a) - Number(b));
  }

  function selectYear(year) {
    const rec = yearStore[String(year)];
    if (!rec) return;
    activeYear = String(year);
    applyInputsToDom(rec.inputs);
    saveToStorage();
    if (global.runAllModels) global.runAllModels();
    renderMultiYearUI();
  }

  function deleteYear(year) {
    const yr = String(year);
    delete yearStore[yr];
    const yrs = getSortedYears();
    if (yrs.length === 0) {
      buildSample3Years();
    } else if (activeYear === yr) {
      activeYear = yrs[yrs.length - 1];
      applyInputsToDom(yearStore[activeYear].inputs);
      if (global.runAllModels) global.runAllModels();
    }
    saveToStorage();
    renderMultiYearUI();
  }

  function saveCurrentAsYear() {
    const inp = $("myYearInput");
    const yr = (inp && inp.value.trim()) ? inp.value.trim() : String(new Date().getFullYear());
    if (!/^\d{4}$/.test(yr)) {
      alert("Vui lòng nhập năm hợp lệ gồm 4 chữ số (ví dụ: 2025).");
      return;
    }
    upsertYearData(yr, readCurrentDomInputs(), `Lưu thủ công (${yr})`, false);
    renderMultiYearUI();
  }

  function resetSampleYears() {
    buildSample3Years();
    applyInputsToDom(yearStore[activeYear].inputs);
    if (global.runAllModels) global.runAllModels();
    renderMultiYearUI();
  }

  function renderMultiYearUI() {
    const yrs = getSortedYears();
    if (!yrs.length) return;
    const records = yrs.map(y => yearStore[y]);

    // 1. Render year pills
    const pillsWrap = $("biMultiYearPills");
    if (pillsWrap) {
      pillsWrap.innerHTML = records.map(r => `
        <button type="button" class="ct-btn ${r.year === activeYear ? "active" : ""}" onclick="window.MultiYearEngine.selectYear('${r.year}')">
          📅 Năm ${r.year}${r.isSample ? " (Mẫu)" : ""}
        </button>
      `).join("");
    }

    // 2. Render multi-year chart via ChartStudio
    if (global.ChartStudio) {
      global.ChartStudio.render("chartBiMultiYear", {
        type: "line",
        data: {
          labels: records.map(r => `Năm ${r.year}`),
          datasets: [
            {
              label: "Altman Z (điểm)",
              data: records.map(r => r.metrics.altmanZ),
              borderColor: "#1d4ed8",
              backgroundColor: "rgba(29, 78, 216, 0.14)",
              borderWidth: 2.8,
              tension: 0.25,
              yAxisID: "y1"
            },
            {
              label: "Nợ xấu NPL (%)",
              data: records.map(r => r.metrics.nplPct),
              borderColor: "#dc2626",
              backgroundColor: "rgba(220, 38, 38, 0.12)",
              borderWidth: 2.8,
              tension: 0.25,
              yAxisID: "y"
            },
            {
              label: "An toàn vốn CAR (%)",
              data: records.map(r => r.metrics.carPct),
              borderColor: "#059669",
              backgroundColor: "rgba(5, 150, 105, 0.12)",
              borderWidth: 2.5,
              tension: 0.25,
              yAxisID: "y"
            },
            {
              label: "Sinh lời ROE (%)",
              data: records.map(r => r.metrics.roePct),
              borderColor: "#d97706",
              backgroundColor: "rgba(217, 119, 6, 0.12)",
              borderWidth: 2.5,
              borderDash: [5, 3],
              tension: 0.25,
              yAxisID: "y"
            }
          ]
        },
        options: {
          scales: {
            y: { position: "left", title: { display: true, text: "Tỷ lệ (%) — NPL / CAR / ROE" } },
            y1: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Điểm Altman Z" } }
          }
        }
      });
    }

    // 3. Render multi-year comparison table
    const tbody = $("tblBiMultiYear");
    if (tbody) {
      tbody.innerHTML = records.map((r, idx) => {
        const prev = idx > 0 ? records[idx - 1] : null;
        let trendHtml = `<span class="badge badge-info">Năm gốc</span>`;
        if (prev) {
          const dZ = +(r.metrics.altmanZ - prev.metrics.altmanZ).toFixed(2);
          const dNpl = +(r.metrics.nplPct - prev.metrics.nplPct).toFixed(2);
          const dRoe = +(r.metrics.roePct - prev.metrics.roePct).toFixed(2);
          trendHtml = `Z: <strong>${dZ >= 0 ? "+" : ""}${dZ}</strong> | NPL: <strong>${dNpl >= 0 ? "+" : ""}${dNpl}%</strong> | ROE: <strong>${dRoe >= 0 ? "+" : ""}${dRoe}%</strong>`;
        }
        return `
          <tr style="${r.year === activeYear ? "background:#eff6ff;" : ""}">
            <td><strong>${r.year}</strong> ${r.year === activeYear ? '<span class="badge badge-info">Đang xem</span>' : ""}</td>
            <td><small style="color:var(--text-muted);">${r.sources.join(", ")}</small></td>
            <td class="num"><strong>${r.metrics.altmanZ.toFixed(2)}</strong></td>
            <td class="num"><strong style="color:${r.metrics.nplPct <= 3 ? "#059669" : "#dc2626"};">${r.metrics.nplPct.toFixed(2)}%</strong></td>
            <td class="num"><strong>${r.metrics.carPct.toFixed(2)}%</strong></td>
            <td class="num"><strong>${r.metrics.roePct.toFixed(2)}%</strong></td>
            <td class="num">${r.metrics.camelComposite.toFixed(2)}</td>
            <td><small>${trendHtml}</small></td>
            <td class="num" style="white-space:nowrap;">
              <button type="button" class="ct-btn" onclick="window.MultiYearEngine.selectYear('${r.year}')">Nạp</button>
              <button type="button" class="ct-btn" style="color:#dc2626;" onclick="window.MultiYearEngine.deleteYear('${r.year}')">✕</button>
            </td>
          </tr>
        `;
      }).join("");
    }

    // 4. Auto Multi-Year Trend Insight
    const ins = $("biMultiYearInsight");
    if (ins && records.length >= 2) {
      const first = records[0], last = records[records.length - 1];
      const dZ = last.metrics.altmanZ - first.metrics.altmanZ;
      const dNpl = last.metrics.nplPct - first.metrics.nplPct;
      const dCar = last.metrics.carPct - first.metrics.carPct;
      const dRoe = last.metrics.roePct - first.metrics.roePct;
      ins.innerHTML = `
        <strong>📈 Phân tích xu hướng đa năm (${first.year} → ${last.year}):</strong>
        Altman Z ${dZ >= 0 ? "cải thiện" : "giảm"} <strong>${dZ >= 0 ? "+" : ""}${dZ.toFixed(2)} điểm</strong> (đạt ${last.metrics.altmanZ.toFixed(2)});
        Tỷ lệ nợ xấu NPL ${dNpl <= 0 ? "giảm tích cực" : "tăng cảnh báo"} <strong>${dNpl >= 0 ? "+" : ""}${dNpl.toFixed(2)}%</strong> (còn ${last.metrics.nplPct.toFixed(2)}%);
        CAR biến động <strong>${dCar >= 0 ? "+" : ""}${dCar.toFixed(2)}%</strong> và ROE thay đổi <strong>${dRoe >= 0 ? "+" : ""}${dRoe.toFixed(2)}%</strong>.
      `;
    } else if (ins) {
      ins.innerHTML = `<strong>📈 Xu hướng đa năm:</strong> Đang có dữ liệu <strong>1 năm (${records[0].year})</strong>. Nạp thêm BCTC các năm khác để hệ thống vẽ đường xu hướng so sánh YoY.`;
    }
  }

  function init() {
    if (!loadFromStorage()) {
      buildSample3Years();
    }
    renderMultiYearUI();
  }


  function loadSampleCompany(code) {
    const sc = global.CreditSampleData && global.CreditSampleData.SAMPLE_COMPANIES && global.CreditSampleData.SAMPLE_COMPANIES[code];
    if (!sc) return;
    yearStore = {};
    const yrs = Object.keys(sc.years).sort();
    yrs.forEach(y => {
      const inputs = sc.years[y];
      yearStore[y] = {
        year: String(y),
        sources: [sc.source],
        isSample: false,
        inputs: { ...inputs },
        metrics: computeMetricsForInputs(inputs)
      };
    });
    const latest = yrs[yrs.length - 1];
    activeYear = latest;
    applyInputsToDom(yearStore[latest].inputs);
    if ($("c_name")) $("c_name").value = sc.name;
    saveToStorage();
    if (global.WorkspaceState && typeof global.WorkspaceState.setCompany === "function") {
      global.WorkspaceState.setCompany({ name: sc.name, ticker: sc.ticker, isDemo: false });
    }
    if (typeof global.runAllModels === "function") {
      global.runAllModels();
    }
    renderMultiYearUI();
    document.querySelectorAll(".quick-company-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.company === code);
    });
    const st = $("globalStatus");
    if (st) {
      st.textContent = `Đã nạp ${sc.name} (${yrs[0]}–${latest})`;
      st.className = "status-msg status-ok";
    }
  }

  global.MultiYearEngine = {
    init,
    loadSampleCompany,
    detectYearFromFilenameOrText,
    upsertYearData,
    selectYear,
    deleteYear,
    saveCurrentAsYear,
    resetSampleYears,
    renderMultiYearUI,
    getSortedYears,
    getLatestYear: () => {
      const yrs = getSortedYears();
      return yrs.length ? yrs[yrs.length - 1] : null;
    }
  };
})(window);

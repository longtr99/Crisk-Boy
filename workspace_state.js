/* workspace_state.js v2.14 — Nhận diện Pháp nhân & Mã CK + Tự động lưu trạng thái chống mất dữ liệu khi F5 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "criskboy_workspace_v214";
  const SCORECARD_KEY = "criskboy_scorecard_v214";
  const $ = (id) => document.getElementById(id);

  // Từ điển ánh xạ tên pháp nhân phổ biến -> Mã chứng khoán (HOSE/HNX/UPCoM)
  const KNOWN_TICKERS = [
    { rx: /tập\s*đoàn\s*masan|masan\s*group/i, ticker: "MSN", canonical: "CÔNG TY CỔ PHẦN TẬP ĐOÀN MASAN" },
    { rx: /hàng\s*tiêu\s*dùng\s*masan|masan\s*consumer/i, ticker: "MCH" },
    { rx: /masan\s*meatlife/i, ticker: "MML" },
    { rx: /masan\s*high-?tech|vật\s*liệu\s*công\s*nghệ\s*cao\s*masan/i, ticker: "MSR" },
    { rx: /kỹ\s*thương\s*việt\s*nam|techcombank/i, ticker: "TCB" },
    { rx: /ngoại\s*thương\s*việt\s*nam|vietcombank/i, ticker: "VCB" },
    { rx: /công\s*thương\s*việt\s*nam|vietinbank/i, ticker: "CTG" },
    { rx: /đầu\s*tư\s*và\s*phát\s*triển\s*việt\s*nam|\bbidv\b/i, ticker: "BID" },
    { rx: /quân\s*đội|\bmbbank\b/i, ticker: "MBB" },
    { rx: /việt\s*nam\s*thịnh\s*vượng|\bvpbank\b/i, ticker: "VPB" },
    { rx: /á\s*châu|\bacb\b/i, ticker: "ACB" },
    { rx: /sài\s*gòn\s*thương\s*tín|sacombank/i, ticker: "STB" },
    { rx: /phát\s*triển\s*tp\.?\s*hồ\s*chí\s*minh|hdbank/i, ticker: "HDB" },
    { rx: /tiên\s*phong|tpbank/i, ticker: "TPB" },
    { rx: /quốc\s*tế\s*việt\s*nam|\bvib\b/i, ticker: "VIB" },
    { rx: /sài\s*gòn\s*-\s*hà\s*nội|\bshb\b/i, ticker: "SHB" },
    { rx: /hòa\s*phát/i, ticker: "HPG" },
    { rx: /sữa\s*việt\s*nam|vinamilk/i, ticker: "VNM" },
    { rx: /tập\s*đoàn\s*vingroup/i, ticker: "VIC" },
    { rx: /vinhomes/i, ticker: "VHM" },
    { rx: /vincom\s*retail/i, ticker: "VRE" },
    { rx: /công\s*ty\s*cổ\s*phần\s*fpt|tập\s*đoàn\s*fpt/i, ticker: "FPT" },
    { rx: /thế\s*giới\s*di\s*động/i, ticker: "MWG" },
    { rx: /bia\s*-\s*rượu\s*-\s*nước\s*giải\s*khát\s*sài\s*gòn|sabeco/i, ticker: "SAB" },
    { rx: /vàng\s*bạc\s*đá\s*quý\s*phú\s*nhuận|\bpnj\b/i, ticker: "PNJ" },
    { rx: /khí\s*việt\s*nam|pv\s*gas/i, ticker: "GAS" },
    { rx: /xăng\s*dầu\s*việt\s*nam|petrolimex/i, ticker: "PLX" },
    { rx: /hàng\s*không\s*vietjet/i, ticker: "VJC" },
    { rx: /hàng\s*không\s*việt\s*nam|vietnam\s*airlines/i, ticker: "HVN" },
    { rx: /chứng\s*khoán\s*ssi/i, ticker: "SSI" },
    { rx: /chứng\s*khoán\s*vndirect/i, ticker: "VND" },
    { rx: /hóa\s*chất\s*đức\s*giang/i, ticker: "DGC" },
    { rx: /cơ\s*điện\s*lạnh|\bree\b/i, ticker: "REE" },
    { rx: /đầu\s*tư\s*địa\s*ốc\s*no\s*va|novaland/i, ticker: "NVL" },
    { rx: /nhà\s*khang\s*điền/i, ticker: "KDH" },
    { rx: /đầu\s*tư\s*nam\s*long/i, ticker: "NLG" },
    { rx: /vĩnh\s*hoàn/i, ticker: "VHC" }
  ];

  let currentCompany = {
    name: "Dữ liệu mẫu (Chưa nạp doanh nghiệp)",
    ticker: "DEMO",
    isDemo: true
  };

  function cleanEntityName(raw) {
    let s = String(raw || "")
      .replace(/\s+/g, " ")
      .replace(/\s+và\s+các\s+công\s+ty\s+con.*$/i, "")
      .replace(/\s*\(["“]?công\s*ty["”]?\).*$/i, "")
      .replace(/\s*mẫu\s*số.*$/i, "")
      .replace(/\s*bảng\s*cân\s*đối.*$/i, "")
      .replace(/\s*báo\s*cáo.*$/i, "")
      .replace(/[,;:\-–—]+$/, "")
      .trim();
    if (s.length > 90) s = s.slice(0, 90).trim();
    return s;
  }

  function detectCompany(fileName = "", textSample = "") {
    const sample = String(textSample || "").slice(0, 6000);
    const fn = String(fileName || "");
    let detectedName = "";
    let detectedTicker = "";

    // 1. Quét tên pháp nhân trong nội dung PDF/Excel
    const entityPatterns = [
      /(NGÂN\s+HÀNG\s+(?:THƯƠNG\s+MẠI\s+CỔ\s+PHẦN|TMCP)\s+[^\n\r]{3,70})/i,
      /(TỔNG\s+CÔNG\s+TY\s+[^\n\r]{3,70})/i,
      /(CÔNG\s+TY\s+CỔ\s+PHẦN\s+[^\n\r]{3,75})/i,
      /(CÔNG\s+TY\s+TNHH\s+[^\n\r]{3,75})/i
    ];

    const lines = sample.split(/\r?\n|  +/).map(l => l.trim()).filter(Boolean);
    for (const line of lines.slice(0, 120)) {
      // Bỏ qua tên công ty kiểm toán (KPMG, PwC, Deloitte, Ernst & Young)
      if (/kpmg|pwc|deloitte|ernst\s*&\s*young|kiểm\s*toán/i.test(line)) continue;
      for (const rx of entityPatterns) {
        const m = line.match(rx);
        if (m && m[1]) {
          const cleaned = cleanEntityName(m[1]);
          if (cleaned.length >= 12) {
            detectedName = cleaned.toUpperCase();
            break;
          }
        }
      }
      if (detectedName) break;
    }

    // 2. Tra cứu mã chứng khoán từ từ điển (ưu tiên nội dung, sau đó tên file)
    const combined = `${detectedName} ${sample.slice(0, 2000)} ${fn}`;
    for (const item of KNOWN_TICKERS) {
      if (item.rx.test(combined)) {
        detectedTicker = item.ticker;
        if (!detectedName && item.canonical) detectedName = item.canonical;
        break;
      }
    }

    // 3. Nếu chưa có mã CK, thử tìm ký hiệu (HOSE: XXX) / (HNX: XXX) / Mã CK: XXX
    if (!detectedTicker) {
      const mTicker = combined.match(/(?:HOSE|HSX|HNX|UPCOM|MÃ\s*CK|TICKER)\s*[:\-]?\s*([A-Z]{3})\b/);
      if (mTicker) detectedTicker = mTicker[1];
    }

    // 4. Fallback theo tên file nếu là Excel không có text pháp nhân
    if (!detectedName && fn) {
      const baseFn = fn.replace(/\.(xlsx|xls|csv|pdf)$/i, "").replace(/[_\-]+/g, " ").replace(/\b20[1-3]\d\b/g, "").replace(/\bbctc\b/gi, "").trim();
      if (baseFn.length >= 2) detectedName = baseFn.toUpperCase();
    }

    if (!detectedName && !detectedTicker) return null;
    return {
      name: detectedName || `DOANH NGHIỆP (${detectedTicker})`,
      ticker: detectedTicker || "",
      isDemo: false
    };
  }

  function renderCompanyBadge() {
    const el = $("activeCompanyBadge");
    if (!el) return;
    const tickerHtml = currentCompany.ticker
      ? `<span class="company-ticker">${currentCompany.ticker}</span>`
      : "";
    el.innerHTML = `<span class="company-icon">🏢</span><span class="company-name">${currentCompany.name}</span>${tickerHtml}`;
    el.classList.toggle("is-demo", !!currentCompany.isDemo);
    document.title = currentCompany.isDemo
      ? "Crisk-boy"
      : `${currentCompany.ticker ? `[${currentCompany.ticker}] ` : ""}${currentCompany.name} — Crisk-boy`;
  }

  function setCompany(info) {
    if (!info || !info.name) return;
    currentCompany = {
      name: String(info.name).trim(),
      ticker: String(info.ticker || "").trim().toUpperCase(),
      isDemo: !!info.isDemo
    };
    renderCompanyBadge();
    saveWorkspace();
  }

  function promptEditCompany() {
    const newName = window.prompt("Nhập Tên pháp nhân Doanh nghiệp / Ngân hàng:", currentCompany.isDemo ? "" : currentCompany.name);
    if (newName === null) return;
    const newTicker = window.prompt("Nhập Mã chứng khoán (để trống nếu chưa niêm yết, VD: MSN, VCB, HPG):", currentCompany.isDemo ? "" : currentCompany.ticker);
    if (newTicker === null) return;
    if (newName.trim()) {
      setCompany({ name: newName.trim().toUpperCase(), ticker: newTicker.trim().toUpperCase(), isDemo: false });
    }
  }

  function collectAllDomInputs() {
    const inputs = {};
    document.querySelectorAll("input[id], select[id]").forEach(el => {
      if (el.type === "file" || el.id === "myYearInput") return;
      if (el.id.startsWith("biSlicer")) return;
      inputs[el.id] = el.value;
    });
    return inputs;
  }

  function applyDomInputs(inputs) {
    if (!inputs) return;
    Object.entries(inputs).forEach(([id, val]) => {
      const el = $(id);
      if (el && el.type !== "file" && val !== undefined && val !== "") {
        el.value = val;
      }
    });
  }

  function saveWorkspace(extra = {}) {
    try {
      const payload = {
        savedAt: new Date().toISOString(),
        company: currentCompany,
        inputs: collectAllDomInputs(),
        lastStatus: extra.lastStatus || ($("uploadStatus") ? $("uploadStatus").textContent : "")
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) { /* ignore quota error */ }
  }

  function saveScorecardDataset(rows) {
    try {
      if (!Array.isArray(rows) || !rows.length) return;
      // Giới hạn lưu tối đa 2.500 dòng vào localStorage để tránh vượt quá 5MB quota
      const toSave = rows.length > 2500 ? rows.slice(0, 2500) : rows;
      localStorage.setItem(SCORECARD_KEY, JSON.stringify(toSave));
    } catch (_) { /* ignore quota error */ }
  }

  function restoreWorkspace() {
    let restored = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.company && parsed.company.name) {
          currentCompany = parsed.company;
        }
        if (parsed.inputs && Object.keys(parsed.inputs).length > 0) {
          applyDomInputs(parsed.inputs);
          restored = true;
        }
      }
      const rawSc = localStorage.getItem(SCORECARD_KEY);
      if (rawSc && global.setActiveScorecardDataset) {
        const scRows = JSON.parse(rawSc);
        if (Array.isArray(scRows) && scRows.length > 0) {
          global.setActiveScorecardDataset(scRows);
          restored = true;
        }
      }
    } catch (_) { /* ignore */ }
    renderCompanyBadge();
    return restored;
  }

  function clearSavedWorkspace() {
    if (!window.confirm("Xóa toàn bộ dữ liệu đã lưu trong trình duyệt (tên doanh nghiệp, số liệu các năm, Scorecard) và quay về dữ liệu mẫu?")) {
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SCORECARD_KEY);
      localStorage.removeItem("criskboy_multiyear_v212");
    } catch (_) { /* ignore */ }
    window.location.reload();
  }

  global.WorkspaceState = {
    detectCompany,
    setCompany,
    getCompany: () => ({ ...currentCompany }),
    renderCompanyBadge,
    promptEditCompany,
    saveWorkspace,
    saveScorecardDataset,
    restoreWorkspace,
    clearSavedWorkspace
  };
})(window);

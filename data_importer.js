/* data_importer.js v2.12 — Nạp hàng loạt nhiều tệp cùng lúc (Excel Tổng / CSV / PDF BCTC & Thuyết minh BCTC Ngân hàng) */
(function (global) {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function setStatus(id, text, type = "ok") {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = `status-msg status-${type}`;
  }

  // Danh mục ánh xạ toàn bộ tham số đầu vào của 6 Tab (ID DOM -> Nhãn tiếng Việt)
  const EXCEL_SHEET_MAP = {
    Corporate_BCTC: [
      ["c_ca", "Tài sản ngắn hạn (Current Assets - Tr.VND)"],
      ["c_inv", "Hàng tồn kho (Inventories - Tr.VND)"],
      ["c_cash", "Tiền & Tương đương tiền (Cash - Tr.VND)"],
      ["c_cl", "Nợ ngắn hạn (Current Liabilities - Tr.VND)"],
      ["c_ta", "Tổng Tài sản (Total Assets - Tr.VND)"],
      ["c_tl", "Tổng Nợ phải trả (Total Liabilities - Tr.VND)"],
      ["c_ltd", "Nợ dài hạn (Long-term Debt - Tr.VND)"],
      ["c_eq", "Vốn chủ sở hữu (Total Equity - Tr.VND)"],
      ["c_re", "Lợi nhuận giữ lại (Retained Earnings - Tr.VND)"],
      ["c_sales", "Doanh thu thuần (Sales - Tr.VND)"],
      ["c_cogs", "Giá vốn hàng bán (COGS - Tr.VND)"],
      ["c_rec", "Phải thu ngắn hạn KH (Receivables - Tr.VND)"],
      ["c_ebit", "EBIT (LN trước thuế & lãi vay - Tr.VND)"],
      ["c_int", "Chi phí lãi vay (Interest Expense - Tr.VND)"],
      ["c_ni", "Lợi nhuận sau thuế (Net Income - Tr.VND)"],
      ["c_mve", "Thị giá Vốn hóa (Market Value Equity - Tr.VND)"],
      ["c_shares", "Số lượng Cổ phiếu (nghìn CP)"],
      ["c_price", "Giá Cổ phiếu (nghìn VND)"]
    ],
    Consumer_Score: [
      ["con_job", "Nghề nghiệp (điểm: 10,8,7,5,4,2)"],
      ["con_housing", "Trạng thái nhà ở (điểm: 6,4,2)"],
      ["con_rating", "Xếp hạng tín dụng CIC (điểm: 10,5,2,0)"],
      ["con_exp", "Kinh nghiệm nghề nghiệp (điểm: 5,2)"],
      ["con_res", "Thời gian cư trú (điểm: 2,1)"],
      ["con_phone", "Điện thoại cố định (điểm: 2,0)"],
      ["con_dep", "Số người phụ thuộc (điểm: 3,4,2)"],
      ["con_bank", "Tài khoản tại NH (điểm: 4,3,2,0)"]
    ],
    Term_Basel: [
      ["ts_i1", "LS TP Chính phủ 1Y (%)"],
      ["ts_i2", "LS TP Chính phủ 2Y (%)"],
      ["ts_i3", "LS TP Chính phủ 3Y (%)"],
      ["ts_k1", "LS Tín dụng DN 1Y (%)"],
      ["ts_k2", "LS Tín dụng DN 2Y (%)"],
      ["ts_k3", "LS Tín dụng DN 3Y (%)"],
      ["ts_beta", "Hệ số thu hồi TSĐB beta (%)"],
      ["b_ead", "Basel II IRB — EAD (Tr.USD)"],
      ["b_pd", "Basel II IRB — PD (%)"],
      ["b_lgd", "Basel II IRB — LGD (%)"],
      ["b_m", "Basel II IRB — Kỳ hạn M (năm)"],
      ["b3_cet1", "Basel III — Vốn CET1 (Tr.USD)"],
      ["b3_at1", "Basel III — Vốn AT1 (Tr.USD)"],
      ["b3_t2", "Basel III — Vốn Tier 2 (Tr.USD)"],
      ["b3_rwaStd", "Basel III — RWA Chuẩn hóa SA (Tr.USD)"],
      ["b3_rwaIrb", "Basel III — RWA Nội bộ IRB (Tr.USD)"],
      ["b3_exp", "Basel III — Tổng phơi nhiễm Leverage (Tr.USD)"],
      ["b3_ccyb", "Basel III — Bộ đệm phản chu kỳ CCyB (%)"],
      ["b3_hqla", "Basel III — Tài sản thanh khoản HQLA"],
      ["b3_outflow", "Basel III — Dòng tiền ra ròng 30 ngày"],
      ["b3_asfrsf", "Basel III — ASF / RSF (dạng: 185 / 160)"]
    ],
    Project_NPL: [
      ["pf_r", "Dự án — Lãi suất chiết khấu r (%/năm)"],
      ["pf_cfs", "Dự án — Dòng tiền các năm (cách nhau dấu phẩy)"],
      ["pf_f", "Điểm hòa vốn — Chi phí cố định F"],
      ["pf_p", "Điểm hòa vốn — Giá bán đơn vị P"],
      ["pf_vu", "Điểm hòa vốn — Biến phí đơn vị Vu"],
      ["pf_q", "Điểm hòa vốn — Sản lượng kỳ Q"],
      ["npl_g1", "Phân loại nợ — Nhóm 1 (Đủ tiêu chuẩn)"],
      ["npl_g2", "Phân loại nợ — Nhóm 2 (Cần chú ý)"],
      ["npl_g3", "Phân loại nợ — Nhóm 3 (Dưới tiêu chuẩn)"],
      ["npl_g4", "Phân loại nợ — Nhóm 4 (Nghi ngờ)"],
      ["npl_g5", "Phân loại nợ — Nhóm 5 (Có KN mất vốn)"],
      ["npl_dep", "Tổng vốn huy động (tính H1)"]
    ],
    ALM_FX_CAR_CAMEL: [
      ["ch2_p0", "C2 — Số tiền gốc P0"],
      ["ch2_r", "C2 — Lãi suất danh nghĩa r (%)"],
      ["ch2_t", "C2 — Kỳ hạn t (năm)"],
      ["ch2_n", "C2 — Số lần ghép lãi/năm"],
      ["ch2_r1", "C2 — Coupon 1Y (%)"],
      ["ch2_r2", "C2 — Coupon 2Y (%)"],
      ["ch2_r3", "C2 — Coupon 3Y (%)"],
      ["ch2_r4", "C2 — Coupon 4Y (%)"],
      ["ch2_arbRT", "C2 Arbitrage — LS Nội tệ R_T (%)"],
      ["ch2_arbRC", "C2 Arbitrage — LS Ngoại tệ R_C (%)"],
      ["ch2_arbS", "C2 Arbitrage — Tỷ giá giao ngay S"],
      ["ch2_arbF", "C2 Arbitrage — Tỷ giá kỳ hạn F"],
      ["ch2_arbM", "C2 Arbitrage — Kỳ hạn (tháng)"],
      ["rr_dR", "C3 — Biến động lãi suất ΔR (%)"],
      ["rr_A", "C3 — Tổng Tài sản có A"],
      ["rr_L", "C3 — Tổng Vốn huy động L"],
      ["rr_DA", "C3 — Thời lượng TSC D_A (năm)"],
      ["rr_DL", "C3 — Thời lượng TSN D_L (năm)"],
      ["rr_notional", "C4 — Giá trị danh nghĩa Phái sinh"],
      ["rr_swapFix", "C4 — LS Cố định Swap (%)"],
      ["rr_swapFlt", "C4 — LS Thả nổi (%)"],
      ["rr_cap", "C4 — Lãi suất trần Cap (%)"],
      ["rr_floor", "C4 — Lãi suất sàn Floor (%)"],
      ["fx_A", "C5 — TSC Ngoại tệ (Tr.USD)"],
      ["fx_L", "C5 — TSN Ngoại tệ (Tr.USD)"],
      ["fx_buy", "C5 — Ngoại tệ mua kỳ hạn"],
      ["fx_sell", "C5 — Ngoại tệ bán kỳ hạn"],
      ["fx_spot", "C5 — Tỷ giá giao ngay (VND/USD)"],
      ["fx_shock", "C5 — Cú sốc tỷ giá (%)"],
      ["liq_aNow", "C7 — TSC thanh toán ngay"],
      ["liq_lNow", "C7 — TSN thanh toán ngay"],
      ["liq_loans", "C7 — Tổng dư nợ (Loans)"],
      ["liq_core", "C7 — Tiền gửi cốt lõi (Core Dep.)"],
      ["liq_sup", "C7 — Cung thanh khoản"],
      ["liq_dem", "C7 — Cầu thanh khoản"],
      ["cmo_pool", "C9 — Quy mô gói CMO"],
      ["cmo_rate", "C9 — Lãi suất gói vay (%)"],
      ["cmo_prepay", "C9 — Tỷ lệ trả trước hạn (%)"],
      ["cc_t1", "C10 — Vốn cấp 1 (Tier 1)"],
      ["cc_t2", "C10 — Vốn cấp 2 (Tier 2)"],
      ["cc_ded", "C10 — Khoản giảm trừ vốn"],
      ["cc_on0", "C10 — TSC nội bảng RR 0%"],
      ["cc_on20", "C10 — TSC nội bảng RR 20%"],
      ["cc_on50", "C10 — TSC nội bảng RR 50%"],
      ["cc_on100", "C10 — TSC nội bảng RR 100%"],
      ["cc_off100", "C10 — Ngoại bảng CCF 100%"],
      ["cc_off50", "C10 — Ngoại bảng CCF 50%"],
      ["cc_ni", "C11 — Lợi nhuận sau thuế (NI)"],
      ["cc_nii", "C11 — Thu nhập lãi thuần (NII)"],
      ["cc_opinc", "C11 — Tổng thu nhập HĐ (TOI)"],
      ["cc_opexp", "C11 — Chi phí hoạt động (OpEx)"],
      ["cc_npl", "C11 — Tỷ lệ Nợ xấu NPL (%)"],
      ["cc_liq", "C11 — Tỷ lệ TS thanh khoản (%)"]
    ]
  };

  // =========================================================================
  // 1. XUẤT FILE EXCEL TỔNG (ALL-IN-ONE TEMPLATE .XLSX)
  // =========================================================================
  function exportAllInOneExcel() {
    try {
      if (typeof XLSX === "undefined") {
        throw new Error("Thư viện SheetJS chưa nạp được (kiểm tra kết nối mạng).");
      }
      const wb = XLSX.utils.book_new();

      Object.entries(EXCEL_SHEET_MAP).forEach(([sheetName, items]) => {
        const rows = [["Ma_Truong_ID", "Ten_Chi_Tieu", "Gia_Tri"]];
        items.forEach(([domId, label]) => {
          const el = $(domId);
          rows.push([domId, label, el ? el.value : ""]);
        });
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws["!cols"] = [{ wch: 18 }, { wch: 46 }, { wch: 24 }];
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      const scRows = global.CreditSampleData ? global.CreditSampleData.generateHomeCreditSample(300, 2026) : [];
      if (scRows.length) {
        const wsSc = XLSX.utils.json_to_sheet(scRows);
        XLSX.utils.book_append_sheet(wb, wsSc, "Scorecard_Data");
      }

      XLSX.writeFile(wb, "Crisk-boy_Master_Input_Template.xlsx");
      setStatus("globalStatus", "Đã tải File Excel Tổng (6 sheet)!", "ok");
    } catch (err) {
      setStatus("globalStatus", `Lỗi xuất Excel: ${err.message}`, "err");
    }
  }

  // =========================================================================
  // 2. NẠP FILE EXCEL TỔNG / CSV SCORECARD (TRẢ VỀ PROMISE CHO BATCH)
  // =========================================================================
  function importExcelWorkbook(file, opts = {}) {
    return new Promise((resolve) => {
      if (!file) return resolve({ ok: false, fileName: "", message: "Không có tệp." });
      try {
        if (!opts.deferRun) setStatus("uploadStatus", `Đang đọc file ${file.name}...`, "info");
        const reader = new FileReader();
        reader.onerror = () => resolve({ ok: false, fileName: file.name, message: "Không thể đọc tệp từ thiết bị." });
        reader.onload = function (e) {
          try {
            if (typeof XLSX === "undefined") {
              throw new Error("Thư viện SheetJS chưa nạp được.");
            }
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: "array" });

            let updatedFields = 0;
            let scorecardCount = 0;
            const knownSheets = Object.keys(EXCEL_SHEET_MAP);
            const hasMasterSheets = wb.SheetNames.some(n => knownSheets.includes(n));

            if (hasMasterSheets) {
              const extractedInputs = {};
              knownSheets.forEach(sName => {
                if (!wb.Sheets[sName]) return;
                const rows = XLSX.utils.sheet_to_json(wb.Sheets[sName], { defval: "" });
                rows.forEach(r => {
                  const domId = String(r.Ma_Truong_ID || r.ID || "").trim();
                  const val = r.Gia_Tri !== undefined ? r.Gia_Tri : r.Value;
                  if (domId && val !== "" && val !== undefined && $(domId)) {
                    $(domId).value = val;
                    if (isFinite(Number(val))) extractedInputs[domId] = Number(val);
                    updatedFields++;
                  }
                });
              });
              if (wb.Sheets["Scorecard_Data"]) {
                const sc = XLSX.utils.sheet_to_json(wb.Sheets["Scorecard_Data"], { defval: "" });
                if (sc.length && ("TARGET" in sc[0])) {
                  scorecardCount = sc.length;
                  if (global.setActiveScorecardDataset) global.setActiveScorecardDataset(sc);
                }
              }
              let detectedYear = null;
              if (global.MultiYearEngine && Object.keys(extractedInputs).length > 0) {
                detectedYear = global.MultiYearEngine.detectYearFromFilenameOrText(file.name, wb.SheetNames.join(" "));
                global.MultiYearEngine.upsertYearData(detectedYear, extractedInputs, file.name, false);
              }
              const msg = `Excel Tổng${detectedYear ? ` [Năm ${detectedYear}]` : ""} (${updatedFields} chỉ tiêu${scorecardCount ? ` + ${scorecardCount} dòng Scorecard` : ""})`;
              if (!opts.deferRun) {
                if (global.runAllModels) global.runAllModels();
                if (global.MultiYearEngine) global.MultiYearEngine.renderMultiYearUI();
                setStatus("uploadStatus", `✅ Đã nạp ${msg} từ ${file.name}`, "ok");
              }
              return resolve({ ok: true, fileName: file.name, type: "excel_master", detectedYear, updatedFields, scorecardCount, logRows: [], message: msg });
            } else {
              const firstSheet = wb.Sheets[wb.SheetNames[0]];
              const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
              if (!rows.length) throw new Error("Tệp dữ liệu trống.");
              if (!("TARGET" in rows[0])) {
                throw new Error("Không tìm thấy cột 'TARGET' hoặc cấu trúc sheet Excel Tổng.");
              }
              scorecardCount = rows.length;
              if (global.setActiveScorecardDataset) global.setActiveScorecardDataset(rows);
              const msg = `Scorecard (${scorecardCount.toLocaleString("vi-VN")} dòng)`;
              if (!opts.deferRun) {
                if (global.runScorecardUI) global.runScorecardUI();
                setStatus("uploadStatus", `✅ Đã nạp ${msg} từ ${file.name}`, "ok");
              }
              return resolve({ ok: true, fileName: file.name, type: "scorecard", updatedFields: 0, scorecardCount, logRows: [], message: msg });
            }
          } catch (err) {
            if (!opts.deferRun) setStatus("uploadStatus", `Lỗi đọc ${file.name}: ${err.message}`, "err");
            return resolve({ ok: false, fileName: file.name, type: "excel", message: err.message });
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        if (!opts.deferRun) setStatus("uploadStatus", `Lỗi: ${err.message}`, "err");
        resolve({ ok: false, fileName: file.name, type: "excel", message: err.message });
      }
    });
  }

  // =========================================================================
  // 3. QUÉT TỰ ĐỘNG PDF BCTC DOANH NGHIỆP & THUYẾT MINH BCTC NGÂN HÀNG
  // =========================================================================
  function parseNumberToken(str) {
    if (!str) return null;
    let s = String(str).trim();
    const isNeg = s.startsWith("(") && s.endsWith(")");
    s = s.replace(/[()]/g, "").trim();
    const dots = (s.match(/\./g) || []).length;
    const commas = (s.match(/,/g) || []).length;
    if (dots > 1 && commas === 0) {
      s = s.replace(/\./g, "");
    } else if (commas > 1 && dots === 0) {
      s = s.replace(/,/g, "");
    } else if (dots >= 1 && commas === 1 && s.indexOf(".") < s.indexOf(",")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (commas >= 1 && dots === 1 && s.indexOf(",") < s.indexOf(".")) {
      s = s.replace(/,/g, "");
    } else if (dots === 1 && s.split(".")[1].length === 3) {
      s = s.replace(/\./g, "");
    } else if (commas === 1 && s.split(",")[1].length === 3) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(/,/g, ".");
    }
    const num = Number(s);
    if (!isFinite(num)) return null;
    return isNeg ? -num : num;
  }

  function extractFirstLargeNumber(line, ignoreCodes = []) {
    const tokens = line.match(/\(?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?\)?|\(?\d+(?:[.,]\d+)?\)?/g) || [];
    const ignoreSet = new Set([...ignoreCodes.map(String), "2020", "2021", "2022", "2023", "2024", "2025", "2026", "2027"]);
    const candidates = [];
    for (const tk of tokens) {
      const clean = tk.replace(/[()]/g, "");
      if (ignoreSet.has(clean)) continue;
      if (/^\d{1,2}\.\d{1,2}$/.test(clean)) continue;
      const val = parseNumberToken(tk);
      if (val !== null && Math.abs(val) >= 1) {
        candidates.push({ raw: tk, val });
      }
    }
    if (candidates.length === 0) return null;
    const big = candidates.find(c => Math.abs(c.val) >= 100);
    return big || candidates[0];
  }

  const BCTC_RULES = [
    { id: "c_ca",    label: "Tài sản ngắn hạn", codes: ["100"], patterns: [/tài\s*sản\s*ngắn\s*hạn/i, /current\s*assets/i] },
    { id: "c_cash",  label: "Tiền & Tương đương tiền", codes: ["110"], patterns: [/tiền\s*và\s*các\s*khoản\s*tương\s*đương\s*tiền/i, /cash\s*and\s*cash\s*equivalents/i] },
    { id: "c_rec",   label: "Phải thu ngắn hạn KH", codes: ["131", "130"], patterns: [/phải\s*thu\s*ngắn\s*hạn\s*của\s*khách\s*hàng/i, /các\s*khoản\s*phải\s*thu\s*ngắn\s*hạn/i, /accounts?\s*receivable/i] },
    { id: "c_inv",   label: "Hàng tồn kho", codes: ["140", "141"], patterns: [/hàng\s*tồn\s*kho/i, /inventories/i] },
    { id: "c_ta",    label: "Tổng Tài sản", codes: ["270"], patterns: [/tổng\s*cộng\s*tài\s*sản/i, /tổng\s*tài\s*sản/i, /total\s*assets/i] },
    { id: "c_tl",    label: "Tổng Nợ phải trả", codes: ["300"], patterns: [/nợ\s*phải\s*trả/i, /total\s*liabilities/i] },
    { id: "c_cl",    label: "Nợ ngắn hạn", codes: ["310"], patterns: [/nợ\s*ngắn\s*hạn/i, /current\s*liabilities/i] },
    { id: "c_ltd",   label: "Nợ dài hạn", codes: ["330"], patterns: [/nợ\s*dài\s*hạn/i, /non-?current\s*liabilities/i, /long-?term\s*liabilities/i] },
    { id: "c_eq",    label: "Vốn chủ sở hữu", codes: ["400", "410"], patterns: [/vốn\s*chủ\s*sở\s*hữu/i, /total\s*(?:shareholders'?\s*)?equity/i] },
    { id: "c_re",    label: "Lợi nhuận giữ lại", codes: ["421"], patterns: [/lợi\s*nhuận\s*sau\s*thuế\s*chưa\s*phân\s*phối/i, /retained\s*earnings/i] },
    { id: "c_sales", label: "Doanh thu thuần", codes: ["10", "01"], patterns: [/doanh\s*thu\s*thuần/i, /net\s*(?:sales|revenue)/i] },
    { id: "c_cogs",  label: "Giá vốn hàng bán", codes: ["11"], patterns: [/giá\s*vốn\s*hàng\s*bán/i, /cost\s*of\s*goods\s*sold/i] },
    { id: "c_int",   label: "Chi phí lãi vay", codes: ["23"], patterns: [/chi\s*phí\s*lãi\s*vay/i, /interest\s*expense/i] },
    { id: "_ebt",    label: "Lợi nhuận trước thuế (EBT)", codes: ["50"], patterns: [/tổng\s*lợi\s*nhuận\s*kế\s*toán\s*trước\s*thuế/i, /lợi\s*nhuận\s*trước\s*thuế/i, /profit\s*before\s*tax/i] },
    { id: "c_ni",    label: "Lợi nhuận sau thuế", codes: ["60"], patterns: [/lợi\s*nhuận\s*sau\s*thuế\s*(?:thu\s*nhập\s*doanh\s*nghiệp|tndn)/i, /net\s*(?:profit|income)/i] }
  ];

  const BANK_NOTES_RULES = [
    { id: "npl_g1",   group: "Ngân hàng (NPL)", label: "Nợ nhóm 1 — Đủ tiêu chuẩn", codes: [], patterns: [/nợ\s*đủ\s*tiêu\s*chuẩn/i, /nhóm\s*1\b/i, /standard\s*loans?/i] },
    { id: "npl_g2",   group: "Ngân hàng (NPL)", label: "Nợ nhóm 2 — Cần chú ý", codes: [], patterns: [/nợ\s*cần\s*chú\s*ý/i, /nhóm\s*2\b/i, /special\s*mention/i] },
    { id: "npl_g3",   group: "Ngân hàng (NPL)", label: "Nợ nhóm 3 — Dưới tiêu chuẩn", codes: [], patterns: [/nợ\s*dưới\s*tiêu\s*chuẩn/i, /nhóm\s*3\b/i, /sub-?standard/i] },
    { id: "npl_g4",   group: "Ngân hàng (NPL)", label: "Nợ nhóm 4 — Nghi ngờ", codes: [], patterns: [/nợ\s*nghi\s*ngờ/i, /nhóm\s*4\b/i, /doubtful\s*loans?/i] },
    { id: "npl_g5",   group: "Ngân hàng (NPL)", label: "Nợ nhóm 5 — Có KN mất vốn", codes: [], patterns: [/nợ\s*có\s*khả\s*năng\s*mất\s*vốn/i, /nhóm\s*5\b/i, /loss\s*loans?/i] },
    { id: "npl_dep",  group: "Ngân hàng (NPL)", label: "Tiền gửi của khách hàng (Huy động)", codes: [], patterns: [/tiền\s*gửi\s*của\s*khách\s*hàng/i, /deposits\s*from\s*customers/i] },
    { id: "cc_nii",   group: "Ngân hàng (CAMEL)", label: "Thu nhập lãi thuần (NII)", codes: ["I"], patterns: [/thu\s*nhập\s*lãi\s*thuần/i, /net\s*interest\s*income/i] },
    { id: "cc_opinc", group: "Ngân hàng (CAMEL)", label: "Tổng thu nhập hoạt động (TOI)", codes: ["VII"], patterns: [/tổng\s*thu\s*nhập\s*hoạt\s*động/i, /total\s*operating\s*income/i] },
    { id: "cc_opexp", group: "Ngân hàng (CAMEL)", label: "Chi phí hoạt động (OpEx)", codes: ["VIII"], patterns: [/chi\s*phí\s*hoạt\s*động/i, /operating\s*expenses?/i] },
    { id: "cc_ni",    group: "Ngân hàng (CAMEL)", label: "Lợi nhuận sau thuế NH (NI)", codes: ["XIII"], patterns: [/lợi\s*nhuận\s*sau\s*thuế\s*(?:tndn|thu\s*nhập\s*doanh\s*nghiệp)?/i, /net\s*profit\s*after\s*tax/i] },
    { id: "cc_t1",    group: "Ngân hàng (CAR)", label: "Vốn cấp 1 (Tier 1)", codes: [], patterns: [/vốn\s*cấp\s*1/i, /tier\s*1\s*capital/i] },
    { id: "cc_t2",    group: "Ngân hàng (CAR)", label: "Vốn cấp 2 (Tier 2)", codes: [], patterns: [/vốn\s*cấp\s*2/i, /tier\s*2\s*capital/i] }
  ];

  function renderExtractLogTable(logRows, summaryText) {
    const logWrap = $("pdfExtractLog");
    if (!logWrap) return;
    if (!logRows || !logRows.length) {
      logWrap.style.display = "none";
      return;
    }
    logWrap.style.display = "block";
    logWrap.innerHTML = `
      <div style="font-weight:700; margin-bottom:6px;">${summaryText}</div>
      <div class="table-wrap" style="max-height:230px; overflow-y:auto;">
        <table>
          <thead>
            <tr>
              <th>Tệp nguồn</th>
              <th>Phân hệ</th>
              <th>Chỉ tiêu BCTC / Thuyết minh</th>
              <th class="num">Số gốc PDF</th>
              <th class="num">Đã nạp (Triệu VND)</th>
            </tr>
          </thead>
          <tbody>
            ${logRows.map(r => `
              <tr>
                <td><small style="color:var(--text-muted);">${r.sourceFile || "PDF"}</small></td>
                <td><span class="badge badge-info">${r.group}</span></td>
                <td><strong>${r.label}</strong></td>
                <td class="num">${r.raw}</td>
                <td class="num"><strong>${r.converted.toLocaleString("vi-VN")}</strong></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function importPdfBCTC(file, opts = {}) {
    if (!file) return { ok: false, fileName: "", message: "Không có tệp PDF." };
    try {
      if (!opts.deferRun) setStatus("pdfUploadStatus", `Đang quét văn bản từ PDF: ${file.name}...`, "info");
      if (typeof pdfjsLib === "undefined") {
        throw new Error("Thư viện PDF.js chưa nạp được (kiểm tra kết nối mạng).");
      }
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      const allLines = [];
      let totalChars = 0;

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const lineMap = {};
        content.items.forEach(item => {
          const str = (item.str || "").trim();
          if (!str) return;
          totalChars += str.length;
          const yKey = Math.round(item.transform[5] / 4) * 4;
          if (!lineMap[yKey]) lineMap[yKey] = [];
          lineMap[yKey].push({ x: item.transform[4], str });
        });
        Object.keys(lineMap)
          .sort((a, b) => Number(b) - Number(a))
          .forEach(yKey => {
            const lineText = lineMap[yKey]
              .sort((a, b) => a.x - b.x)
              .map(it => it.str)
              .join(" ");
            allLines.push(lineText);
          });
      }

      if (totalChars < 40) {
        const errMsg = "Bản scan dạng ảnh (không có lớp chữ text).";
        if (!opts.deferRun) setStatus("pdfUploadStatus", `⚠️ ${file.name}: ${errMsg}`, "err");
        return { ok: false, fileName: file.name, type: "pdf", message: errMsg, logRows: [] };
      }

      const found = {};
      const allRules = [
        ...BCTC_RULES.map(r => ({ ...r, group: "Doanh nghiệp (Tab 2.2)" })),
        ...BANK_NOTES_RULES
      ];
      for (const rule of allRules) {
        for (const line of allLines) {
          if (rule.patterns.some(rx => rx.test(line))) {
            const numMatch = extractFirstLargeNumber(line, rule.codes);
            if (numMatch) {
              found[rule.id] = { group: rule.group, label: rule.label, raw: numMatch.raw, val: numMatch.val };
              break;
            }
          }
        }
      }

      const unitMode = $("pdfUnitSelect") ? $("pdfUnitSelect").value : "auto";
      let divisor = 1;
      let unitLabel = "Triệu VND";
      const fullTextSample = allLines.slice(0, 120).join(" ");
      const refVal = found.c_ta ? Math.abs(found.c_ta.val) : (found.npl_g1 ? Math.abs(found.npl_g1.val) : (found.npl_dep ? Math.abs(found.npl_dep.val) : (found.c_sales ? Math.abs(found.c_sales.val) : 0)));

      if (unitMode === "vnd") { divisor = 1e6; unitLabel = "Đồng → Triệu"; }
      else if (unitMode === "thousand") { divisor = 1e3; unitLabel = "Nghìn → Triệu"; }
      else if (unitMode === "million") { divisor = 1; unitLabel = "Triệu VND"; }
      else if (unitMode === "billion") { divisor = 1e-3; unitLabel = "Tỷ → Triệu"; }
      else {
        if (/đơn\s*vị\s*tính\s*:?\s*(?:triệu|tr\.)/i.test(fullTextSample)) { divisor = 1; unitLabel = "Tự nhận: Triệu VND"; }
        else if (/đơn\s*vị\s*tính\s*:?\s*(?:nghìn|ngàn)/i.test(fullTextSample)) { divisor = 1e3; unitLabel = "Tự nhận: Nghìn → Triệu"; }
        else if (/đơn\s*vị\s*tính\s*:?\s*tỷ/i.test(fullTextSample)) { divisor = 1e-3; unitLabel = "Tự nhận: Tỷ → Triệu"; }
        else if (refVal >= 1e9) { divisor = 1e6; unitLabel = "Tự nhận: VND → Triệu"; }
        else if (refVal >= 1e6) { divisor = 1e3; unitLabel = "Tự nhận: Nghìn → Triệu"; }
        else { divisor = 1; unitLabel = "Tự nhận: Triệu VND"; }
      }

      if (found._ebt) {
        const intAbs = found.c_int ? Math.abs(found.c_int.val) : 0;
        found.c_ebit = {
          group: "Doanh nghiệp (Tab 2.2)",
          label: "EBIT (LNTT + Lãi vay)",
          raw: `${found._ebt.raw} + ${found.c_int ? found.c_int.raw : "0"}`,
          val: found._ebt.val + intAbs
        };
      }

      const detectedYear = global.MultiYearEngine
        ? global.MultiYearEngine.detectYearFromFilenameOrText(file.name, fullTextSample)
        : String(new Date().getFullYear());

      let filledCount = 0;
      let hasCorp = false, hasNpl = false, hasCarCamel = false;
      const extractedInputs = {};
      const logRows = [];
      Object.entries(found).forEach(([domId, info]) => {
        if (domId === "_ebt") return;
        const converted = +(info.val / divisor).toFixed(2);
        const absNeeded = ["c_cogs", "c_int", "cc_opexp", "npl_g1", "npl_g2", "npl_g3", "npl_g4", "npl_g5", "npl_dep"].includes(domId)
          ? Math.abs(converted)
          : converted;
        if ($(domId)) {
          $(domId).value = absNeeded;
          extractedInputs[domId] = absNeeded;
          filledCount++;
          if (domId.startsWith("c_")) hasCorp = true;
          if (domId.startsWith("npl_")) hasNpl = true;
          if (domId.startsWith("cc_")) hasCarCamel = true;
        }
        logRows.push({ sourceFile: `${file.name} (${detectedYear})`, domId, group: info.group || "BCTC", label: info.label, raw: info.raw, converted: absNeeded });
      });

      if (filledCount > 0 && global.MultiYearEngine) {
        global.MultiYearEngine.upsertYearData(detectedYear, extractedInputs, file.name, false);
      }

      if (hasNpl && found.npl_g1) {
        const g1 = Math.abs(Number($("npl_g1").value) || 0);
        const g2 = Math.abs(Number($("npl_g2").value) || 0);
        const g3 = Math.abs(Number($("npl_g3").value) || 0);
        const g4 = Math.abs(Number($("npl_g4").value) || 0);
        const g5 = Math.abs(Number($("npl_g5").value) || 0);
        const tot = g1 + g2 + g3 + g4 + g5;
        if (tot > 0 && $("cc_npl")) {
          $("cc_npl").value = +(((g3 + g4 + g5) / tot) * 100).toFixed(2);
          hasCarCamel = true;
        }
      }

      if (filledCount === 0) {
        const msg = `Đọc ${pdf.numPages} trang nhưng không khớp tên chỉ tiêu BCTC/Thuyết minh chuẩn.`;
        if (!opts.deferRun) setStatus("pdfUploadStatus", msg, "err");
        return { ok: false, fileName: file.name, type: "pdf", message: msg, logRows: [] };
      }

      if (!opts.deferRun) {
        renderExtractLogTable(logRows, `Kết quả bóc tách tự động (${filledCount} chỉ tiêu • ${unitLabel} • ${pdf.numPages} trang):`);
        const updatedMods = [];
        if (hasCorp && global.runCorporateUI) { global.runCorporateUI(); updatedMods.push("Doanh nghiệp"); }
        if (hasNpl && global.runNplUI) { global.runNplUI(); updatedMods.push("NPL"); }
        if (hasCarCamel && global.runCarCamelUI) { global.runCarCamelUI(); updatedMods.push("CAR & CAMEL"); }
        setStatus("pdfUploadStatus", `✅ Quét ${filledCount} chỉ tiêu từ ${file.name} (${unitLabel}) → Cập nhật ${updatedMods.join(", ")} & BI Dashboard!`, "ok");
      }

      return {
        ok: true,
        fileName: file.name,
        type: "pdf",
        detectedYear,
        updatedFields: filledCount,
        scorecardCount: 0,
        hasCorp, hasNpl, hasCarCamel,
        unitLabel,
        pages: pdf.numPages,
        logRows,
        message: `PDF (${filledCount} chỉ tiêu • ${pdf.numPages}tr • ${unitLabel})`
      };
    } catch (err) {
      if (!opts.deferRun) setStatus("pdfUploadStatus", `Lỗi quét PDF ${file.name}: ${err.message}`, "err");
      return { ok: false, fileName: file.name, type: "pdf", message: err.message, logRows: [] };
    }
  }

  // =========================================================================
  // 4. NẠP HÀNG LOẠT NHIỀU TỆP CÙNG 1 LÚC (BATCH MULTI-FILE UPLOAD)
  // =========================================================================
  async function importMultipleFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;

    // Ưu tiên nạp Excel/CSV trước (để lấy khung nền), sau đó quét tuần tự các file PDF BCTC / Thuyết minh đè lên
    const excelFiles = [];
    const pdfFiles = [];
    const unknownFiles = [];

    files.forEach(f => {
      const name = (f.name || "").toLowerCase();
      if (name.endsWith(".pdf") || f.type === "application/pdf") pdfFiles.push(f);
      else if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) excelFiles.push(f);
      else unknownFiles.push(f);
    });

    const ordered = [...excelFiles, ...pdfFiles];
    const totalCount = files.length;
    setStatus("globalStatus", `Đang xử lý ${totalCount} tệp cùng lúc...`, "info");
    setStatus("uploadStatus", `Đang xử lý ${totalCount} tệp cùng lúc...`, "info");

    const results = [];
    const allLogRows = [];
    let totalFields = 0;
    let totalScorecardRows = 0;
    let anyNplUpdated = false;

    for (let i = 0; i < ordered.length; i++) {
      const f = ordered[i];
      setStatus("globalStatus", `Đang đọc tệp ${i + 1}/${ordered.length}: ${f.name}...`, "info");
      const name = (f.name || "").toLowerCase();
      let res;
      if (name.endsWith(".pdf") || f.type === "application/pdf") {
        res = await importPdfBCTC(f, { deferRun: true });
      } else {
        res = await importExcelWorkbook(f, { deferRun: true });
      }
      results.push(res);
      if (res.ok) {
        totalFields += res.updatedFields || 0;
        if (res.scorecardCount) totalScorecardRows = res.scorecardCount;
        if (res.hasNpl) anyNplUpdated = true;
        if (res.logRows && res.logRows.length) allLogRows.push(...res.logRows);
      }
    }

    unknownFiles.forEach(f => {
      results.push({ ok: false, fileName: f.name, message: "Định dạng không hỗ trợ (chỉ nhận .xlsx, .xls, .csv, .pdf)." });
    });

    // Tính lại % NPL tổng hợp sau khi gộp tất cả các tệp (phòng trường hợp Nhóm 1-5 nằm ở tệp Thuyết minh riêng)
    if (anyNplUpdated) {
      const g1 = Math.abs(Number($("npl_g1")?.value) || 0);
      const g2 = Math.abs(Number($("npl_g2")?.value) || 0);
      const g3 = Math.abs(Number($("npl_g3")?.value) || 0);
      const g4 = Math.abs(Number($("npl_g4")?.value) || 0);
      const g5 = Math.abs(Number($("npl_g5")?.value) || 0);
      const tot = g1 + g2 + g3 + g4 + g5;
      if (tot > 0 && $("cc_npl")) {
        $("cc_npl").value = +(((g3 + g4 + g5) / tot) * 100).toFixed(2);
      }
    }

    const okList = results.filter(r => r.ok);
    const errList = results.filter(r => !r.ok);

    const detectedYears = Array.from(new Set(okList.map(r => r.detectedYear).filter(Boolean))).sort();

    // Nếu có nạp dữ liệu đa năm, tự động nạp năm mới nhất vào giao diện hoạt động & cập nhật biểu đồ xu hướng đa năm
    if (detectedYears.length > 0 && global.MultiYearEngine) {
      const latestYr = detectedYears[detectedYears.length - 1];
      global.MultiYearEngine.selectYear(latestYr);
    } else if (okList.length > 0 && global.runAllModels) {
      global.runAllModels();
    }

    // Hiển thị bảng đối chiếu gộp cho tất cả PDF đã quét
    if (allLogRows.length > 0) {
      renderExtractLogTable(
        allLogRows,
        `Kết quả gộp từ ${pdfFiles.length} tệp PDF (${allLogRows.length} chỉ tiêu${detectedYears.length ? ` • Các năm: ${detectedYears.join(", ")}` : ""}):`
      );
    }

    // Tạo thông báo trạng thái ngắn gọn & đầy đủ
    const summaryParts = [];
    if (detectedYears.length > 0) summaryParts.push(`Năm: ${detectedYears.join(", ")}`);
    if (totalFields > 0) summaryParts.push(`${totalFields} chỉ tiêu`);
    if (totalScorecardRows > 0) summaryParts.push(`${totalScorecardRows.toLocaleString("vi-VN")} dòng Scorecard`);

    if (okList.length > 0 && errList.length === 0) {
      const okMsg = `✅ Đã nạp gộp ${okList.length}/${totalCount} tệp (${summaryParts.join(" + ") || "hoàn tất"}) & tự chạy toàn bộ 7 Tab!`;
      setStatus("globalStatus", okMsg, "ok");
      setStatus("uploadStatus", okMsg, "ok");
    } else if (okList.length > 0 && errList.length > 0) {
      const warnMsg = `⚠️ Thành công ${okList.length}/${totalCount} tệp (${summaryParts.join(" + ")}). Lỗi ${errList.length} tệp: ${errList.map(e => `${e.fileName} (${e.message})`).join("; ")}`;
      setStatus("globalStatus", warnMsg, "info");
      setStatus("uploadStatus", warnMsg, "info");
    } else {
      const errMsg = `❌ Không nạp được tệp nào: ${errList.map(e => `${e.fileName} (${e.message})`).join("; ")}`;
      setStatus("globalStatus", errMsg, "err");
      setStatus("uploadStatus", errMsg, "err");
    }
  }

  function importAnyFile(file) {
    if (!file) return;
    importMultipleFiles([file]);
  }

  global.DataImporter = {
    exportAllInOneExcel,
    importExcelWorkbook,
    importPdfBCTC,
    importMultipleFiles,
    importAnyFile
  };
})(window);

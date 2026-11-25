/* data_importer.js v2.8 — Nạp/Xuất 1 file Excel Tổng (All-in-One) & Quét tự động PDF BCTC Doanh nghiệp (PDF.js) */
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

      // Sheet 1..5: Các bảng thông số Key-Value
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

      // Sheet 6: Scorecard_Data (300 dòng mẫu gọn nhẹ để người dùng dễ sửa & upload nhanh)
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
  // 2. NẠP FILE EXCEL TỔNG (ALL-IN-ONE) HOẶC FILE SCORECARD ĐƠN LẺ
  // =========================================================================
  function importExcelWorkbook(file) {
    if (!file) return;
    try {
      setStatus("uploadStatus", `Đang đọc file ${file.name}...`, "info");
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          if (typeof XLSX === "undefined") {
            throw new Error("Thư viện SheetJS chưa nạp được.");
          }
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: "array" });

          let updatedFields = 0;
          let scorecardRows = null;

          // Kiểm tra xem có phải File Excel Tổng nhiều sheet không
          const knownSheets = Object.keys(EXCEL_SHEET_MAP);
          const hasMasterSheets = wb.SheetNames.some(n => knownSheets.includes(n));

          if (hasMasterSheets) {
            knownSheets.forEach(sName => {
              if (!wb.Sheets[sName]) return;
              const rows = XLSX.utils.sheet_to_json(wb.Sheets[sName], { defval: "" });
              rows.forEach(r => {
                const domId = String(r.Ma_Truong_ID || r.ID || "").trim();
                const val = r.Gia_Tri !== undefined ? r.Gia_Tri : r.Value;
                if (domId && val !== "" && val !== undefined && $(domId)) {
                  $(domId).value = val;
                  updatedFields++;
                }
              });
            });
            if (wb.Sheets["Scorecard_Data"]) {
              const sc = XLSX.utils.sheet_to_json(wb.Sheets["Scorecard_Data"], { defval: "" });
              if (sc.length && ("TARGET" in sc[0])) scorecardRows = sc;
            }
            if (scorecardRows && global.setActiveScorecardDataset) {
              global.setActiveScorecardDataset(scorecardRows);
            }
            if (global.runAllModels) global.runAllModels();
            setStatus(
              "uploadStatus",
              `✅ Đã nạp Excel Tổng: tự động điền ${updatedFields} chỉ tiêu${scorecardRows ? ` + ${scorecardRows.length} dòng Scorecard` : ""} & chạy lại toàn bộ 7 Tab!`,
              "ok"
            );
          } else {
            // File đơn lẻ Scorecard (CSV / XLSX có cột TARGET)
            const firstSheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
            if (!rows.length) throw new Error("Tệp dữ liệu trống.");
            if (!("TARGET" in rows[0])) {
              throw new Error("Không tìm thấy cột 'TARGET' hoặc cấu trúc sheet Excel Tổng (hãy tải File Excel Tổng mẫu để xem định dạng).");
            }
            if (global.setActiveScorecardDataset) global.setActiveScorecardDataset(rows);
            if (global.runScorecardUI) global.runScorecardUI();
            setStatus("uploadStatus", `✅ Đã nạp ${rows.length.toLocaleString("vi-VN")} dòng Scorecard từ ${file.name}`, "ok");
          }
        } catch (err) {
          setStatus("uploadStatus", `Lỗi đọc Excel/CSV: ${err.message}`, "err");
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setStatus("uploadStatus", `Lỗi: ${err.message}`, "err");
    }
  }

  // =========================================================================
  // 3. QUÉT TỰ ĐỘNG PDF BCTC DOANH NGHIỆP (THÔNG TƯ 200 / 133 & ENGLISH)
  // =========================================================================
  function parseNumberToken(str) {
    if (!str) return null;
    let s = String(str).trim();
    const isNeg = s.startsWith("(") && s.endsWith(")");
    s = s.replace(/[()]/g, "").trim();
    // Xử lý định dạng số Việt Nam (1.234.567 hoặc 1,234,567)
    const dots = (s.match(/\./g) || []).length;
    const commas = (s.match(/,/g) || []).length;
    if (dots > 1 && commas === 0) {
      s = s.replace(/\./g, "");
    } else if (commas > 1 && dots === 0) {
      s = s.replace(/,/g, "");
    } else if (dots >= 1 && commas === 1 && s.indexOf(".") < s.indexOf(",")) {
      // Kiểu VN: 1.234.567,89
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (commas >= 1 && dots === 1 && s.indexOf(",") < s.indexOf(".")) {
      // Kiểu Mỹ: 1,234,567.89
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
    // Tìm các token số trên cùng 1 dòng (bỏ qua mã số kế toán như 100, 270, 300, 400 và năm 2023/2024/2025/2026)
    const tokens = line.match(/\(?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?\)?|\(?\d+(?:[.,]\d+)?\)?/g) || [];
    const ignoreSet = new Set([...ignoreCodes.map(String), "2020", "2021", "2022", "2023", "2024", "2025", "2026", "2027"]);
    const candidates = [];
    for (const tk of tokens) {
      const clean = tk.replace(/[()]/g, "");
      if (ignoreSet.has(clean)) continue;
      // Bỏ qua số thuyết minh dạng 5.1, V.01
      if (/^\d{1,2}\.\d{1,2}$/.test(clean)) continue;
      const val = parseNumberToken(tk);
      if (val !== null && Math.abs(val) >= 1) {
        candidates.push({ raw: tk, val });
      }
    }
    // Trên BCTC VN, cột đầu tiên sau Mã số & Thuyết minh thường là Số cuối kỳ / Năm nay
    if (candidates.length === 0) return null;
    // Ưu tiên số có độ lớn >= 100 (tránh nhầm số thứ tự thuyết minh)
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

  async function importPdfBCTC(file) {
    if (!file) return;
    try {
      setStatus("pdfUploadStatus", `Đang quét văn bản từ PDF: ${file.name}...`, "info");
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
        // Gom các text item theo tọa độ Y (cùng 1 dòng bảng BCTC)
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
        setStatus(
          "pdfUploadStatus",
          "⚠️ File PDF này là bản scan dạng ảnh (không có lớp chữ text). Hãy dùng file PDF xuất từ phần mềm kế toán/Word hoặc dùng File Excel Tổng.",
          "err"
        );
        return;
      }

      // Quét khớp từng chỉ tiêu BCTC
      const found = {};
      for (const rule of BCTC_RULES) {
        for (const line of allLines) {
          if (rule.patterns.some(rx => rx.test(line))) {
            const numMatch = extractFirstLargeNumber(line, rule.codes);
            if (numMatch) {
              found[rule.id] = { label: rule.label, raw: numMatch.raw, val: numMatch.val, line: line.slice(0, 95) };
              break;
            }
          }
        }
      }

      // Tự động nhận diện đơn vị tiền tệ để quy về Triệu VND
      const unitMode = $("pdfUnitSelect") ? $("pdfUnitSelect").value : "auto";
      let divisor = 1;
      let unitLabel = "Triệu VND";
      const fullTextSample = allLines.slice(0, 120).join(" ");
      const refVal = found.c_ta ? Math.abs(found.c_ta.val) : (found.c_sales ? Math.abs(found.c_sales.val) : 0);

      if (unitMode === "vnd") { divisor = 1e6; unitLabel = "Đồng → quy Triệu VND"; }
      else if (unitMode === "thousand") { divisor = 1e3; unitLabel = "Nghìn đồng → quy Triệu VND"; }
      else if (unitMode === "million") { divisor = 1; unitLabel = "Triệu VND"; }
      else if (unitMode === "billion") { divisor = 1e-3; unitLabel = "Tỷ VND → quy Triệu VND"; }
      else {
        // Tự động phát hiện
        if (/đơn\s*vị\s*tính\s*:?\s*(?:triệu|tr\.)/i.test(fullTextSample)) { divisor = 1; unitLabel = "Tự nhận: Triệu VND"; }
        else if (/đơn\s*vị\s*tính\s*:?\s*(?:nghìn|ngàn)/i.test(fullTextSample)) { divisor = 1e3; unitLabel = "Tự nhận: Nghìn VND → Triệu"; }
        else if (/đơn\s*vị\s*tính\s*:?\s*tỷ/i.test(fullTextSample)) { divisor = 1e-3; unitLabel = "Tự nhận: Tỷ VND → Triệu"; }
        else if (refVal >= 1e9) { divisor = 1e6; unitLabel = "Tự nhận: VND → quy Triệu VND"; }
        else if (refVal >= 1e6) { divisor = 1e3; unitLabel = "Tự nhận: Nghìn VND → quy Triệu VND"; }
        else { divisor = 1; unitLabel = "Tự nhận: Triệu VND"; }
      }

      // Tính EBIT = LN trước thuế (EBT) + Chi phí lãi vay nếu có
      if (found._ebt) {
        const intAbs = found.c_int ? Math.abs(found.c_int.val) : 0;
        found.c_ebit = {
          label: "EBIT (tính từ LNTT + Lãi vay)",
          raw: `${found._ebt.raw} + ${found.c_int ? found.c_int.raw : "0"}`,
          val: found._ebt.val + intAbs,
          line: "Tự động tính: EBIT = LN trước thuế + Chi phí lãi vay"
        };
      }

      // Điền tự động vào các ô input của Tab 2.2 (Doanh nghiệp)
      let filledCount = 0;
      const logRows = [];
      Object.entries(found).forEach(([domId, info]) => {
        if (domId === "_ebt") return;
        const converted = +(info.val / divisor).toFixed(2);
        const absNeeded = ["c_cogs", "c_int"].includes(domId) ? Math.abs(converted) : converted;
        if ($(domId)) {
          $(domId).value = absNeeded;
          filledCount++;
        }
        logRows.push({ domId, label: info.label, raw: info.raw, converted: absNeeded });
      });

      // Cập nhật bảng log trích xuất
      const logWrap = $("pdfExtractLog");
      if (logWrap) {
        if (logRows.length) {
          logWrap.style.display = "block";
          logWrap.innerHTML = `
            <div style="font-weight:700; margin-bottom:6px;">Kết quả bóc tách tự động (${filledCount} chỉ tiêu • ${unitLabel} • ${pdf.numPages} trang):</div>
            <div class="table-wrap" style="max-height:200px; overflow-y:auto;">
              <table>
                <thead><tr><th>Chỉ tiêu BCTC</th><th class="num">Số gốc trong PDF</th><th class="num">Đã nạp (Triệu VND)</th></tr></thead>
                <tbody>
                  ${logRows.map(r => `<tr><td><strong>${r.label}</strong></td><td class="num">${r.raw}</td><td class="num"><strong>${r.converted.toLocaleString("vi-VN")}</strong></td></tr>`).join("")}
                </tbody>
              </table>
            </div>
          `;
        } else {
          logWrap.style.display = "none";
        }
      }

      if (filledCount === 0) {
        setStatus("pdfUploadStatus", `Đã đọc ${pdf.numPages} trang nhưng không khớp tên chỉ tiêu BCTC chuẩn (TT200/TT133).`, "err");
        return;
      }

      // Tự động chạy lại mô hình Doanh nghiệp & đồng bộ BI Dashboard
      if (global.runCorporateUI) global.runCorporateUI();
      setStatus("pdfUploadStatus", `✅ Quét thành công ${filledCount} chỉ tiêu từ ${file.name} (${unitLabel}) → Đã tự động nhảy số Altman Z, 5 nhóm tỷ số & BI Dashboard!`, "ok");
    } catch (err) {
      setStatus("pdfUploadStatus", `Lỗi quét PDF: ${err.message}`, "err");
    }
  }

  global.DataImporter = {
    exportAllInOneExcel,
    importExcelWorkbook,
    importPdfBCTC
  };
})(window);

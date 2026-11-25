/* sample_data.js — Dữ liệu mẫu chuẩn hóa cho toàn bộ 6 module (Home Credit, Doanh nghiệp, Tiêu dùng, Basel II, Dự án, Nợ xấu) */
(function (global) {
  "use strict";

  // Seeded PRNG (Mulberry32) để kết quả tái lập 100%
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randNorm(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // Sinh bộ dữ liệu Home Credit Default Risk mô phỏng (1.500 khách hàng)
  function generateHomeCreditSample(n = 1500, seed = 2026) {
    const rng = mulberry32(seed);
    const rows = [];
    const eduList = ["Sau ĐH", "Đại học", "Cao đẳng", "THPT"];
    const houseList = ["Nhà riêng", "Trả góp", "Thuê nhà", "Ở cùng người thân"];

    for (let i = 1; i <= n; i++) {
      const extScore = Math.min(0.98, Math.max(0.05, 0.55 + randNorm(rng) * 0.2));
      const age = Math.round(Math.min(65, Math.max(21, 37 + randNorm(rng) * 10)));
      const employed = Math.max(0, Math.round((age - 20) * (0.25 + rng() * 0.55)));
      const income = Math.round(Math.max(5, 18 + randNorm(rng) * 9 + employed * 0.45)); // triệu VND/tháng
      const loanRatio = Math.max(0.5, +(2.4 + randNorm(rng) * 1.1).toFixed(2)); // Dư nợ / Thu nhập năm
      const prevLate = rng() < 0.62 ? 0 : Math.round(Math.pow(rng(), 2) * 90); // Số ngày trễ hạn quá khứ
      const eduIdx = Math.min(3, Math.floor(rng() * 4));
      const houseIdx = Math.min(3, Math.floor(rng() * 4));

      // Log-odds thực tế tạo ra mối quan hệ đơn điệu chuẩn ngân hàng
      const z =
        -1.35
        - 3.4 * (extScore - 0.52)
        - 0.032 * (age - 35)
        - 0.08 * Math.min(employed, 15)
        - 0.025 * (income - 18)
        + 0.45 * (loanRatio - 2.2)
        + 0.022 * prevLate
        + 0.16 * eduIdx
        + 0.18 * houseIdx
        + randNorm(rng) * 0.55;

      const prob = 1 / (1 + Math.exp(-z));
      const target = rng() < prob ? 1 : 0;

      rows.push({
        SK_ID_CURR: 100000 + i,
        EXT_SOURCE: +extScore.toFixed(3),
        AGE_YEARS: age,
        EMPLOYED_YEARS: employed,
        INCOME_TRIEU: income,
        CREDIT_INCOME_RATIO: loanRatio,
        PREV_LATE_DAYS: prevLate,
        EDUCATION: eduList[eduIdx],
        HOUSING_TYPE: houseList[houseIdx],
        TARGET: target
      });
    }
    return rows;
  }

  // Preset mặc định cho các mô hình khác trong giáo trình
  const PRESETS = {
    corporate: {
      companyName: "CTCP Sản xuất ABC",
      currentAssets: 45000,
      inventories: 12000,
      cash: 8500,
      currentLiabilities: 26000,
      totalAssets: 120000,
      totalLiabilities: 62000,
      longTermDebt: 36000,
      totalEquity: 58000,
      retainedEarnings: 19500,
      sales: 145000,
      cogs: 98000,
      receivables: 18500,
      ebit: 16800,
      interestExpense: 3200,
      netIncome: 10880,
      marketValueEquity: 84000,
      shares: 4000,
      stockPrice: 21
    },
    qualitative: {
      c6: { Capacity: 8, Character: 9, Cash: 7, Collateral: 8, Conditions: 7, Control: 8 },
      p5: { Person: 8, Purpose: 9, PaymentSource: 7, Policy: 8, Properties: 8 },
      campari: { Character: 9, Ability: 8, Margin: 7, Purpose: 8, Amount: 8, Repayment: 7, Insurance: 8 }
    },
    consumer: {
      job: 10,
      housing: 6,
      creditRating: 10,
      experience: 5,
      residenceTime: 2,
      landline: 2,
      dependents: 4,
      bankAccount: 4
    },
    termStructure: {
      i1: 10.0,
      i2: 11.0,
      i3: 11.8,
      k1: 15.8,
      k2: 18.0,
      k3: 19.8,
      beta: 0.0
    },
    baselStandardized: [
      { name: "Cho vay DN xếp hạng A", amount: 100, weight: 50 },
      { name: "Trái phiếu Chính phủ AAA", amount: 10, weight: 0 },
      { name: "Thế chấp nhà ở dân cư", amount: 50, weight: 35 },
      { name: "Cho vay bán lẻ (Retail)", amount: 40, weight: 75 },
      { name: "Cho vay DN chưa xếp hạng", amount: 30, weight: 100 }
    ],
    baselIRB: {
      ead: 100,
      pd: 0.1,     // % (0.1% = 0.001)
      lgd: 60,     // %
      maturity: 2.5
    },
    projectFinance: {
      discountRate: 12,
      cashFlows: [-10000, 3200, 3800, 4200, 4500, 5000],
      fixedCost: 2400,
      pricePerUnit: 50,
      varCostPerUnit: 30,
      periodQuantity: 200,
      periodDays: 360
    },
    repayment: {
      rateAnnual: 10,
      tranches: [
        { date: "24/04/2013", days: 24, amount: 4000 },
        { date: "18/05/2013", days: 31, amount: 6000 },
        { date: "18/06/2013", days: 61, amount: 3000 },
        { date: "18/08/2013", days: 61, amount: 2000 },
        { date: "18/10/2013", days: 74, amount: 5000 }
      ],
      capitalizeInterest: true,
      repayYears: 3,
      periodsPerYear: 2,
      depreciationAnnual: 5000,
      netProfitAnnual: 6000,
      fundRetentionPct: 50
    },
    portfolioNPL: {
      g1: 82000,
      g2: 6500,
      g3: 2400,
      g4: 1300,
      g5: 900,
      totalDeposits: 112000,
      totalAssets: 135000,
      riskWeightedAssets: 98000,
      totalCustomers: 1250,
      overdueCustomers: 115,
      totalExposureOfOverdue: 14200
    }
  };


  // Presets bổ sung v2.0 — Dữ liệu chuẩn từ Giáo trình PGS.TS Nguyễn Văn Tiến (Chương 2, 3, 4, 5, 7, 9, 10, 11)
  PRESETS.ch2Interest = {
    principal: 1000,
    nominalRate: 12,
    years: 5,
    compoundingPerYear: 1,
    grossMargin: 0.18,
    lshvbqTable: [
      { term: "Không kỳ hạn", rate: 0.20, reserve: 3, util: 50, weight: 20 },
      { term: "Kỳ hạn 1 tháng", rate: 0.40, reserve: 3, util: 75, weight: 10 },
      { term: "Kỳ hạn 2 tháng", rate: 0.45, reserve: 3, util: 80, weight: 10 },
      { term: "Kỳ hạn 3 tháng", rate: 0.52, reserve: 3, util: 88, weight: 20 },
      { term: "Kỳ hạn 6 tháng", rate: 0.55, reserve: 3, util: 90, weight: 15 },
      { term: "Kỳ hạn 9 tháng", rate: 0.55, reserve: 3, util: 90, weight: 10 },
      { term: "Kỳ hạn 12 tháng", rate: 0.60, reserve: 0, util: 92, weight: 10 },
      { term: "Trên 12 tháng", rate: 0.65, reserve: 0, util: 92, weight: 5 }
    ],
    r1: 8.0, r2: 9.0, r3: 9.5, r4: 10.0,
    arbRT: 11.0, arbRC: 6.5, arbSpot: 14589, arbForward: 14764, arbMonths: 3
  };

  PRESETS.ch34RateRisk = {
    deltaR: 1.0,
    repricingBuckets: [
      { bucket: "1 ngày", rsa: 20, rsl: 30 },
      { bucket: "Trên 1 ngày – 3 tháng", rsa: 30, rsl: 40 },
      { bucket: "Trên 3 tháng – 6 tháng", rsa: 70, rsl: 85 },
      { bucket: "Trên 6 tháng – 12 tháng", rsa: 90, rsl: 70 },
      { bucket: "Trên 12 tháng – 5 năm", rsa: 40, rsl: 30 },
      { bucket: "Trên 5 năm", rsa: 10, rsl: 5 }
    ],
    totalAssets: 100,
    totalLiabilities: 90,
    durationA: 5.0,
    durationL: 3.0,
    baseRate: 10.0,
    swapNotional: 100,
    swapFixed: 9.5,
    swapFloat: 11.0,
    capStrike: 10.0,
    floorStrike: 7.5,
    capPremium: 0.5
  };

  PRESETS.ch579FxLiqCmo = {
    fxAssets: 100,
    fxLiabilities: 80,
    fxBought: 15,
    fxSold: 10,
    fxSpot: 25400,
    fxShockPct: -2.0,
    liqAssetsNow: 42000,
    liqLiabNow: 36000,
    liqLoans: 110000,
    liqCoreDeposits: 92000,
    liqLiquidAssets: 15000,
    liqShortFunding: 85000,
    liqMedLongFromShort: 21000,
    liqSupply: 52000,
    liqDemand: 47500,
    cmoPool: 1000,
    cmoRate: 8.5,
    cmoPrepay: 12.0
  };

  PRESETS.ch1011CarCamel = {
    tier1Capital: 12500,
    tier2Capital: 3500,
    capitalDeductions: 500,
    on0: 25000,
    on20: 18000,
    on50: 22000,
    on100: 115000,
    off100: 6000,
    off50: 12000,
    off2: 40000,
    bankNetIncome: 2450,
    bankNii: 6100,
    bankOpIncome: 8200,
    bankOpExpense: 3150,
    bankEarningAssets: 162000,
    camelNplPct: 2.1,
    camelLiqPct: 22.5
  };


  PRESETS.baselIII = {
    cet1: 11.5,        // Tr. USD
    at1: 2.0,          // Tr. USD
    tier2: 3.5,        // Tr. USD
    rwaStd: 145.0,     // RWA Chuẩn hóa (Tr. USD)
    rwaIrb: 95.0,      // RWA IRB nội bộ (Tr. USD) — dùng tính Output Floor 72.5%
    totalExposure: 320.0, // Tổng phơi nhiễm nội + ngoại bảng cho Leverage Ratio
    ccybPct: 1.0,      // Bộ đệm phản chu kỳ (0 - 2.5%)
    hqla: 42.0,        // Tài sản thanh khoản chất lượng cao (HQLA)
    netOutflows30d: 35.0, // Dòng tiền ra ròng 30 ngày
    asf: 185.0,        // Nguồn vốn ổn định sẵn có (Available Stable Funding)
    rsf: 160.0         // Nguồn vốn ổn định yêu cầu (Required Stable Funding)
  };


  // Bộ dữ liệu 4 công ty mẫu (VNM, MSN, SBT, MCM) tích hợp sẵn vào menu chọn nhanh
  const SAMPLE_COMPANIES = {"VNM": {"ticker": "VNM", "name": "CTCP Sữa Việt Nam (Vinamilk)", "label": "1. Vinamilk (VNM)", "source": "BCTC Hợp nhất kiểm toán KPMG (2021–2025)", "years": {"2021": {"c_ca": 36109911, "c_inv": 6773072, "c_cash": 23374288, "c_cl": 17068417, "c_ta": 53332403, "c_tl": 17482289, "c_ltd": 75636, "c_eq": 35850114, "c_re": 7594260, "c_sales": 60919165, "c_cogs": 34640863, "c_rec": 5822029, "c_ebit": 13011034, "c_int": 88799, "c_ni": 10632536, "c_mve": 53775171, "c_shares": 1000, "c_price": 53775.17}, "2022": {"c_ca": 31560382, "c_inv": 5537563, "c_cash": 19713999, "c_cl": 15308423, "c_ta": 48482664, "c_tl": 15666146, "c_ltd": 66029, "c_eq": 32816518, "c_re": 3353468, "c_sales": 59956247, "c_cogs": 36059016, "c_rec": 6100403, "c_ebit": 10661574, "c_int": 166039, "c_ni": 8577575, "c_mve": 49224777, "c_shares": 1000, "c_price": 49224.78}, "2023": {"c_ca": 35935880, "c_inv": 6128082, "c_cash": 23049271, "c_cl": 17138690, "c_ta": 52673371, "c_tl": 17647627, "c_ltd": 238476, "c_eq": 35025744, "c_re": 3926232, "c_sales": 60368916, "c_cogs": 35824184, "c_rec": 6529705, "c_ebit": 11321994, "c_int": 354095, "c_ni": 9019354, "c_mve": 52538616, "c_shares": 1000, "c_price": 52538.62}, "2024": {"c_ca": 37553650, "c_inv": 5686840, "c_cash": 25486033, "c_cl": 18459547, "c_ta": 55049062, "c_tl": 18874659, "c_ltd": 157904, "c_eq": 36174403, "c_re": 3471225, "c_sales": 61782610, "c_cogs": 36192433, "c_rec": 6233759, "c_ebit": 11879079, "c_int": 279425, "c_ni": 9452893, "c_mve": 54261604, "c_shares": 1000, "c_price": 54261.6}, "2025": {"c_ca": 36261181, "c_inv": 6839280, "c_cash": 23149744, "c_cl": 18520286, "c_ta": 53312371, "c_tl": 18829355, "c_ltd": 62908, "c_eq": 34483015, "c_re": 8522576, "c_sales": 63645887, "c_cogs": 37436413, "c_rec": 6027719, "c_ebit": 11975789, "c_int": 325804, "c_ni": 9413590, "c_mve": 51724522, "c_shares": 1000, "c_price": 51724.52}}}, "MSN": {"ticker": "MSN", "name": "CTCP Tập đoàn Masan (MSN)", "label": "2. Masan (MSN)", "source": "BCTC Hợp nhất kiểm toán KPMG (2021–2025)", "years": {"2021": {"c_ca": 43630176, "c_inv": 12813391, "c_cash": 22637575, "c_cl": 34547836, "c_ta": 126093471, "c_tl": 83756819, "c_ltd": 39371918, "c_eq": 42336652, "c_re": 18795877, "c_sales": 88628767, "c_cogs": 66493966, "c_rec": 6634409, "c_ebit": 16158210, "c_int": 4669426, "c_ni": 10101381, "c_mve": 63504978, "c_shares": 1000, "c_price": 63504.98}, "2022": {"c_ca": 47674624, "c_inv": 14445345, "c_cash": 17512275, "c_cl": 65320877, "c_ta": 141342815, "c_tl": 104706076, "c_ltd": 30425625, "c_eq": 36636739, "c_re": 11381940, "c_sales": 76189225, "c_cogs": 55154201, "c_rec": 13929560, "c_ebit": 9994852, "c_int": 4847702, "c_ni": 4754384, "c_mve": 54955108, "c_shares": 1000, "c_price": 54955.11}, "2023": {"c_ca": 43763477, "c_inv": 13174868, "c_cash": 16919306, "c_cl": 50422500, "c_ta": 147383472, "c_tl": 109146231, "c_ltd": 41541894, "c_eq": 38237241, "c_re": 11798056, "c_sales": 78251619, "c_cogs": 56130507, "c_rec": 11985015, "c_ebit": 9509034, "c_int": 6946060, "c_ni": 1869927, "c_mve": 57355862, "c_shares": 1000, "c_price": 57355.86}, "2024": {"c_ca": 53569663, "c_inv": 10787396, "c_cash": 19225859, "c_cl": 58712175, "c_ta": 147584718, "c_tl": 106832338, "c_ltd": 38825185, "c_eq": 40752380, "c_re": 9326870, "c_sales": 83177720, "c_cogs": 58521982, "c_rec": 21864602, "c_ebit": 12429509, "c_int": 6404706, "c_ni": 4272384, "c_mve": 61128570, "c_shares": 1000, "c_price": 61128.57}, "2025": {"c_ca": 36234495, "c_inv": 11262216, "c_cash": 17481603, "c_cl": 40257475, "c_ta": 128963171, "c_tl": 83884527, "c_ltd": 40546194, "c_eq": 45078644, "c_re": 14355609, "c_sales": 81621329, "c_cogs": 56040719, "c_rec": 5639277, "c_ebit": 13306248, "c_int": 5418158, "c_ni": 6763511, "c_mve": 67617966, "c_shares": 1000, "c_price": 67617.97}}}, "SBT": {"ticker": "SBT", "name": "CTCP Thành Thành Công - Biên Hòa (TTC AgriS)", "label": "3. TTC AgriS (SBT)", "source": "BCTC Hợp nhất kiểm toán EY (Niên độ 2021–2026)", "years": {"2021": {"c_ca": 12577331, "c_inv": 3158779, "c_cash": 3063253, "c_cl": 8571563, "c_ta": 20470899, "c_tl": 12232594, "c_ltd": 3342233, "c_eq": 8238305, "c_re": 843612, "c_sales": 14924868, "c_cogs": 12708943, "c_rec": 6219459, "c_ebit": 1475491, "c_int": 691891, "c_ni": 650368, "c_mve": 12357458, "c_shares": 1000, "c_price": 12357.46}, "2022": {"c_ca": 18026635, "c_inv": 4625728, "c_cash": 4594725, "c_cl": 15294960, "c_ta": 27730368, "c_tl": 18061489, "c_ltd": 2467783, "c_eq": 9668879, "c_re": 1434516, "c_sales": 18318942, "c_cogs": 16010740, "c_rec": 8661534, "c_ebit": 1859476, "c_int": 813904, "c_ni": 873459, "c_mve": 14503318, "c_shares": 1000, "c_price": 14503.32}, "2023": {"c_ca": 20047095, "c_inv": 4504476, "c_cash": 5674609, "c_cl": 17196872, "c_ta": 29934286, "c_tl": 19430643, "c_ltd": 579743, "c_eq": 10503643, "c_re": 655098, "c_sales": 24743113, "c_cogs": 22022253, "c_rec": 9733674, "c_ebit": 2217509, "c_int": 1498900, "c_ni": 604645, "c_mve": 15755464, "c_shares": 1000, "c_price": 15755.46}, "2024": {"c_ca": 23751778, "c_inv": 3953197, "c_cash": 8433370, "c_cl": 19399729, "c_ta": 34078294, "c_tl": 22934261, "c_ltd": 3223413, "c_eq": 11144034, "c_re": 1133016, "c_sales": 29021273, "c_cogs": 25856644, "c_rec": 11240417, "c_ebit": 2632558, "c_int": 1724694, "c_ni": 805809, "c_mve": 16716051, "c_shares": 1000, "c_price": 16716.05}, "2025": {"c_ca": 20054308, "c_inv": 3583202, "c_cash": 7103202, "c_cl": 15549666, "c_ta": 32679097, "c_tl": 21828308, "c_ltd": 6037814, "c_eq": 10850790, "c_re": 1046884, "c_sales": 28482166, "c_cogs": 25497937, "c_rec": 9196731, "c_ebit": 2471922, "c_int": 1521853, "c_ni": 834488, "c_mve": 16276185, "c_shares": 1000, "c_price": 16276.18}, "2026": {"c_ca": 23685999, "c_inv": 4179360, "c_cash": 9069327, "c_cl": 19236086, "c_ta": 37798594, "c_tl": 25338172, "c_ltd": 4937569, "c_eq": 12460422, "c_re": 1133685, "c_sales": 26732849, "c_cogs": 24058915, "c_rec": 10203102, "c_ebit": 2463827, "c_int": 1552708, "c_ni": 846435, "c_mve": 18690633, "c_shares": 1000, "c_price": 18690.63}}}, "MCM": {"ticker": "MCM", "name": "CTCP Giống Bò sữa Mộc Châu (Mộc Châu Milk)", "label": "4. Mộc Châu Milk (MCM)", "source": "Dữ liệu mẫu tham chiếu ngành Sữa (2021–2025)", "years": {"2021": {"c_ca": 1825400, "c_inv": 218400, "c_cash": 1425600, "c_cl": 338900, "c_ta": 2520800, "c_tl": 342600, "c_ltd": 0, "c_eq": 2178200, "c_re": 385400, "c_sales": 2926300, "c_cogs": 2018500, "c_rec": 168200, "c_ebit": 357300, "c_int": 1100, "c_ni": 319100, "c_mve": 3267300, "c_shares": 1000, "c_price": 3267.3}, "2022": {"c_ca": 1912600, "c_inv": 204900, "c_cash": 1518400, "c_cl": 364200, "c_ta": 2615400, "c_tl": 368900, "c_ltd": 0, "c_eq": 2246500, "c_re": 412800, "c_sales": 3132800, "c_cogs": 2156400, "c_rec": 175800, "c_ebit": 390350, "c_int": 950, "c_ni": 346500, "c_mve": 3369750, "c_shares": 1000, "c_price": 3369.75}, "2023": {"c_ca": 1988500, "c_inv": 198600, "c_cash": 1591200, "c_cl": 377500, "c_ta": 2704200, "c_tl": 382100, "c_ltd": 0, "c_eq": 2322100, "c_re": 448900, "c_sales": 3135400, "c_cogs": 2124800, "c_rec": 182400, "c_ebit": 422520, "c_int": 720, "c_ni": 374400, "c_mve": 3483150, "c_shares": 1000, "c_price": 3483.15}, "2024": {"c_ca": 1864200, "c_inv": 201200, "c_cash": 1452800, "c_cl": 391200, "c_ta": 2685900, "c_tl": 396400, "c_ltd": 0, "c_eq": 2289500, "c_re": 396200, "c_sales": 2917600, "c_cogs": 2048900, "c_rec": 194500, "c_ebit": 249240, "c_int": 640, "c_ni": 219400, "c_mve": 3434250, "c_shares": 1000, "c_price": 3434.25}, "2025": {"c_ca": 1928400, "c_inv": 194800, "c_cash": 1529500, "c_cl": 402600, "c_ta": 2742600, "c_tl": 408200, "c_ltd": 0, "c_eq": 2334400, "c_re": 428500, "c_sales": 3045200, "c_cogs": 2112400, "c_rec": 188900, "c_ebit": 286980, "c_int": 580, "c_ni": 252800, "c_mve": 3501600, "c_shares": 1000, "c_price": 3501.6}}}};

  global.CreditSampleData = {
    generateHomeCreditSample,
    PRESETS,
    SAMPLE_COMPANIES
  };

})(window);

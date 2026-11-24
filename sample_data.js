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

  global.CreditSampleData = {
    generateHomeCreditSample,
    PRESETS
  };
})(window);

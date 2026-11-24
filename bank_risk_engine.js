/* bank_risk_engine.js v2.0 — Toàn bộ mô hình định lượng Chương 2, 3, 4, 5, 7, 9, 10, 11 (Giáo trình Nguyễn Văn Tiến) */
(function (global) {
  "use strict";

  // =========================================================================
  // CHƯƠNG 2: CÁC PHÉP ĐO LÃI SUẤT, LSHVBQ, CLĐVĐR, DỰ BÁO LÃI SUẤT & ARBITRAGE
  // =========================================================================
  function calcInterestMeasures(p) {
    const P0 = Number(p.principal);
    const r = Number(p.nominalRate) / 100;
    const t = Number(p.years);
    const n = Math.max(1, Number(p.compoundingPerYear));

    const simpleFV = P0 * (1 + r * t);
    const compoundFV = P0 * Math.pow(1 + r / n, n * t);
    const effectiveRate = Math.pow(1 + r / n, n) - 1;

    // Trả góp thông thường (Amortization)
    const totalPeriods = Math.max(1, Math.round(t * n));
    const rPer = r / n;
    const C = rPer > 0 ? (P0 * rPer) / (1 - Math.pow(1 + rPer, -totalPeriods)) : P0 / totalPeriods;
    const schedule = [];
    let bal = P0;
    for (let k = 1; k <= Math.min(totalPeriods, 12); k++) {
      const interest = bal * rPer;
      const princ = C - interest;
      bal = Math.max(0, bal - princ);
      schedule.push({ period: k, payment: C, interest, principal: princ, balance: bal });
    }

    // LSHVBQ theo bảng chuẩn Chương 2 (mục 1.7)
    const lshvbqRows = p.lshvbqTable.map(row => {
      const i = Number(row.rate) / 100;
      const R = Number(row.reserve) / 100;
      const U = Number(row.util) / 100;
      const W = Number(row.weight) / 100;
      const lsh = i / Math.max(1e-6, (1 - R) * U);
      return { ...row, lshvbq: lsh, wu: W * U, lshWu: lsh * W * U };
    });
    const sumWU = lshvbqRows.reduce((s, r) => s + r.wu, 0) || 1;
    const sumLshWU = lshvbqRows.reduce((s, r) => s + r.lshWu, 0);
    const avgLshvbq = sumLshWU / sumWU;
    const targetMargin = Number(p.grossMargin || 0.18) / 100;
    const suggestedLendingRate = avgLshvbq + targetMargin;

    // Dự báo lãi suất từ đường cong trái phiếu coupon 1-4 năm (mục 1.9)
    const R = [Number(p.r1)/100, Number(p.r2)/100, Number(p.r3)/100, Number(p.r4)/100];
    const d = [R[0], 0, 0, 0];
    // d2: 100 = R2/(1+d1) + (100+R2)/(1+d2)^2
    const pv1_2 = (R[1] * 100) / (1 + d[0]);
    d[1] = Math.pow((100 + R[1] * 100) / Math.max(1, 100 - pv1_2), 1 / 2) - 1;
    // d3
    const pv12_3 = (R[2] * 100) / (1 + d[0]) + (R[2] * 100) / Math.pow(1 + d[1], 2);
    d[2] = Math.pow((100 + R[2] * 100) / Math.max(1, 100 - pv12_3), 1 / 3) - 1;
    // d4
    const pv123_4 = (R[3] * 100) / (1 + d[0]) + (R[3] * 100) / Math.pow(1 + d[1], 2) + (R[3] * 100) / Math.pow(1 + d[2], 3);
    d[3] = Math.pow((100 + R[3] * 100) / Math.max(1, 100 - pv123_4), 1 / 4) - 1;

    // Forward rates E1..E4
    const E = [
      d[0],
      Math.pow(1 + d[1], 2) / (1 + d[0]) - 1,
      Math.pow(1 + d[2], 3) / Math.pow(1 + d[1], 2) - 1,
      Math.pow(1 + d[3], 4) / Math.pow(1 + d[2], 3) - 1
    ];

    // Arbitrage lãi suất có bảo hiểm (mục 2.1 - 2.3)
    const RT = Number(p.arbRT) / 100;
    const RC = Number(p.arbRC) / 100;
    const S = Number(p.arbSpot);
    const F = Number(p.arbForward);
    const arbN = 12 / Math.max(1, Number(p.arbMonths)); // số kỳ trong 1 năm
    const RC_to_T = arbN * ((F / S) * (1 + RC / arbN) - 1);
    const RT_to_C = arbN * ((S / F) * (1 + RT / arbN) - 1);
    let arbDecision = "Ngang giá — Không có cơ hội Arbitrage";
    let arbProfitPerUnit = 0;
    if (RT < RC_to_T - 1e-5) {
      arbDecision = "Đi vay Nội tệ (T) → Đầu tư Ngoại tệ (C) có bảo hiểm kỳ hạn";
      arbProfitPerUnit = (RC_to_T - RT) / arbN;
    } else if (RT > RC_to_T + 1e-5) {
      arbDecision = "Đi vay Ngoại tệ (C) → Đầu tư Nội tệ (T) có bảo hiểm kỳ hạn";
      arbProfitPerUnit = (RT - RC_to_T) / arbN;
    }

    return {
      simpleFV, compoundFV, effectiveRate, installmentC: C, schedule,
      lshvbqRows, avgLshvbq, suggestedLendingRate,
      yieldCurve: { coupon: R, zero: d, forward: E },
      arbitrage: { RT, RC, RC_to_T, RT_to_C, arbDecision, arbProfitPerUnit }
    };
  }

  // =========================================================================
  // CHƯƠNG 3 & 4: RỦI RO LÃI SUẤT (MATURITY, REPRICING GAP, DURATION/CONVEXITY) & PHÁI SINH
  // =========================================================================
  function calcInterestRateRisk(p) {
    // 1. Mô hình Định giá lại (Repricing Model — GAP & CGAP)
    const dR = Number(p.deltaR) / 100; // Ví dụ +1% = +0.01
    let cumGap = 0;
    const gapRows = p.repricingBuckets.map(b => {
      const gap = Number(b.rsa) - Number(b.rsl);
      cumGap += gap;
      return { ...b, gap, cumGap, dNii: gap * dR };
    });
    const cgap1Y = gapRows.slice(0, 4).reduce((s, r) => s + r.gap, 0);
    const dNii1Y = cgap1Y * dR;

    // 2. Mô hình Thời lượng (Duration) & Độ lồi (Convexity) cho bảng cân đối
    const A = Number(p.totalAssets);
    const L = Number(p.totalLiabilities);
    const E = A - L;
    const k = L / Math.max(1e-6, A);
    const DA = Number(p.durationA);
    const DL = Number(p.durationL);
    const R0 = Number(p.baseRate) / 100;

    const dGap = DA - k * DL;
    const dE = -dGap * A * (dR / (1 + R0));
    const newE = E + dE;
    const immunizeDA = k * DL;
    const immunizeDL = DA / Math.max(1e-6, k);

    // 3. Độ lồi (Convexity) trên trái phiếu chuẩn 6 năm, coupon 8%, mệnh giá 1000
    const face = 1000, cRate = 0.08, N = 6;
    const bondPrice = (yld) => {
      let pv = 0;
      for (let t = 1; t <= N; t++) {
        const cf = t === N ? face * (1 + cRate) : face * cRate;
        pv += cf / Math.pow(1 + yld, t);
      }
      return pv;
    };
    const P0 = bondPrice(R0);
    // Macaulay Duration của trái phiếu
    let weightedPv = 0;
    for (let t = 1; t <= N; t++) {
      const cf = t === N ? face * (1 + cRate) : face * cRate;
      weightedPv += t * (cf / Math.pow(1 + R0, t));
    }
    const bondD = weightedPv / P0;
    const bondMD = bondD / (1 + R0);
    // Convexity chuẩn hóa theo công thức mục 3.6.3: CX = 10^8 * [(dP-/P) + (dP+/P)]
    const pUp = bondPrice(R0 + 0.0001);
    const pDn = bondPrice(R0 - 0.0001);
    const CX = 1e8 * (((pUp - P0) / P0) + ((pDn - P0) / P0));

    const shocks = [-0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03];
    const convexitySeries = shocks.map(sh => {
      const actual = bondPrice(R0 + sh);
      const linearApprox = P0 * (1 - bondMD * sh);
      const convexApprox = P0 * (1 - bondMD * sh + 0.5 * CX * sh * sh);
      return { shockPct: sh * 100, actual, linearApprox, convexApprox };
    });

    // 4. Phòng ngừa Phái sinh (Chương 4): Swap + Cap/Floor/Collar
    const notional = Number(p.swapNotional);
    const swapFixed = Number(p.swapFixed) / 100;
    const floatNow = Number(p.swapFloat) / 100;
    const capStrike = Number(p.capStrike) / 100;
    const floorStrike = Number(p.floorStrike) / 100;
    const capPrem = Number(p.capPremium) / 100;

    // Net Swap payment (Pay Fixed, Receive Float)
    const swapNet = notional * (floatNow - swapFixed);
    // Collar payoff: Long Cap (bảo vệ LS tăng) + Short Floor
    const capPayoff = notional * Math.max(0, floatNow - capStrike) - notional * capPrem;
    const floorPayoff = notional * Math.max(0, floorStrike - floatNow);

    const rateGrid = [4, 6, 8, 10, 12, 14, 16];
    const derivPayoffs = rateGrid.map(rg => {
      const rf = rg / 100;
      return {
        rate: rg,
        swap: +(notional * (rf - swapFixed)).toFixed(2),
        cap: +(notional * (Math.max(0, rf - capStrike) - capPrem)).toFixed(2),
        collar: +(notional * (Math.max(0, rf - capStrike) - Math.max(0, floorStrike - rf))).toFixed(2)
      };
    });

    return {
      gapRows, cgap1Y, dNii1Y,
      duration: { A, L, E, k, DA, DL, dGap, dE, newE, immunizeDA, immunizeDL },
      convexity: { P0, bondD, bondMD, CX, convexitySeries },
      derivatives: { swapNet, capPayoff, floorPayoff, derivPayoffs }
    };
  }

  // =========================================================================
  // CHƯƠNG 5, 7, 9: NGOẠI HỐI (FX), THANH KHOẢN & CHỨNG KHOÁN HÓA (CMO / IO / PO)
  // =========================================================================
  function calcFxLiquiditySec(p) {
    // 1. Rủi ro Ngoại hối (Chương 5)
    const fxA = Number(p.fxAssets);
    const fxL = Number(p.fxLiabilities);
    const fxBought = Number(p.fxBought);
    const fxSold = Number(p.fxSold);
    const netFxPos = (fxA - fxL) + (fxBought - fxSold); // >0 Trường ròng (Long), <0 Đoản ròng (Short)
    const spot = Number(p.fxSpot);
    const shockPct = Number(p.fxShockPct) / 100;
    const newSpot = spot * (1 + shockPct);
    const fxPnlVnd = netFxPos * (newSpot - spot); // triệu VND (nếu netFxPos là triệu USD & spot là VND/USD -> tỷ VND)
    const fxStatus = netFxPos > 0 ? "Trạng thái Trường ròng (Long — Rủi ro khi ngoại tệ giảm giá)"
                   : (netFxPos < 0 ? "Trạng thái Đoản ròng (Short — Rủi ro khi ngoại tệ tăng giá)"
                   : "Trạng thái Cân bằng (Squared)");

    // 2. Rủi ro Thanh khoản (Chương 7)
    const liqAssetsNow = Number(p.liqAssetsNow);
    const liqLiabNow = Math.max(1e-6, Number(p.liqLiabNow));
    const immediateRatio = liqAssetsNow / liqLiabNow; // Chuẩn NHNN >= 1.0

    const totalLoans = Number(p.liqLoans);
    const coreDeposits = Number(p.liqCoreDeposits);
    const liquidAssets = Number(p.liqLiquidAssets);
    const financingGap = totalLoans - coreDeposits; // Độ lệch tài trợ
    const financingReq = financingGap + liquidAssets; // Nhu cầu tài trợ

    const shortTermFunding = Math.max(1e-6, Number(p.liqShortFunding));
    const medLongFromShort = Number(p.liqMedLongFromShort);
    const stToLtRatio = medLongFromShort / shortTermFunding;

    const supplyLiq = Number(p.liqSupply);
    const demandLiq = Number(p.liqDemand);
    const netLiquidityPos = supplyLiq - demandLiq;

    // 3. Chứng khoán hóa (Chương 9): Mô phỏng CMO (Hạng A, B, C) & IO/PO
    const poolPrincipal = Number(p.cmoPool);
    const couponRate = Number(p.cmoRate) / 100;
    const prepayRate = Number(p.cmoPrepay) / 100;
    const trancheA = poolPrincipal * 0.4;
    const trancheB = poolPrincipal * 0.35;
    const trancheC = poolPrincipal * 0.25;

    let remA = trancheA, remB = trancheB, remC = trancheC;
    const cmoFlow = [];
    let pvIO = 0, pvPO = 0;
    const disc = couponRate;
    for (let yr = 1; yr <= 5; yr++) {
      const remTotal = remA + remB + remC;
      if (remTotal <= 0.01) break;
      const interestPool = remTotal * couponRate;
      const schedPrinc = yr === 5 ? remTotal : Math.min(remTotal, poolPrincipal * 0.15 + remTotal * prepayRate);
      let princLeft = schedPrinc;
      const payA = Math.min(remA, princLeft); remA -= payA; princLeft -= payA;
      const payB = Math.min(remB, princLeft); remB -= payB; princLeft -= payB;
      const payC = Math.min(remC, princLeft); remC -= payC;
      pvIO += interestPool / Math.pow(1 + disc, yr);
      pvPO += schedPrinc / Math.pow(1 + disc, yr);
      cmoFlow.push({ year: yr, interestPool, schedPrinc, payA, payB, payC, remTotal: remA + remB + remC });
    }

    return {
      fx: { netFxPos, spot, newSpot, fxPnlVnd, fxStatus },
      liquidity: { immediateRatio, financingGap, financingReq, stToLtRatio, netLiquidityPos },
      cmo: { cmoFlow, pvIO, pvPO, totalPv: pvIO + pvPO }
    };
  }

  // =========================================================================
  // CHƯƠNG 10 & 11: AN TOÀN VỐN (CAR) & KHUNG PHÂN TÍCH NGÂN HÀNG CAMEL
  // =========================================================================
  function calcCarAndCamel(p) {
    // 1. CAR (Chương 10 — Quy định nội bảng & ngoại bảng)
    const tier1 = Number(p.tier1Capital);
    const tier2 = Number(p.tier2Capital);
    const deduct = Number(p.capitalDeductions);
    const totalCapital = tier1 + tier2 - deduct;

    const rwaOn =
      Number(p.on0) * 0.0 +
      Number(p.on20) * 0.2 +
      Number(p.on50) * 0.5 +
      Number(p.on100) * 1.0;

    // Ngoại bảng: CCF 100%, 50%, 2% -> áp trọng số rủi ro đối tác (mặc định 100% theo QĐ 297/NHNN trong sách)
    const rwaOff =
      Number(p.off100) * 1.0 +
      Number(p.off50) * 0.5 +
      Number(p.off2) * 0.02;

    const totalRwa = Math.max(1e-6, rwaOn + rwaOff);
    const totalAssetsBook = Math.max(1e-6, Number(p.on0) + Number(p.on20) + Number(p.on50) + Number(p.on100));
    const simpleCar = totalCapital / totalAssetsBook;
    const riskBasedCar = totalCapital / totalRwa;
    const carStatus = riskBasedCar >= 0.08 ? "Đạt chuẩn an toàn vốn tối thiểu (>= 8%)" : "Dưới chuẩn an toàn vốn (< 8%)";

    // 2. Hệ thống chỉ tiêu & Khung CAMEL (Chương 11)
    const netIncome = Number(p.bankNetIncome);
    const netInterestIncome = Number(p.bankNii);
    const operatingIncome = Math.max(1e-6, Number(p.bankOpIncome));
    const operatingExpense = Number(p.bankOpExpense);
    const earningAssets = Math.max(1e-6, Number(p.bankEarningAssets));
    const equity = Math.max(1e-6, tier1);

    const roa = netIncome / totalAssetsBook;
    const roe = netIncome / equity;
    const em = totalAssetsBook / equity; // Hệ số nhân vốn chủ sở hữu (ROE = ROA * EM)
    const nim = netInterestIncome / earningAssets;
    const cir = operatingExpense / operatingIncome;

    // Chấm điểm CAMEL tự động (thang 1 = Mạnh nhất -> 5 = Yếu kém nhất)
    const rateC = riskBasedCar >= 0.12 ? 1 : (riskBasedCar >= 0.10 ? 2 : (riskBasedCar >= 0.08 ? 3 : (riskBasedCar >= 0.06 ? 4 : 5)));
    const nplPct = Number(p.camelNplPct);
    const rateA = nplPct <= 1.5 ? 1 : (nplPct <= 3.0 ? 2 : (nplPct <= 5.0 ? 3 : (nplPct <= 8.0 ? 4 : 5)));
    const rateM = cir <= 0.40 ? 1 : (cir <= 0.50 ? 2 : (cir <= 0.60 ? 3 : (cir <= 0.75 ? 4 : 5)));
    const rateE = roa >= 0.015 ? 1 : (roa >= 0.010 ? 2 : (roa >= 0.006 ? 3 : (roa >= 0.002 ? 4 : 5)));
    const liqPct = Number(p.camelLiqPct);
    const rateL = liqPct >= 25 ? 1 : (liqPct >= 18 ? 2 : (liqPct >= 12 ? 3 : (liqPct >= 8 ? 4 : 5)));

    const composite = 0.25 * rateC + 0.25 * rateA + 0.20 * rateM + 0.15 * rateE + 0.15 * rateL;
    let camelGrade = "Hạng 1 (Rất vững mạnh)";
    let camelCls = "badge-success";
    if (composite > 4.2) { camelGrade = "Hạng 5 (Nguy cơ đổ vỡ cao)"; camelCls = "badge-danger"; }
    else if (composite > 3.4) { camelGrade = "Hạng 4 (Yếu — Cần giám sát đặc biệt)"; camelCls = "badge-danger"; }
    else if (composite > 2.5) { camelGrade = "Hạng 3 (Trung bình — Cần lưu ý)"; camelCls = "badge-warning"; }
    else if (composite > 1.6) { camelGrade = "Hạng 2 (Tốt — Ổn định)"; camelCls = "badge-info"; }

    return {
      car: { totalCapital, rwaOn, rwaOff, totalRwa, simpleCar, riskBasedCar, carStatus },
      ratios: { roa, roe, em, nim, cir },
      camel: { rateC, rateA, rateM, rateE, rateL, composite, camelGrade, camelCls }
    };
  }

  global.BankRiskEngine = {
    calcInterestMeasures,
    calcInterestRateRisk,
    calcFxLiquiditySec,
    calcCarAndCamel
  };
})(window);

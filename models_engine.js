/* models_engine.js — Động cơ toán học & thống kê cho toàn bộ các mô hình Rủi ro Tín dụng */
(function (global) {
  "use strict";

  // =========================================================================
  // 1. HÀM PHÂN PHỐI CHUẨN & ĐẠI SỐ TUYẾN TÍNH (Dùng cho Basel II & Logistic)
  // =========================================================================
  function normCDF(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const z = Math.abs(x) / Math.sqrt(2.0);
    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    return 0.5 * (1.0 + sign * y);
  }

  // Acklam's rational approximation for inverse standard normal CDF N^-1(p)
  function normInv(p) {
    const prob = Math.min(1 - 1e-12, Math.max(1e-12, p));
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
                1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
                6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
               -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
               3.754408661907416e+00];
    const plow = 0.02425, phigh = 1 - plow;
    let q, r;
    if (prob < plow) {
      q = Math.sqrt(-2 * Math.log(prob));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    } else if (prob <= phigh) {
      q = prob - 0.5;
      r = q * q;
      return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
             (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - prob));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
              ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
  }

  function solveLinearSystem(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
      }
      const tmp = M[i]; M[i] = M[maxRow]; M[maxRow] = tmp;
      const pivot = Math.abs(M[i][i]) < 1e-12 ? 1e-12 : M[i][i];
      for (let k = i + 1; k < n; k++) {
        const factor = M[k][i] / pivot;
        for (let j = i; j <= n; j++) M[k][j] -= factor * M[i][j];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = M[i][n];
      for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j];
      const diag = Math.abs(M[i][i]) < 1e-12 ? 1e-12 : M[i][i];
      x[i] = sum / diag;
    }
    return x;
  }

  function invertMatrix(A) {
    const n = A.length;
    const M = A.map((row, i) => {
      const id = new Array(n).fill(0);
      id[i] = 1;
      return [...row, ...id];
    });
    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
      }
      const tmp = M[i]; M[i] = M[maxRow]; M[maxRow] = tmp;
      const pivot = Math.abs(M[i][i]) < 1e-10 ? 1e-10 : M[i][i];
      for (let j = 0; j < 2 * n; j++) M[i][j] /= pivot;
      for (let k = 0; k < n; k++) {
        if (k === i) continue;
        const factor = M[k][i];
        for (let j = 0; j < 2 * n; j++) M[k][j] -= factor * M[i][j];
      }
    }
    return M.map(row => row.slice(n));
  }

  // =========================================================================
  // 2. CREDIT SCORECARD 8 BƯỚC (WoE/IV -> Logistic -> ROC/KS -> PDO -> PSI/HHI)
  // =========================================================================
  function isNumericColumn(rows, col) {
    let numCount = 0, validCount = 0;
    for (let i = 0; i < Math.min(rows.length, 200); i++) {
      const v = rows[i][col];
      if (v === null || v === undefined || v === "") continue;
      validCount++;
      if (!isNaN(Number(v))) numCount++;
    }
    return validCount > 0 && numCount / validCount > 0.9;
  }

  function buildFeatureBins(trainRows, col, targetCol, maxBins = 5) {
    const numeric = isNumericColumn(trainRows, col);
    let totalGood = 0, totalBad = 0;
    trainRows.forEach(r => {
      if (Number(r[targetCol]) === 1) totalBad++; else totalGood++;
    });

    const bins = [];
    if (numeric) {
      const vals = trainRows
        .map(r => Number(r[col]))
        .filter(v => !isNaN(v))
        .sort((a, b) => a - b);
      const uniqueVals = Array.from(new Set(vals));
      let cuts = [];
      if (uniqueVals.length <= maxBins) {
        cuts = uniqueVals.slice(0, -1);
      } else {
        for (let b = 1; b < maxBins; b++) {
          const idx = Math.floor((b * vals.length) / maxBins);
          cuts.push(vals[idx]);
        }
        cuts = Array.from(new Set(cuts)).sort((a, b) => a - b);
      }

      const numBins = cuts.length + 1;
      for (let i = 0; i < numBins; i++) {
        const low = i === 0 ? -Infinity : cuts[i - 1];
        const high = i === cuts.length ? Infinity : cuts[i];
        let label;
        if (low === -Infinity) label = `<= ${high}`;
        else if (high === Infinity) label = `> ${low}`;
        else label = `(${low}, ${high}]`;
        bins.push({ label, low, high, isNumeric: true, good: 0, bad: 0 });
      }

      trainRows.forEach(r => {
        const v = Number(r[col]);
        const isBad = Number(r[targetCol]) === 1;
        let placed = false;
        for (let b of bins) {
          if (v > b.low && v <= b.high) {
            if (isBad) b.bad++; else b.good++;
            placed = true;
            break;
          }
        }
        if (!placed && bins.length) {
          if (isBad) bins[0].bad++; else bins[0].good++;
        }
      });
    } else {
      const catMap = {};
      trainRows.forEach(r => {
        const key = String(r[col] ?? "Khác");
        if (!catMap[key]) catMap[key] = { label: key, isNumeric: false, good: 0, bad: 0 };
        if (Number(r[targetCol]) === 1) catMap[key].bad++; else catMap[key].good++;
      });
      Object.values(catMap).forEach(b => bins.push(b));
    }

    let iv = 0;
    const eps = 0.5;
    bins.forEach(b => {
      b.total = b.good + b.bad;
      b.badRate = b.total > 0 ? b.bad / b.total : 0;
      const distGood = (b.good + eps) / (totalGood + eps * bins.length);
      const distBad = (b.bad + eps) / (totalBad + eps * bins.length);
      b.woe = Math.log(distGood / distBad);
      b.ivPart = (distGood - distBad) * b.woe;
      iv += b.ivPart;
    });

    // Kiểm tra đơn điệu cho biến số
    let monotonic = "N/A";
    if (numeric && bins.length >= 2) {
      let inc = true, dec = true;
      for (let i = 1; i < bins.length; i++) {
        if (bins[i].woe < bins[i - 1].woe - 1e-6) inc = false;
        if (bins[i].woe > bins[i - 1].woe + 1e-6) dec = false;
      }
      monotonic = inc ? "Đơn điệu tăng" : (dec ? "Đơn điệu giảm" : "Phi đơn điệu (U-shape)");
    }

    return { feature: col, isNumeric: numeric, iv, monotonic, bins };
  }

  function mapRowToWoE(row, featureBinSpec) {
    const raw = row[featureBinSpec.feature];
    if (featureBinSpec.isNumeric) {
      const v = Number(raw);
      for (let b of featureBinSpec.bins) {
        if (v > b.low && v <= b.high) return b.woe;
      }
      return featureBinSpec.bins[0]?.woe || 0;
    } else {
      const key = String(raw ?? "Khác");
      const found = featureBinSpec.bins.find(b => b.label === key);
      return found ? found.woe : 0;
    }
  }

  function fitLogisticRegression(X, y, maxIter = 25, ridge = 1e-3) {
    const n = X.length;
    const p = X[0].length; // đã bao gồm cột intercept = 1 ở vị trí 0
    let beta = new Array(p).fill(0);
    const meanY = Math.min(0.99, Math.max(0.01, y.reduce((a, b) => a + b, 0) / n));
    beta[0] = Math.log(meanY / (1 - meanY));

    for (let iter = 0; iter < maxIter; iter++) {
      const grad = new Array(p).fill(0);
      const H = Array.from({ length: p }, () => new Array(p).fill(0));

      for (let i = 0; i < n; i++) {
        let eta = 0;
        for (let j = 0; j < p; j++) eta += X[i][j] * beta[j];
        eta = Math.max(-25, Math.min(25, eta));
        const prob = 1 / (1 + Math.exp(-eta));
        const w = Math.max(1e-6, prob * (1 - prob));
        const err = y[i] - prob;
        for (let j = 0; j < p; j++) {
          grad[j] += X[i][j] * err;
          for (let k = j; k < p; k++) {
            H[j][k] += w * X[i][j] * X[i][k];
          }
        }
      }
      for (let j = 0; j < p; j++) {
        for (let k = 0; k < j; k++) H[j][k] = H[k][j];
        if (j > 0) {
          H[j][j] += ridge;
          grad[j] -= ridge * beta[j];
        } else {
          H[j][j] += 1e-6;
        }
      }
      const step = solveLinearSystem(H, grad);
      let maxDiff = 0;
      for (let j = 0; j < p; j++) {
        beta[j] += step[j];
        maxDiff = Math.max(maxDiff, Math.abs(step[j]));
      }
      if (maxDiff < 1e-6) break;
    }
    return beta;
  }

  function computeVIF(woeMatrix) {
    // woeMatrix: n x k (không có intercept)
    const n = woeMatrix.length;
    const k = woeMatrix[0].length;
    if (k <= 1) return new Array(k).fill(1.0);
    const means = new Array(k).fill(0);
    const stds = new Array(k).fill(0);
    for (let j = 0; j < k; j++) {
      for (let i = 0; i < n; i++) means[j] += woeMatrix[i][j];
      means[j] /= n;
      for (let i = 0; i < n; i++) stds[j] += Math.pow(woeMatrix[i][j] - means[j], 2);
      stds[j] = Math.sqrt(stds[j] / n) || 1e-6;
    }
    const corr = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let j = 0; j < k; j++) {
      for (let l = 0; l < k; l++) {
        let s = 0;
        for (let i = 0; i < n; i++) {
          s += ((woeMatrix[i][j] - means[j]) / stds[j]) * ((woeMatrix[i][l] - means[l]) / stds[l]);
        }
        corr[j][l] = s / n;
      }
      corr[j][j] += 1e-6;
    }
    const invCorr = invertMatrix(corr);
    return invCorr.map((row, idx) => Math.max(1.0, row[idx]));
  }

  function computeRocKs(yTrue, yProb) {
    const pairs = yTrue.map((y, i) => ({ y, p: yProb[i] })).sort((a, b) => b.p - a.p);
    const totalBad = pairs.reduce((s, d) => s + (d.y === 1 ? 1 : 0), 0);
    const totalGood = pairs.length - totalBad;
    let cumBad = 0, cumGood = 0;
    const rocPoints = [{ fpr: 0, tpr: 0 }];
    const ksCurve = [{ pct: 0, cumBadPct: 0, cumGoodPct: 0 }];
    let auc = 0, prevFpr = 0, prevTpr = 0;
    let maxKS = 0, maxKSPct = 0;

    const step = Math.max(1, Math.floor(pairs.length / 80));
    for (let i = 0; i < pairs.length; i++) {
      if (pairs[i].y === 1) cumBad++; else cumGood++;
      const tpr = totalBad > 0 ? cumBad / totalBad : 0;
      const fpr = totalGood > 0 ? cumGood / totalGood : 0;
      auc += (fpr - prevFpr) * (tpr + prevTpr) / 2;
      prevFpr = fpr; prevTpr = tpr;

      const diff = Math.abs(tpr - fpr);
      if (diff > maxKS) {
        maxKS = diff;
        maxKSPct = ((i + 1) / pairs.length) * 100;
      }
      if ((i + 1) % step === 0 || i === pairs.length - 1) {
        rocPoints.push({ fpr, tpr });
        ksCurve.push({ pct: ((i + 1) / pairs.length) * 100, cumBadPct: tpr * 100, cumGoodPct: fpr * 100 });
      }
    }
    const gini = 2 * auc - 1;
    return { auc, gini, ks: maxKS, maxKSPct, rocPoints, ksCurve };
  }

  function runCreditScorecardPipeline(rows, options = {}) {
    const targetCol = options.targetCol || "TARGET";
    const baseScore = Number(options.baseScore) || 600;
    const baseOdds = Number(options.baseOdds) || 50;
    const pdo = Number(options.pdo) || 20;
    const ivThreshold = Number(options.ivThreshold ?? 0.02);
    const trainRatio = Number(options.trainRatio || 0.7);

    // Tách cột đặc trưng
    const sampleRow = rows[0] || {};
    const ignoreCols = new Set([targetCol, "SK_ID_CURR", "ID", "id", "CustomerID"]);
    const candidateCols = Object.keys(sampleRow).filter(c => !ignoreCols.has(c));

    // Stratified split (giữ nguyên tỷ lệ Bad ở Train & Val)
    const bads = rows.filter(r => Number(r[targetCol]) === 1);
    const goods = rows.filter(r => Number(r[targetCol]) !== 1);
    const nBadTrain = Math.floor(bads.length * trainRatio);
    const nGoodTrain = Math.floor(goods.length * trainRatio);
    const trainRows = [...bads.slice(0, nBadTrain), ...goods.slice(0, nGoodTrain)];
    const valRows = [...bads.slice(nBadTrain), ...goods.slice(nGoodTrain)];

    // Bước 4: Binning + WoE/IV trên tập Train
    const allFeatureSpecs = candidateCols
      .map(col => buildFeatureBins(trainRows, col, targetCol, 5))
      .sort((a, b) => b.iv - a.iv);

    let selectedSpecs = allFeatureSpecs.filter(s => s.iv >= ivThreshold);
    if (selectedSpecs.length === 0) selectedSpecs = allFeatureSpecs.slice(0, Math.min(4, allFeatureSpecs.length));

    // Bước 5: WoE Transform + VIF + Logistic Regression
    const buildMatrices = (dataset) => {
      const X = [];
      const XNoInt = [];
      const y = [];
      dataset.forEach(r => {
        const woeVals = selectedSpecs.map(spec => mapRowToWoE(r, spec));
        X.push([1, ...woeVals]);
        XNoInt.push(woeVals);
        y.push(Number(r[targetCol]) === 1 ? 1 : 0);
      });
      return { X, XNoInt, y };
    };

    const trainMat = buildMatrices(trainRows);
    const valMat = buildMatrices(valRows);
    const vifs = computeVIF(trainMat.XNoInt);
    const beta = fitLogisticRegression(trainMat.X, trainMat.y);

    const predictProb = (X) => X.map(row => {
      let eta = 0;
      for (let j = 0; j < beta.length; j++) eta += row[j] * beta[j];
      return 1 / (1 + Math.exp(-Math.max(-25, Math.min(25, eta))));
    });

    const trainProb = predictProb(trainMat.X);
    const valProb = predictProb(valMat.X);

    const trainMetrics = computeRocKs(trainMat.y, trainProb);
    const valMetrics = computeRocKs(valMat.y, valProb);

    // Bước 6: Chuyển đổi thang điểm PDO
    // Lưu ý: Logistic dự báo P(Bad=1), log-odds(Good/Bad) = -eta = -(beta0 + sum beta_j * woe_j)
    const factor = pdo / Math.log(2);
    const offset = baseScore - factor * Math.log(baseOdds);
    const k = selectedSpecs.length;
    const basePoints = offset - factor * beta[0];

    const scorecardTable = [];
    selectedSpecs.forEach((spec, j) => {
      const coef = beta[j + 1];
      spec.bins.forEach(b => {
        const pts = Math.round(-(coef * b.woe * factor) + basePoints / k);
        scorecardTable.push({
          feature: spec.feature,
          bin: b.label,
          total: b.total,
          badRate: b.badRate,
          woe: b.woe,
          points: pts
        });
      });
    });

    const scoreDataset = (X) => X.map(row => {
      let eta = 0;
      for (let j = 0; j < beta.length; j++) eta += row[j] * beta[j];
      const logOddsGood = -eta;
      return Math.round(offset + factor * logOddsGood);
    });

    const trainScores = scoreDataset(trainMat.X);
    const valScores = scoreDataset(valMat.X);

    // Master Scale: Gom điểm thành 10 hạng rủi ro (Grade 01 = An toàn nhất -> Grade 10 = Rủi ro cao nhất)
    // Xếp điểm từ cao xuống thấp để Grade 01 có điểm cao nhất (Bad Rate thấp nhất), khớp với biểu đồ mẫu!
    const allScores = [...trainScores, ...valScores];
    const sortedScores = [...allScores].sort((a, b) => b - a);
    const gradeBounds = [];
    for (let g = 1; g < 10; g++) {
      gradeBounds.push(sortedScores[Math.floor((g * sortedScores.length) / 10)]);
    }

    const assignGrade = (score) => {
      for (let g = 0; g < 9; g++) {
        if (score >= gradeBounds[g]) return g; // 0 = Grade 01
      }
      return 9; // Grade 10
    };

    const masterScale = Array.from({ length: 10 }, (_, idx) => ({
      grade: `Grade ${String(idx + 1).padStart(2, "0")}`,
      trainCount: 0,
      valCount: 0,
      total: 0,
      bads: 0,
      minScore: Infinity,
      maxScore: -Infinity
    }));

    trainScores.forEach((sc, i) => {
      const g = assignGrade(sc);
      masterScale[g].trainCount++;
      masterScale[g].total++;
      if (trainMat.y[i] === 1) masterScale[g].bads++;
      masterScale[g].minScore = Math.min(masterScale[g].minScore, sc);
      masterScale[g].maxScore = Math.max(masterScale[g].maxScore, sc);
    });
    valScores.forEach((sc, i) => {
      const g = assignGrade(sc);
      masterScale[g].valCount++;
      masterScale[g].total++;
      if (valMat.y[i] === 1) masterScale[g].bads++;
      masterScale[g].minScore = Math.min(masterScale[g].minScore, sc);
      masterScale[g].maxScore = Math.max(masterScale[g].maxScore, sc);
    });

    // Bước 7: Kiểm định mô hình (PSI, HHI)
    let psi = 0;
    let hhi = 0;
    const totalAll = allScores.length || 1;
    masterScale.forEach(ms => {
      ms.badRate = ms.total > 0 ? ms.bads / ms.total : 0;
      const expPct = Math.max(0.0001, ms.trainCount / (trainScores.length || 1));
      const actPct = Math.max(0.0001, ms.valCount / (valScores.length || 1));
      psi += (actPct - expPct) * Math.log(actPct / expPct);
      const share = ms.total / totalAll;
      hhi += share * share;
      if (ms.minScore === Infinity) { ms.minScore = 0; ms.maxScore = 0; }
    });

    const modelSummary = selectedSpecs.map((spec, j) => ({
      feature: spec.feature,
      iv: spec.iv,
      monotonic: spec.monotonic,
      coef: beta[j + 1],
      vif: vifs[j]
    }));

    return {
      nTotal: rows.length,
      nTrain: trainRows.length,
      nVal: valRows.length,
      overallBadRate: (bads.length / rows.length),
      allFeatureSpecs,
      modelSummary,
      intercept: beta[0],
      trainMetrics,
      valMetrics,
      scorecardTable,
      masterScale,
      psi,
      hhi,
      valScores,
      valTargets: valMat.y,
      scoreRange: {
        min: Math.min(...allScores),
        max: Math.max(...allScores)
      }
    };
  }

  function simulateCutoff(scores, targets, cutoff) {
    let approved = 0, approvedBads = 0, totalBads = 0;
    for (let i = 0; i < scores.length; i++) {
      if (targets[i] === 1) totalBads++;
      if (scores[i] >= cutoff) {
        approved++;
        if (targets[i] === 1) approvedBads++;
      }
    }
    const approvalRate = scores.length > 0 ? approved / scores.length : 0;
    const approvedBadRate = approved > 0 ? approvedBads / approved : 0;
    const rejectedBadsCapture = totalBads > 0 ? (totalBads - approvedBads) / totalBads : 0;
    return { approved, total: scores.length, approvalRate, approvedBadRate, rejectedBadsCapture };
  }

  // =========================================================================
  // 3. ALTMAN Z-SCORE (Z, Z', Z'') & 5 NHÓM CHỈ SỐ TÀI CHÍNH + ĐỊNH TÍNH
  // =========================================================================
  function calculateCorporateModels(d) {
    const TA = Math.max(1e-6, Number(d.totalAssets));
    const CL = Math.max(1e-6, Number(d.currentLiabilities));
    const TL = Math.max(1e-6, Number(d.totalLiabilities));
    const EQ = Math.max(1e-6, Number(d.totalEquity));
    const SALES = Math.max(1e-6, Number(d.sales));
    const INV = Math.max(1e-6, Number(d.inventories));
    const INT = Math.max(1e-6, Number(d.interestExpense));
    const SHARES = Math.max(1e-6, Number(d.shares));

    const WC = Number(d.currentAssets) - Number(d.currentLiabilities);
    const X1 = WC / TA;
    const X2 = Number(d.retainedEarnings) / TA;
    const X3 = Number(d.ebit) / TA;
    const X4_mkt = Number(d.marketValueEquity) / TL;
    const X4_book = EQ / TL;
    const X5 = SALES / TA;

    // 3 phiên bản Altman Z-Score theo slide Chương 3 (Ph.D. Nguyễn Thị Lan)
    const Z = 1.2 * X1 + 1.4 * X2 + 3.3 * X3 + 0.64 * X4_mkt + 1.0 * X5;
    const Z_prime = 0.717 * X1 + 0.847 * X2 + 3.107 * X3 + 0.42 * X4_book + 0.998 * X5;
    const Z_double = 6.56 * X1 + 3.26 * X2 + 6.72 * X3 + 1.05 * X4_book;

    const zone = (val, low, high) => {
      if (val > high) return { label: "Vùng An toàn", cls: "badge-success" };
      if (val > low) return { label: "Vùng Cảnh báo", cls: "badge-warning" };
      return { label: "Vùng Nguy hiểm", cls: "badge-danger" };
    };

    const ratios = {
      liquidity: {
        currentRatio: Number(d.currentAssets) / CL,
        quickRatio: (Number(d.currentAssets) - Number(d.inventories)) / CL,
        cashRatio: Number(d.cash) / CL,
        interestCoverage: Number(d.ebit) / INT
      },
      leverage: {
        totalDebtRatio: TL / TA,
        debtToEquity: TL / EQ,
        equityRatio: EQ / TA,
        equityMultiplier: TA / EQ,
        longTermDebtRatio: Number(d.longTermDebt) / TA
      },
      efficiency: {
        assetTurnover: SALES / TA,
        acp: (Number(d.receivables) / (SALES / 365)),
        inventoryTurnover: Number(d.cogs) / INV
      },
      profitability: {
        netProfitMargin: Number(d.netIncome) / SALES,
        roa: Number(d.netIncome) / TA,
        roe: Number(d.netIncome) / EQ
      },
      market: {
        eps: Number(d.netIncome) / SHARES,
        pe: Number(d.stockPrice) / Math.max(1e-6, Number(d.netIncome) / SHARES),
        pb: Number(d.stockPrice) / Math.max(1e-6, EQ / SHARES)
      }
    };

    return {
      components: { X1, X2, X3, X4_mkt, X4_book, X5 },
      Z: { score: Z, zone: zone(Z, 1.8, 2.99) },
      Z_prime: { score: Z_prime, zone: zone(Z_prime, 1.23, 2.9) },
      Z_double: { score: Z_double, zone: zone(Z_double, 1.1, 2.6) },
      ratios
    };
  }

  // =========================================================================
  // 4. MÔ HÌNH ĐIỂM SỐ TÍN DỤNG TIÊU DÙNG (8 Hạng mục, 9 - 43 điểm)
  // =========================================================================
  function calculateConsumerScore(c) {
    const total =
      Number(c.job) + Number(c.housing) + Number(c.creditRating) +
      Number(c.experience) + Number(c.residenceTime) + Number(c.landline) +
      Number(c.dependents) + Number(c.bankAccount);

    let decision = "Từ chối tín dụng", limit = 0, cls = "badge-danger";
    if (total >= 41) { decision = "Chấp nhận — Cho vay đến $8.000"; limit = 8000; cls = "badge-success"; }
    else if (total >= 39) { decision = "Chấp nhận — Cho vay đến $5.000"; limit = 5000; cls = "badge-success"; }
    else if (total >= 37) { decision = "Chấp nhận — Cho vay đến $3.500"; limit = 3500; cls = "badge-success"; }
    else if (total >= 34) { decision = "Chấp nhận — Cho vay đến $2.500"; limit = 2500; cls = "badge-info"; }
    else if (total >= 31) { decision = "Chấp nhận — Cho vay đến $1.000"; limit = 1000; cls = "badge-info"; }
    else if (total >= 29) { decision = "Chấp nhận có điều kiện — Cho vay đến $500"; limit = 500; cls = "badge-warning"; }

    return { total, decision, limit, cls };
  }

  // =========================================================================
  // 5. CẤU TRÚC KỲ HẠN RRTD (Term Structure) & BASEL I / II (SA, F-IRB, A-IRB)
  // =========================================================================
  function calculateTermStructure(ts) {
    const i1 = Number(ts.i1) / 100, i2 = Number(ts.i2) / 100, i3 = Number(ts.i3) / 100;
    const k1 = Number(ts.k1) / 100, k2 = Number(ts.k2) / 100, k3 = Number(ts.k3) / 100;
    const beta = Math.min(0.99, Math.max(0, Number(ts.beta) / 100));

    // Forward rates: (1+i2)^2 = (1+i1)(1+f1) => f1 = (1+i2)^2/(1+i1) - 1
    const f1 = Math.pow(1 + i2, 2) / (1 + i1) - 1;
    const f2 = Math.pow(1 + i3, 3) / Math.pow(1 + i2, 2) - 1;
    const c1 = Math.pow(1 + k2, 2) / (1 + k1) - 1;
    const c2 = Math.pow(1 + k3, 3) / Math.pow(1 + k2, 2) - 1;

    // p*(1+k) + beta*(1+k)*(1-p) = (1+i) => p = [(1+i)/(1+k) - beta] / (1 - beta)
    const solveP = (rf, corp) => {
      const ratio = (1 + rf) / (1 + corp);
      const p = (ratio - beta) / (1 - beta);
      return Math.min(1, Math.max(0, p));
    };

    const p1 = solveP(i1, k1);
    const p2 = solveP(f1, c1);
    const p3 = solveP(f2, c2);

    const pd1 = 1 - p1;
    const pd2 = 1 - p2;
    const pd3 = 1 - p3;

    const cp1 = 1 - p1;
    const cp2 = 1 - p1 * p2;
    const cp3 = 1 - p1 * p2 * p3;

    return {
      years: [
        { year: 1, rf: i1, corp: k1, spread: k1 - i1, survP: p1, annualPD: pd1, cumPD: cp1 },
        { year: 2, rf: f1, corp: c1, spread: c1 - f1, survP: p2, annualPD: pd2, cumPD: cp2 },
        { year: 3, rf: f2, corp: c2, spread: c2 - f2, survP: p3, annualPD: pd3, cumPD: cp3 }
      ]
    };
  }

  function calculateBaselIRB(params) {
    const EAD = Number(params.ead);
    const PD = Math.min(0.9999, Math.max(0.0001, Number(params.pd) / 100));
    const LGD = Math.min(1, Math.max(0, Number(params.lgd) / 100));
    const M = Math.min(5, Math.max(1, Number(params.maturity)));

    // Công thức Basel II IRB theo tài liệu PGS TS Phan Thị Hằng Nga
    const expTerm = (1 - Math.exp(-50 * PD)) / (1 - Math.exp(-50));
    const rho = 0.12 * expTerm + 0.24 * (1 - expTerm);
    const b = Math.pow(0.11852 - 0.05478 * Math.log(PD), 2);
    const MA = (1 + (M - 2.5) * b) / (1 - 1.5 * b);
    const wcdr = normCDF((normInv(PD) + Math.sqrt(rho) * normInv(0.999)) / Math.sqrt(1 - rho));
    const K = LGD * (wcdr - PD) * MA;
    const EL = PD * LGD * EAD;
    const RWA = 12.5 * EAD * K;
    const minCapital = 0.08 * RWA;

    return { EAD, PD, LGD, M, rho, b, MA, wcdr, K, EL, RWA, minCapital };
  }

  // =========================================================================
  // 6. THẨM ĐỊNH DỰ ÁN (NPV, IRR, BCR, BEP), LỊCH TRẢ NỢ & PHÂN LOẠI NỢ 5 NHÓM
  // =========================================================================
  function calculateProjectFinance(pf) {
    const r = Number(pf.discountRate) / 100;
    const cfs = pf.cashFlows.map(Number);

    const calcNPV = (rate) => cfs.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
    const npv = calcNPV(r);

    let pvIn = 0, pvOut = 0;
    cfs.forEach((cf, t) => {
      const pv = cf / Math.pow(1 + r, t);
      if (cf >= 0) pvIn += pv; else pvOut += Math.abs(pv);
    });
    const bcr = pvOut > 0 ? pvIn / pvOut : 0;

    // Tính IRR bằng Bisection ổn định trên [-0.95, 5.0]
    let irr = null;
    let lo = -0.9, hi = 5.0;
    let fLo = calcNPV(lo), fHi = calcNPV(hi);
    if (fLo * fHi <= 0) {
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        const fMid = calcNPV(mid);
        if (Math.abs(fMid) < 1e-6) { irr = mid; break; }
        if (fLo * fMid <= 0) { hi = mid; fHi = fMid; }
        else { lo = mid; fLo = fMid; }
        irr = mid;
      }
    }

    // Điểm hòa vốn (Break-even Point)
    const F = Number(pf.fixedCost);
    const P = Number(pf.pricePerUnit);
    const Vu = Number(pf.varCostPerUnit);
    const Q = Math.max(1e-6, Number(pf.periodQuantity));
    const Sn = Number(pf.periodDays) || 360;
    const contrib = Math.max(1e-6, P - Vu);
    const Qhv = F / contrib;
    const DThv = P * Qhv;
    const Thv = (Sn * Qhv) / Q;
    const ebitAtQ = contrib * (Q - Qhv);

    return { npv, irr, bcr, pvIn, pvOut, Qhv, DThv, Thv, ebitAtQ };
  }

  function calculateRepaymentPlan(rep) {
    const rateAnnual = Number(rep.rateAnnual) / 100;
    let cumPrincipal = 0;
    let constructionInterest = 0;
    const trancheDetails = rep.tranches.map(tr => {
      cumPrincipal += Number(tr.amount);
      const interest = cumPrincipal * rateAnnual * (Number(tr.days) / 365);
      constructionInterest += interest;
      return { ...tr, cumPrincipal, interest };
    });

    const totalDebtStart = rep.capitalizeInterest ? (cumPrincipal + constructionInterest) : cumPrincipal;
    const totalPeriods = Number(rep.repayYears) * Number(rep.periodsPerYear);
    const periodRate = rateAnnual / Number(rep.periodsPerYear);
    const principalPerPeriod = totalDebtStart / totalPeriods;
    const extraConstIntPerPeriod = rep.capitalizeInterest ? 0 : (constructionInterest / totalPeriods);

    const schedule = [];
    let balance = totalDebtStart;
    let totalInterestPaid = 0;
    for (let k = 1; k <= totalPeriods; k++) {
      const interest = balance * periodRate + extraConstIntPerPeriod;
      const totalPay = principalPerPeriod + interest;
      const endBal = Math.max(0, balance - principalPerPeriod);
      totalInterestPaid += interest;
      schedule.push({
        period: k,
        beginBalance: balance,
        principal: principalPerPeriod,
        interest,
        totalPay,
        endBalance: endBal
      });
      balance = endBal;
    }

    // Nguồn trả nợ hàng năm = Khấu hao + Lợi nhuận sau khi trích lập quỹ
    const annualRepaySource = Number(rep.depreciationAnnual) +
      Number(rep.netProfitAnnual) * (1 - Number(rep.fundRetentionPct) / 100);
    const avgAnnualDebtService = (totalDebtStart + totalInterestPaid) / Number(rep.repayYears);
    const dscr = avgAnnualDebtService > 0 ? annualRepaySource / avgAnnualDebtService : 0;

    return {
      cumPrincipal,
      constructionInterest,
      totalDebtStart,
      schedule,
      totalInterestPaid,
      annualRepaySource,
      avgAnnualDebtService,
      dscr
    };
  }

  function calculatePortfolioNPL(p) {
    const g1 = Number(p.g1), g2 = Number(p.g2), g3 = Number(p.g3), g4 = Number(p.g4), g5 = Number(p.g5);
    const totalLoans = Math.max(1e-6, g1 + g2 + g3 + g4 + g5);
    const overdue = g2 + g3 + g4 + g5;
    const npl = g3 + g4 + g5;

    return {
      totalLoans,
      overdue,
      npl,
      overdueRatio: overdue / totalLoans,
      nplRatio: npl / totalLoans,
      totalExposureOverdueRatio: Number(p.totalExposureOfOverdue) / totalLoans,
      overdueCustomerRatio: Number(p.overdueCustomers) / Math.max(1, Number(p.totalCustomers)),
      h1: totalLoans / Math.max(1e-6, Number(p.totalDeposits)),
      h2: totalLoans / Math.max(1e-6, Number(p.totalAssets)),
      h3: totalLoans / Math.max(1e-6, Number(p.riskWeightedAssets)),
      groups: [g1, g2, g3, g4, g5]
    };
  }


  function calculateBaselIII(p) {
    const cet1 = Number(p.cet1);
    const at1 = Number(p.at1);
    const tier2 = Number(p.tier2);
    const tier1 = cet1 + at1;
    const totalCap = tier1 + tier2;

    const rwaStd = Math.max(1e-6, Number(p.rwaStd));
    const rwaIrb = Math.max(1e-6, Number(p.rwaIrb));
    // Basel III Finalized Output Floor: RWA hiệu dụng >= 72.5% * RWA Chuẩn hóa
    const outputFloorRwa = 0.725 * rwaStd;
    const effectiveRwa = Math.max(rwaIrb, outputFloorRwa);
    const floorTriggered = outputFloorRwa > rwaIrb;

    const cet1Ratio = cet1 / effectiveRwa;
    const tier1Ratio = tier1 / effectiveRwa;
    const totalCar = totalCap / effectiveRwa;

    const ccb = 0.025; // Capital Conservation Buffer = 2.5%
    const ccyb = Math.min(0.025, Math.max(0, Number(p.ccybPct) / 100));
    const reqCet1 = 0.045 + ccb + ccyb;
    const reqTier1 = 0.06 + ccb + ccyb;
    const reqTotal = 0.08 + ccb + ccyb;

    const totalExp = Math.max(1e-6, Number(p.totalExposure));
    const leverageRatio = tier1 / totalExp; // >= 3.0%

    const lcr = Number(p.hqla) / Math.max(1e-6, Number(p.netOutflows30d)); // >= 100%
    const nsfr = Number(p.asf) / Math.max(1e-6, Number(p.rsf)); // >= 100%

    const checks = {
      cet1Pass: cet1Ratio >= reqCet1,
      tier1Pass: tier1Ratio >= reqTier1,
      totalPass: totalCar >= reqTotal,
      levPass: leverageRatio >= 0.03,
      lcrPass: lcr >= 1.0,
      nsfrPass: nsfr >= 1.0
    };
    const allPass = Object.values(checks).every(Boolean);

    return {
      cet1, at1, tier1, tier2, totalCap,
      rwaStd, rwaIrb, outputFloorRwa, effectiveRwa, floorTriggered,
      cet1Ratio, tier1Ratio, totalCar,
      reqCet1, reqTier1, reqTotal, ccb, ccyb,
      leverageRatio, lcr, nsfr, checks, allPass
    };
  }

  global.CreditModelsEngine = {
    normCDF,
    normInv,
    runCreditScorecardPipeline,
    simulateCutoff,
    calculateCorporateModels,
    calculateConsumerScore,
    calculateTermStructure,
    calculateBaselIRB,
    calculateBaselIII,
    calculateProjectFinance,
    calculateRepaymentPlan,
    calculatePortfolioNPL
  };
})(window);

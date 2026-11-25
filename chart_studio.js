/* chart_studio.js v2.5 — Hệ thống Biểu đồ Đa dạng & Tương tác Trực tiếp (Chart.js Plugins + Toolbar + Drill-down + PNG + Phóng to) */
(function (global) {
  "use strict";

  const chartInstances = {};
  const chartRegistry = {}; // canvasId -> { baseConfig, meta, mode, showLabels }
  let modalChart = null;
  let activeModalId = null;

  // Cấu hình các kiểu biểu đồ tương thích cho từng canvasId
  const CHART_PRESETS = {
    chartRoc:         { modes: ["area", "line"], defaultMode: "area", defaultLabels: true, title: "Đường cong ROC (AUC & Gini)" },
    chartKs:          { modes: ["line", "area"], defaultMode: "line", defaultLabels: true, title: "Biểu đồ phân tách KS" },
    chartMasterScale: { modes: ["combo", "bar", "line", "area"], defaultMode: "combo", defaultLabels: true, title: "Phổ Hạng Tín Dụng — Master Scale 10 Hạng" },
    chartIv:          { modes: ["hbar", "bar", "polar", "doughnut"], defaultMode: "hbar", defaultLabels: true, title: "Xếp hạng Information Value (IV)" },
    chartAltman:      { modes: ["bar", "hbar", "radar", "polar"], defaultMode: "bar", defaultLabels: true, title: "So sánh 3 phiên bản Altman Z-Score" },
    chartQualitative: { modes: ["radar", "bar", "polar", "line"], defaultMode: "radar", defaultLabels: true, title: "Điểm Định tính 6C" },
    chartConsumer:    { modes: ["bar", "hbar", "radar", "polar", "doughnut"], defaultMode: "bar", defaultLabels: true, title: "Cấu thành Điểm Tín dụng Tiêu dùng" },
    chartTermStruct:  { modes: ["line", "area", "bar"], defaultMode: "line", defaultLabels: true, title: "Cấu trúc Kỳ hạn PD Hàng năm & Tích lũy" },
    chartBaselSens:   { modes: ["area", "line", "bar"], defaultMode: "area", defaultLabels: true, title: "Độ nhạy RWA IRB theo PD" },
    chartBaselIII:    { modes: ["bar", "hbar", "radar", "line"], defaultMode: "bar", defaultLabels: true, title: "Đối chiếu 6 Chuẩn Basel III" },
    chartBep:         { modes: ["line", "area", "bar"], defaultMode: "line", defaultLabels: false, title: "Biểu đồ Điểm hòa vốn (BEP)" },
    chartNpl:         { modes: ["doughnut", "pie", "polar", "bar"], defaultMode: "doughnut", defaultLabels: true, title: "Cơ cấu 5 Nhóm Nợ (NPL)" },
    chartYieldCurve:  { modes: ["line", "area", "bar"], defaultMode: "line", defaultLabels: true, title: "Đường cong Lãi suất Coupon / Zero / Forward" },
    chartGap:         { modes: ["bar", "hbar", "line", "area"], defaultMode: "bar", defaultLabels: true, title: "Mô hình Định giá lại — GAP 6 Khung kỳ hạn" },
    chartConvexity:   { modes: ["line", "area", "bar"], defaultMode: "line", defaultLabels: false, title: "Độ lồi Trái phiếu (Convexity)" },
    chartDerivatives: { modes: ["line", "area", "bar"], defaultMode: "line", defaultLabels: false, title: "Payoff Phái sinh Swap / Cap / Collar" },
    chartCmo:         { modes: ["stackedBar", "bar", "line", "area"], defaultMode: "stackedBar", defaultLabels: true, title: "Dòng tiền Trả gốc CMO Hạng A / B / C" },
    chartCamel:       { modes: ["radar", "polar", "bar", "doughnut"], defaultMode: "radar", defaultLabels: true, title: "Sức khỏe 5 Trụ cột CAMEL" },
    chartBiRadar:     { modes: ["radar", "bar", "hbar", "polar"], defaultMode: "radar", defaultLabels: true, title: "BI — Điểm Sức khỏe 6 Trụ cột Rủi ro (0–100)" },
    chartBiCreditMix: { modes: ["combo", "bar", "line", "area"], defaultMode: "combo", defaultLabels: true, title: "BI — Phổ Hạng Tín Dụng (Cross-filtered)" },
    chartBiCapitalStress: { modes: ["bar", "hbar", "line", "radar"], defaultMode: "bar", defaultLabels: true, title: "BI — Stress Test Vốn, Nợ xấu & Thanh khoản" },
    chartBiRwaMix:    { modes: ["doughnut", "pie", "polar", "bar"], defaultMode: "doughnut", defaultLabels: true, title: "BI — Cơ cấu Tài sản Rủi ro (RWA & NPL)" },
    chartBiMultiYear: { modes: ["line", "bar", "area", "radar"], defaultMode: "line", defaultLabels: true, title: "BI — Xu hướng Đa năm (Altman Z, NPL, CAR & ROE)" }
  };

  const MODE_LABELS = {
    combo: "Kết hợp",
    bar: "Cột đứng",
    hbar: "Cột ngang",
    stackedBar: "Cột chồng",
    line: "Đường",
    area: "Vùng",
    radar: "Radar",
    doughnut: "Vòng",
    pie: "Tròn",
    polar: "Polar"
  };

  // =========================================================================
  // CUSTOM CHART.JS PLUGINS (Không phụ thuộc CDN ngoài)
  // =========================================================================

  // 1. Crosshair đường gióng theo con trỏ chuột
  const crosshairPlugin = {
    id: "criskCrosshair",
    afterDatasetsDraw(chart) {
      const active = chart.tooltip && chart.tooltip.getActiveElements ? chart.tooltip.getActiveElements() : [];
      if (!active || !active.length) return;
      const chartArea = chart.chartArea;
      if (!chartArea || !chart.scales || !chart.scales.x) return;
      const pt = active[0].element;
      if (!pt) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(100, 116, 139, 0.55)";
      ctx.lineWidth = 1.2;
      ctx.moveTo(pt.x, chartArea.top);
      ctx.lineTo(pt.x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    }
  };

  // 2. Vẽ nhãn số trực tiếp trên cột/điểm/miếng (giống ảnh Master Scale mẫu) + Đường cắt KS Max + Hộp chú thích ROC
  const annotationAndLabelsPlugin = {
    id: "criskAnnotations",
    afterDatasetsDraw(chart) {
      const opts = chart.options.plugins?.criskMeta || {};
      const ctx = chart.ctx;
      const chartArea = chart.chartArea;
      if (!chartArea) return;

      ctx.save();

      // A. Vẽ đường nét đứt dọc & hộp gọi KS Max (giống ảnh 2)
      if (opts.ksInfo && chart.scales.x && chart.scales.y) {
        const { ks, maxKSPct } = opts.ksInfo;
        const xPos = chart.scales.x.getPixelForValue(maxKSPct);
        if (xPos >= chartArea.left && xPos <= chartArea.right) {
          ctx.beginPath();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = "#475569";
          ctx.lineWidth = 1.8;
          ctx.moveTo(xPos, chartArea.top);
          ctx.lineTo(xPos, chartArea.bottom);
          ctx.stroke();
          ctx.setLineDash([]);

          // Hộp callout KS
          const line1 = `KS = ${(ks * 100).toFixed(2)}%`;
          const line2 = `(Tại Top ${maxKSPct.toFixed(1)}% KH rủi ro nhất)`;
          ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
          const w1 = ctx.measureText(line1).width;
          ctx.font = "10.5px -apple-system, BlinkMacSystemFont, sans-serif";
          const w2 = ctx.measureText(line2).width;
          const boxW = Math.max(w1, w2) + 18;
          const boxH = 38;
          let boxX = xPos + 12;
          if (boxX + boxW > chartArea.right - 4) boxX = xPos - boxW - 12;
          const boxY = chartArea.top + (chartArea.bottom - chartArea.top) * 0.42;

          ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
          ctx.strokeStyle = "#64748b";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxW, boxH, 6);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "#0f172a";
          ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.textAlign = "left";
          ctx.fillText(line1, boxX + 9, boxY + 15);
          ctx.font = "10.5px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.fillStyle = "#334155";
          ctx.fillText(line2, boxX + 9, boxY + 30);
        }
      }

      // B. Vẽ hộp Gini & AUC trên biểu đồ ROC
      if (opts.rocInfo && chart.scales.x && chart.scales.y) {
        const { gini, auc } = opts.rocInfo;
        const txt = `Gini = ${(gini * 100).toFixed(2)}% | AUC = ${auc.toFixed(3)}`;
        ctx.font = "bold 11.5px -apple-system, BlinkMacSystemFont, sans-serif";
        const boxW = ctx.measureText(txt).width + 18;
        const boxH = 26;
        const boxX = chartArea.left + 12;
        const boxY = chartArea.top + 10;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.strokeStyle = "#b91c1c";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#991b1b";
        ctx.textAlign = "left";
        ctx.fillText(txt, boxX + 9, boxY + 17);
      }

      // C. Vẽ nhãn số cố định nếu showLabels = true
      if (opts.showLabels) {
        const isPieLike = ["doughnut", "pie", "polarArea"].includes(chart.config.type);
        const isHorizontal = chart.options.indexAxis === "y";

        chart.data.datasets.forEach((ds, dsIdx) => {
          const meta = chart.getDatasetMeta(dsIdx);
          if (!meta || meta.hidden) return;
          // Bỏ qua đường random ROC hoặc chuỗi quá nhiều điểm (>20 điểm)
          if (ds.label && ds.label.includes("Đoán mò")) return;
          if (meta.data.length > 20) return;

          const isBadRateLine = ds.label && ds.label.includes("Bad Rate");
          const dsType = ds.type || chart.config.type;

          meta.data.forEach((el, idx) => {
            const rawVal = ds.data[idx];
            const val = typeof rawVal === "object" && rawVal !== null ? rawVal.y : Number(rawVal);
            if (!isFinite(val)) return;

            let labelText;
            if (isBadRateLine) {
              labelText = `${val.toFixed(1)}%`;
            } else if (Math.abs(val) >= 1000) {
              labelText = Math.round(val).toLocaleString("vi-VN");
            } else if (Math.abs(val) < 1 && val !== 0) {
              labelText = val.toFixed(3);
            } else {
              labelText = Number.isInteger(val) ? String(val) : val.toFixed(1);
            }

            ctx.font = "bold 10.5px -apple-system, BlinkMacSystemFont, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            if (isBadRateLine && dsType === "line") {
              // Hộp trắng viền đỏ chữ đỏ giống ảnh Master Scale mẫu!
              const tw = ctx.measureText(labelText).width + 8;
              const th = 17;
              const bx = el.x - tw / 2;
              const by = Math.max(chartArea.top + 2, el.y - 24);
              ctx.fillStyle = "rgba(255,255,255,0.95)";
              ctx.strokeStyle = "#be123c";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.roundRect(bx, by, tw, th, 4);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = "#be123c";
              ctx.fillText(labelText, el.x, by + th / 2 + 0.5);
            } else if (dsType === "bar") {
              ctx.fillStyle = "#0f172a";
              if (isHorizontal) {
                ctx.textAlign = "left";
                ctx.fillText(labelText, Math.min(chartArea.right - 34, el.x + 5), el.y);
              } else {
                const barH = Math.abs(el.base - el.y);
                const yPos = barH > 24 ? (el.y + el.base) / 2 : el.y - 10;
                ctx.fillText(labelText, el.x, yPos);
              }
            } else if (isPieLike) {
              const total = ds.data.reduce((s, v) => s + (Number(v) || 0), 0) || 1;
              const pctShare = ((val / total) * 100).toFixed(1) + "%";
              const pos = el.tooltipPosition();
              ctx.fillStyle = "#ffffff";
              ctx.shadowColor = "rgba(15,23,42,0.55)";
              ctx.shadowBlur = 3;
              ctx.fillText(pctShare, pos.x, pos.y);
              ctx.shadowBlur = 0;
            } else if (dsType === "line" || dsType === "radar") {
              ctx.fillStyle = ds.borderColor || "#1e293b";
              ctx.fillText(labelText, el.x, el.y - 10);
            }
          });
        });
      }

      ctx.restore();
    }
  };

  if (typeof Chart !== "undefined") {
    Chart.register(crosshairPlugin, annotationAndLabelsPlugin);
  }

  // =========================================================================
  // CHUYỂN ĐỔI CẤU HÌNH BIỂU ĐỒ THEO MODE NGƯỜI DÙNG CHỌN
  // =========================================================================
  function cloneDeep(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function buildConfigForMode(baseConfig, mode, showLabels, meta, canvasId) {
    const cfg = cloneDeep(baseConfig);
    cfg.options = cfg.options || {};
    cfg.options.responsive = true;
    cfg.options.maintainAspectRatio = false;
    cfg.options.interaction = cfg.options.interaction || { mode: "nearest", intersect: false };
    cfg.options.plugins = cfg.options.plugins || {};
    cfg.options.plugins.legend = cfg.options.plugins.legend || { display: true };
    cfg.options.plugins.legend.labels = { usePointStyle: true, boxWidth: 8, font: { size: 11 } };
    cfg.options.plugins.criskMeta = {
      showLabels,
      ksInfo: meta?.ksInfo || null,
      rocInfo: meta?.rocInfo || null
    };

    // Click trực tiếp trên biểu đồ để xem chi tiết điểm dữ liệu
    cfg.options.onClick = function (evt, elements, chart) {
      if (!elements || !elements.length) return;
      const el = elements[0];
      const ds = chart.data.datasets[el.datasetIndex];
      const label = chart.data.labels ? chart.data.labels[el.index] : `Điểm #${el.index + 1}`;
      const raw = ds.data[el.index];
      const val = typeof raw === "object" && raw !== null ? `x=${Number(raw.x).toFixed(2)}, y=${Number(raw.y).toFixed(2)}` : Number(raw).toLocaleString("vi-VN");
      showInspectStrip(canvasId, { label, series: ds.label || "Giá trị", value: val, index: el.index, meta });
    };

    cfg.options.onHover = function (evt, elements) {
      if (evt.native && evt.native.target) {
        evt.native.target.style.cursor = elements.length ? "pointer" : "default";
      }
    };

    // Chuyển đổi kiểu biểu đồ linh hoạt
    const palette = ["#1d4ed8", "#0f766e", "#d97706", "#dc2626", "#7c3aed", "#0284c7", "#059669", "#be123c"];

    if (mode === "combo") {
      // Giữ nguyên config gốc (Master Scale Bar + Line)
      return cfg;
    }

    if (mode === "stackedBar") {
      cfg.type = "bar";
      cfg.options.scales = { x: { stacked: true }, y: { stacked: true } };
      cfg.data.datasets.forEach(ds => { ds.type = "bar"; ds.stack = "s1"; });
      return cfg;
    }

    if (mode === "hbar") {
      cfg.type = "bar";
      cfg.options.indexAxis = "y";
      cfg.data.datasets.forEach((ds, i) => {
        delete ds.type;
        delete ds.yAxisID;
        if (!ds.backgroundColor || ds.backgroundColor === "#ffffff") ds.backgroundColor = palette[i % palette.length];
      });
      if (cfg.options.scales && cfg.options.scales.y1) delete cfg.options.scales.y1;
      return cfg;
    }

    if (mode === "bar") {
      cfg.type = "bar";
      cfg.options.indexAxis = "x";
      if (cfg.options.scales && cfg.options.scales.r) delete cfg.options.scales.r;
      if (cfg.options.scales && cfg.options.scales.y1) delete cfg.options.scales.y1;
      // Nếu là Master Scale chuyển sang Bar, chỉ hiển thị Bad Rate hoặc giữ 2 cột
      cfg.data.datasets.forEach((ds, i) => {
        delete ds.type;
        delete ds.stack;
        delete ds.yAxisID;
        if (!ds.backgroundColor || ds.backgroundColor === "#ffffff") ds.backgroundColor = palette[i % palette.length];
      });
      return cfg;
    }

    if (mode === "line" || mode === "area") {
      cfg.type = "line";
      delete cfg.options.indexAxis;
      if (cfg.options.scales && cfg.options.scales.r) delete cfg.options.scales.r;
      cfg.data.datasets.forEach((ds, i) => {
        delete ds.type;
        delete ds.stack;
        const color = ds.borderColor || (Array.isArray(ds.backgroundColor) ? palette[i % palette.length] : ds.backgroundColor) || palette[i % palette.length];
        ds.borderColor = color;
        ds.borderWidth = ds.borderWidth || 2.5;
        ds.tension = ds.tension ?? 0.25;
        if (mode === "area") {
          ds.fill = true;
          if (!ds.backgroundColor || ds.backgroundColor === "#ffffff" || Array.isArray(ds.backgroundColor)) {
            ds.backgroundColor = "rgba(29, 78, 216, 0.14)";
          }
        } else {
          ds.fill = false;
        }
      });
      return cfg;
    }

    if (mode === "radar") {
      cfg.type = "radar";
      delete cfg.options.indexAxis;
      cfg.options.scales = { r: { beginAtZero: true } };
      cfg.data.datasets.forEach((ds, i) => {
        delete ds.type;
        delete ds.yAxisID;
        const c = palette[i % palette.length];
        ds.borderColor = c;
        ds.backgroundColor = i === 0 ? "rgba(29, 78, 216, 0.2)" : "rgba(220, 38, 38, 0.16)";
        ds.pointBackgroundColor = c;
      });
      return cfg;
    }

    if (mode === "doughnut" || mode === "pie" || mode === "polar") {
      cfg.type = mode === "polar" ? "polarArea" : mode;
      delete cfg.options.indexAxis;
      delete cfg.options.scales;
      cfg.options.plugins.legend = { display: true, position: "right" };
      // Lấy dataset đầu tiên cho biểu đồ tròn/polar
      if (cfg.data.datasets.length > 1) cfg.data.datasets = [cfg.data.datasets[0]];
      const ds = cfg.data.datasets[0];
      delete ds.type;
      delete ds.yAxisID;
      if (!Array.isArray(ds.backgroundColor)) {
        ds.backgroundColor = ds.data.map((_, idx) => palette[idx % palette.length]);
      }
      return cfg;
    }

    return cfg;
  }

  // =========================================================================
  // THANH CÔNG CỤ TƯƠNG TÁC TRÊN TỪNG BIỂU ĐỒ & DẢI DRILL-DOWN KHI CLICK
  // =========================================================================
  function ensureToolbar(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const container = canvas.parentElement; // .chart-box or .chart-box-sm
    if (!container) return;

    let toolbar = container.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains("chart-toolbar")) {
      toolbar = document.createElement("div");
      toolbar.className = "chart-toolbar";
      toolbar.dataset.chartFor = canvasId;
      container.parentElement.insertBefore(toolbar, container);
    }

    const reg = chartRegistry[canvasId];
    const preset = CHART_PRESETS[canvasId] || { modes: ["bar", "line", "area"], defaultMode: "bar", defaultLabels: true };

    toolbar.innerHTML = `
      <div class="ct-modes">
        ${preset.modes.map(m => `
          <button type="button" class="ct-btn ${reg.mode === m ? "active" : ""}" onclick="window.ChartStudio.setMode('${canvasId}', '${m}')">${MODE_LABELS[m] || m}</button>
        `).join("")}
      </div>
      <div class="ct-actions">
        <button type="button" class="ct-btn ${reg.showLabels ? "active" : ""}" title="Bật/tắt nhãn số cố định trên biểu đồ" onclick="window.ChartStudio.toggleLabels('${canvasId}')">🏷 Nhãn số</button>
        <button type="button" class="ct-btn" title="Phóng to toàn màn hình" onclick="window.ChartStudio.openModal('${canvasId}')">⛶ Phóng to</button>
        <button type="button" class="ct-btn" title="Tải ảnh PNG độ nét cao" onclick="window.ChartStudio.downloadPNG('${canvasId}')">📷 PNG</button>
      </div>
    `;

    // Tạo dải inspect ngay dưới container (idempotent)
    let strip = container.nextElementSibling;
    if (!strip || !strip.classList.contains("chart-inspect-strip")) {
      strip = document.createElement("div");
      strip.className = "chart-inspect-strip";
      strip.id = `inspect_${canvasId}`;
      strip.innerHTML = `<span class="inspect-hint">💡 Nhấp trực tiếp vào bất kỳ cột/điểm nào trên biểu đồ để xem chi tiết, hoặc bấm mục chú thích để ẩn/hiện đường.</span>`;
      container.parentElement.insertBefore(strip, container.nextSibling);
    }
  }

  function showInspectStrip(canvasId, info) {
    const strip = document.getElementById(`inspect_${canvasId}`);
    if (!strip) return;
    let extra = "";
    if ((canvasId === "chartMasterScale" || canvasId === "chartBiCreditMix") && info.meta && info.meta.masterScale) {
      const ms = info.meta.masterScale[info.index];
      if (ms) {
        extra = ` | Khoảng điểm: <strong>${ms.minScore} – ${ms.maxScore}</strong> | Train/Val: <strong>${ms.trainCount}/${ms.valCount}</strong> | Số ca nợ xấu: <strong>${ms.bads}</strong> | Bad Rate: <strong>${(ms.badRate * 100).toFixed(2)}%</strong>`;
      }
    }
    strip.innerHTML = `<strong>🔍 Đang chọn [${info.label}]</strong> — ${info.series}: <strong>${info.value}</strong>${extra}`;
  }

  // =========================================================================
  // API CHÍNH: RENDER, ĐỔI KIỂU, NHÃN SỐ, PHÓNG TO MODAL, TẢI PNG
  // =========================================================================
  function render(canvasId, baseConfig, meta = {}) {
    if (typeof Chart === "undefined") return;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const preset = CHART_PRESETS[canvasId] || { modes: ["bar", "line", "area"], defaultMode: baseConfig.type || "bar", defaultLabels: true };
    const existing = chartRegistry[canvasId];
    const mode = existing ? existing.mode : preset.defaultMode;
    const showLabels = existing ? existing.showLabels : preset.defaultLabels;

    chartRegistry[canvasId] = { baseConfig, meta, mode, showLabels };
    ensureToolbar(canvasId);

    const finalConfig = buildConfigForMode(baseConfig, mode, showLabels, meta, canvasId);
    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
    }
    chartInstances[canvasId] = new Chart(canvas.getContext("2d"), finalConfig);
  }

  function setMode(canvasId, mode) {
    const reg = chartRegistry[canvasId];
    if (!reg) return;
    reg.mode = mode;
    render(canvasId, reg.baseConfig, reg.meta);
    if (activeModalId === canvasId) renderModalChart(canvasId);
  }

  function toggleLabels(canvasId) {
    const reg = chartRegistry[canvasId];
    if (!reg) return;
    reg.showLabels = !reg.showLabels;
    render(canvasId, reg.baseConfig, reg.meta);
    if (activeModalId === canvasId) renderModalChart(canvasId);
  }

  function downloadPNG(canvasId) {
    const chart = chartInstances[canvasId];
    if (!chart) return;
    // Vẽ lên canvas nền trắng để ảnh tải về không bị trong suốt
    const src = chart.canvas;
    const tmp = document.createElement("canvas");
    tmp.width = src.width;
    tmp.height = src.height;
    const ctx = tmp.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(src, 0, 0);
    const link = document.createElement("a");
    link.download = `Crisk-boy_${canvasId}.png`;
    link.href = tmp.toDataURL("image/png", 1.0);
    link.click();
  }

  function ensureModalDOM() {
    if (document.getElementById("chartStudioModal")) return;
    const modal = document.createElement("div");
    modal.id = "chartStudioModal";
    modal.className = "cs-modal";
    modal.innerHTML = `
      <div class="cs-modal-content">
        <div class="cs-modal-header">
          <h3 id="csModalTitle">Biểu đồ phóng to</h3>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-outline btn-sm" onclick="window.ChartStudio.downloadModalPNG()">📷 Tải ảnh PNG</button>
            <button type="button" class="btn btn-primary btn-sm" onclick="window.ChartStudio.closeModal()">✕ Đóng</button>
          </div>
        </div>
        <div class="cs-modal-body">
          <canvas id="csModalCanvas"></canvas>
        </div>
      </div>
    `;
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    document.body.appendChild(modal);
  }

  function renderModalChart(canvasId) {
    const reg = chartRegistry[canvasId];
    if (!reg) return;
    const canvas = document.getElementById("csModalCanvas");
    if (!canvas) return;
    if (modalChart) modalChart.destroy();
    const cfg = buildConfigForMode(reg.baseConfig, reg.mode, reg.showLabels, reg.meta, canvasId);
    modalChart = new Chart(canvas.getContext("2d"), cfg);
  }

  function openModal(canvasId) {
    ensureModalDOM();
    activeModalId = canvasId;
    const preset = CHART_PRESETS[canvasId] || { title: canvasId };
    document.getElementById("csModalTitle").textContent = preset.title;
    document.getElementById("chartStudioModal").classList.add("open");
    setTimeout(() => renderModalChart(canvasId), 30);
  }

  function closeModal() {
    const modal = document.getElementById("chartStudioModal");
    if (modal) modal.classList.remove("open");
    activeModalId = null;
    if (modalChart) { modalChart.destroy(); modalChart = null; }
  }

  function downloadModalPNG() {
    if (activeModalId) downloadPNG(activeModalId);
  }

  function resizeAll() {
    Object.values(chartInstances).forEach(c => {
      if (c && typeof c.resize === "function") c.resize();
    });
  }

  global.ChartStudio = {
    render,
    setMode,
    toggleLabels,
    downloadPNG,
    openModal,
    closeModal,
    downloadModalPNG,
    resizeAll
  };
})(window);

/* ============ 纯 SVG 图表渲染（无外部依赖） ============ */
(function (global) {
  'use strict';

  const PALETTE = ['#2e8fd0', '#e8843c', '#3fae6a', '#c0504d', '#8064a2',
                   '#4bacc6', '#f2b134', '#7f9db9', '#d96fa5', '#5d9c59'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function niceTicks(min, max, count) {
    if (!isFinite(min) || !isFinite(max)) return { ticks: [0, 1], min: 0, max: 1 };
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const step0 = span / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    let step;
    if (norm <= 1) step = 1; else if (norm <= 2) step = 2; else if (norm <= 2.5) step = 2.5;
    else if (norm <= 5) step = 5; else step = 10;
    step *= mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
    return { ticks, min: lo, max: hi };
  }

  function fmtAxis(v) {
    if (Math.abs(v) >= 1e6 || (v !== 0 && Math.abs(v) < 1e-3)) return v.toExponential(1);
    if (Math.abs(v) >= 1000) return String(Math.round(v));
    return String(+v.toFixed(2));
  }

  function svgOpen(w, h) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" ` +
      `font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="11">` +
      `<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`;
  }

  function axes(o) {
    // o: {m, iw, ih, xs:[{x,label}], yTicks, yMin, yMax, xLabel, yLabel, rotate}
    const { m, iw, ih, xs, yTicks, yMin, yMax, xLabel, yLabel, rotate } = o;
    let s = '';
    // 网格 + y 轴刻度
    yTicks.forEach(t => {
      const y = m.top + ih - (t - yMin) / (yMax - yMin) * ih;
      s += `<line x1="${m.left}" y1="${y.toFixed(1)}" x2="${m.left + iw}" y2="${y.toFixed(1)}" stroke="#e6ecf3" stroke-width="1"/>`;
      s += `<line x1="${m.left - 4}" y1="${y.toFixed(1)}" x2="${m.left}" y2="${y.toFixed(1)}" stroke="#9aa9bb"/>`;
      s += `<text x="${m.left - 7}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" fill="#4a5a6a">${esc(fmtAxis(t))}</text>`;
    });
    // 边框
    s += `<line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + ih}" stroke="#9aa9bb"/>`;
    s += `<line x1="${m.left}" y1="${m.top + ih}" x2="${m.left + iw}" y2="${m.top + ih}" stroke="#9aa9bb"/>`;
    // x 标签
    xs.forEach(x => {
      if (rotate) {
        s += `<text x="${x.x.toFixed(1)}" y="${m.top + ih + 12}" text-anchor="end" fill="#4a5a6a" ` +
             `transform="rotate(-38 ${x.x.toFixed(1)} ${m.top + ih + 12})">${esc(x.label)}</text>`;
      } else {
        s += `<text x="${x.x.toFixed(1)}" y="${m.top + ih + 14}" text-anchor="middle" fill="#4a5a6a">${esc(x.label)}</text>`;
      }
    });
    if (xLabel) s += `<text x="${m.left + iw / 2}" y="${m.top + ih + (rotate ? 54 : 30)}" text-anchor="middle" fill="#5b6b7c">${esc(xLabel)}</text>`;
    if (yLabel) s += `<text x="14" y="${m.top + ih / 2}" text-anchor="middle" fill="#5b6b7c" transform="rotate(-90 14 ${m.top + ih / 2})">${esc(yLabel)}</text>`;
    return s;
  }

  function legend(items, x, y) {
    let s = '';
    items.forEach((it, i) => {
      const yy = y + i * 15;
      s += `<rect x="${x}" y="${yy - 8}" width="10" height="10" fill="${it.color}" stroke="#8fa2b5"/>`;
      s += `<text x="${x + 15}" y="${yy + 1}" fill="#3b4b5b">${esc(it.label)}</text>`;
    });
    return s;
  }

  // ---------------- 条形图 ----------------
  function bar(spec) {
    const data = spec.series || [];
    const W = 560, H = 330;
    const rotate = data.length > 8;
    const m = { top: 16, right: 16, bottom: rotate ? 62 : 46, left: 58 };
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
    const maxV = Math.max(1, ...data.map(d => d.value));
    const yt = niceTicks(0, maxV, 5);
    const step = iw / Math.max(1, data.length);
    const bw = Math.min(46, step * 0.68);
    const xs = data.map((d, i) => ({ x: m.left + step * (i + 0.5), label: d.label }));
    let s = svgOpen(W, H);
    s += axes({ m, iw, ih, xs, yTicks: yt.ticks, yMin: yt.min, yMax: yt.max, xLabel: spec.xLabel, yLabel: spec.yLabel, rotate });
    data.forEach((d, i) => {
      const h = (d.value - yt.min) / (yt.max - yt.min) * ih;
      const x = m.left + step * (i + 0.5) - bw / 2;
      const y = m.top + ih - h;
      s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="${PALETTE[i % PALETTE.length]}" fill-opacity="0.85" stroke="#ffffff"/>`;
      s += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" fill="#3b4b5b">${esc(d.value)}</text>`;
    });
    s += '</svg>';
    return s;
  }

  // ---------------- 直方图 ----------------
  function histogram(spec) {
    const data = spec.series || [];
    const W = 560, H = 330;
    const m = { top: 16, right: 16, bottom: 50, left: 58 };
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
    const maxV = Math.max(1, ...data.map(d => d.value));
    const step = iw / Math.max(1, data.length);
    const rotate = data.length > 8;

    // 先计算正态曲线（用于确定 y 轴范围，避免曲线被裁切）
    let curve = null, curveMax = 0;
    if (spec.mean != null && spec.std > 0 && data.length) {
      const lo = data[0].lo, hi = data[data.length - 1].hi;
      const binW = (hi - lo) / data.length || 1;
      const n = data.reduce((a, b) => a + b.value, 0);
      curve = [];
      for (let i = 0; i <= 80; i++) {
        const xv = lo + (hi - lo) * i / 80;
        const pdf = Math.exp(-0.5 * Math.pow((xv - spec.mean) / spec.std, 2)) / (spec.std * Math.sqrt(2 * Math.PI));
        const yv = pdf * n * binW;
        curveMax = Math.max(curveMax, yv);
        curve.push([xv, yv]);
      }
    }

    const yt = niceTicks(0, Math.max(maxV, curveMax), 5);
    const xs = data.map((d, i) => ({ x: m.left + step * (i + 0.5), label: d.lo != null ? d.lo.toFixed(1) : d.label }));
    let s = svgOpen(W, H);
    s += axes({ m, iw, ih, xs, yTicks: yt.ticks, yMin: yt.min, yMax: yt.max, xLabel: spec.xLabel, yLabel: spec.yLabel, rotate });
    data.forEach((d, i) => {
      const h = d.value / yt.max * ih;
      const x = m.left + step * i + 1;
      const y = m.top + ih - h;
      s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, step - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="#6aa9d8" fill-opacity="0.85" stroke="#2e8fd0"/>`;
    });
    if (curve) {
      const lo = data[0].lo, hi = data[data.length - 1].hi;
      const pts = curve.map(([xv, yv]) => {
        const px = m.left + (xv - lo) / (hi - lo) * iw;
        const py = m.top + ih - (yv / yt.max) * ih;
        return `${px.toFixed(1)},${py.toFixed(1)}`;
      });
      s += `<polyline points="${pts.join(' ')}" fill="none" stroke="#c0504d" stroke-width="1.8"/>`;
    }
    s += '</svg>';
    return s;
  }

  // ---------------- 饼图 ----------------
  function pie(spec) {
    const data = (spec.series || []).filter(d => d.value > 0);
    const W = 560, H = 320;
    const cx = 190, cy = H / 2, r = 110;
    const total = data.reduce((a, b) => a + b.value, 0) || 1;
    let s = svgOpen(W, H);
    let ang = -Math.PI / 2;
    data.forEach((d, i) => {
      const a2 = ang + d.value / total * Math.PI * 2;
      const x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      const large = (a2 - ang) > Math.PI ? 1 : 0;
      s += `<path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" ` +
           `fill="${PALETTE[i % PALETTE.length]}" fill-opacity="0.9" stroke="#fff" stroke-width="1.5"/>`;
      const mid = (ang + a2) / 2;
      if (d.value / total > 0.04) {
        const lx = cx + r * 0.68 * Math.cos(mid), ly = cy + r * 0.68 * Math.sin(mid);
        s += `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle" fill="#fff" font-weight="600">${(d.value / total * 100).toFixed(1)}%</text>`;
      }
      ang = a2;
    });
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#9aa9bb"/>`;
    const items = data.map((d, i) => ({ color: PALETTE[i % PALETTE.length], label: `${d.label} (${d.value})` }));
    s += legend(items, 340, 42);
    s += '</svg>';
    return s;
  }

  // ---------------- 散点图 ----------------
  function scatter(spec) {
    const W = 560, H = 330;
    const m = { top: 16, right: 16, bottom: 46, left: 60 };
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
    let groups = spec.groups || [{ name: null, points: spec.points || [] }];
    const all = [];
    groups.forEach(g => (g.points || []).forEach(p => all.push(p)));
    if (!all.length) return svgOpen(W, H) + '</svg>';
    const xsArr = all.map(p => p[0]), ysArr = all.map(p => p[1]);
    const xr = niceTicks(Math.min(...xsArr), Math.max(...xsArr), 5);
    const yr = niceTicks(Math.min(...ysArr), Math.max(...ysArr), 5);
    const X = v => m.left + (v - xr.min) / (xr.max - xr.min) * iw;
    const Y = v => m.top + ih - (v - yr.min) / (yr.max - yr.min) * ih;
    let s = svgOpen(W, H);
    // 网格
    yr.ticks.forEach(t => {
      s += `<line x1="${m.left}" y1="${Y(t).toFixed(1)}" x2="${m.left + iw}" y2="${Y(t).toFixed(1)}" stroke="#eef2f7"/>`;
      s += `<text x="${m.left - 7}" y="${(Y(t) + 3.5).toFixed(1)}" text-anchor="end" fill="#4a5a6a">${esc(fmtAxis(t))}</text>`;
    });
    xr.ticks.forEach(t => {
      s += `<line x1="${X(t).toFixed(1)}" y1="${m.top}" x2="${X(t).toFixed(1)}" y2="${m.top + ih}" stroke="#eef2f7"/>`;
      s += `<text x="${X(t).toFixed(1)}" y="${m.top + ih + 14}" text-anchor="middle" fill="#4a5a6a">${esc(fmtAxis(t))}</text>`;
    });
    s += `<line x1="${m.left}" y1="${m.top + ih}" x2="${m.left + iw}" y2="${m.top + ih}" stroke="#9aa9bb"/>`;
    s += `<line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + ih}" stroke="#9aa9bb"/>`;
    groups.forEach((g, gi) => {
      const col = PALETTE[gi % PALETTE.length];
      (g.points || []).forEach(p => {
        s += `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3" fill="${col}" fill-opacity="0.72" stroke="${col}"/>`;
      });
    });
    if (spec.fit) {
      s += `<line x1="${X(spec.fit[0][0]).toFixed(1)}" y1="${Y(spec.fit[0][1]).toFixed(1)}" x2="${X(spec.fit[1][0]).toFixed(1)}" y2="${Y(spec.fit[1][1]).toFixed(1)}" stroke="#c0504d" stroke-width="2" stroke-dasharray="6 3"/>`;
    }
    if (spec.xLabel) s += `<text x="${m.left + iw / 2}" y="${m.top + ih + 32}" text-anchor="middle" fill="#5b6b7c">${esc(spec.xLabel)}</text>`;
    if (spec.yLabel) s += `<text x="14" y="${m.top + ih / 2}" text-anchor="middle" fill="#5b6b7c" transform="rotate(-90 14 ${m.top + ih / 2})">${esc(spec.yLabel)}</text>`;
    if (groups.length > 1 && groups[0].name != null) {
      s += legend(groups.map((g, i) => ({ color: PALETTE[i % PALETTE.length], label: g.name })), m.left + 8, m.top + 16);
    }
    s += '</svg>';
    return s;
  }

  // ---------------- 箱线图 ----------------
  function box(spec) {
    const data = spec.series || [];
    const W = 560, H = 340;
    const m = { top: 16, right: 16, bottom: 52, left: 60 };
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
    if (!data.length) return svgOpen(W, H) + '</svg>';
    const lo = Math.min(...data.map(d => Math.min(d.min, ...(d.outliers || []))));
    const hi = Math.max(...data.map(d => Math.max(d.max, ...(d.outliers || []))));
    const yr = niceTicks(lo, hi, 5);
    const Y = v => m.top + ih - (v - yr.min) / (yr.max - yr.min) * ih;
    const step = iw / data.length;
    const bw = Math.min(52, step * 0.5);
    let s = svgOpen(W, H);
    yr.ticks.forEach(t => {
      s += `<line x1="${m.left}" y1="${Y(t).toFixed(1)}" x2="${m.left + iw}" y2="${Y(t).toFixed(1)}" stroke="#eef2f7"/>`;
      s += `<text x="${m.left - 7}" y="${(Y(t) + 3.5).toFixed(1)}" text-anchor="end" fill="#4a5a6a">${esc(fmtAxis(t))}</text>`;
    });
    data.forEach((d, i) => {
      const cx = m.left + step * (i + 0.5);
      const col = PALETTE[i % PALETTE.length];
      s += `<line x1="${cx}" y1="${Y(d.max).toFixed(1)}" x2="${cx}" y2="${Y(d.min).toFixed(1)}" stroke="#5b6b7c"/>`;
      s += `<line x1="${cx - bw / 3}" y1="${Y(d.max).toFixed(1)}" x2="${cx + bw / 3}" y2="${Y(d.max).toFixed(1)}" stroke="#5b6b7c"/>`;
      s += `<line x1="${cx - bw / 3}" y1="${Y(d.min).toFixed(1)}" x2="${cx + bw / 3}" y2="${Y(d.min).toFixed(1)}" stroke="#5b6b7c"/>`;
      s += `<rect x="${cx - bw / 2}" y="${Y(d.q3).toFixed(1)}" width="${bw}" height="${Math.max(1, Y(d.q1) - Y(d.q3)).toFixed(1)}" fill="${col}" fill-opacity="0.35" stroke="${col}"/>`;
      s += `<line x1="${cx - bw / 2}" y1="${Y(d.median).toFixed(1)}" x2="${cx + bw / 2}" y2="${Y(d.median).toFixed(1)}" stroke="#c0504d" stroke-width="2"/>`;
      (d.outliers || []).forEach(o => {
        s += `<circle cx="${cx}" cy="${Y(o).toFixed(1)}" r="2.5" fill="none" stroke="#c0504d"/>`;
      });
      s += `<text x="${cx}" y="${m.top + ih + 14}" text-anchor="middle" fill="#4a5a6a">${esc(d.label)}</text>`;
    });
    s += `<line x1="${m.left}" y1="${m.top + ih}" x2="${m.left + iw}" y2="${m.top + ih}" stroke="#9aa9bb"/>`;
    s += `<line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + ih}" stroke="#9aa9bb"/>`;
    if (spec.yLabel) s += `<text x="14" y="${m.top + ih / 2}" text-anchor="middle" fill="#5b6b7c" transform="rotate(-90 14 ${m.top + ih / 2})">${esc(spec.yLabel)}</text>`;
    s += '</svg>';
    return s;
  }

  // ---------------- 折线图 ----------------
  function line(spec) {
    const labels = spec.labels || [], vals = spec.values || [];
    const W = 560, H = 320;
    const m = { top: 16, right: 20, bottom: 52, left: 60 };
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
    if (!vals.length) return svgOpen(W, H) + '</svg>';
    const yr = niceTicks(Math.min(...vals), Math.max(...vals), 5);
    const step = iw / Math.max(1, vals.length - 1 || 1);
    const X = i => m.left + (vals.length === 1 ? iw / 2 : step * i);
    const Y = v => m.top + ih - (v - yr.min) / (yr.max - yr.min) * ih;
    let s = svgOpen(W, H);
    yr.ticks.forEach(t => {
      s += `<line x1="${m.left}" y1="${Y(t).toFixed(1)}" x2="${m.left + iw}" y2="${Y(t).toFixed(1)}" stroke="#eef2f7"/>`;
      s += `<text x="${m.left - 7}" y="${(Y(t) + 3.5).toFixed(1)}" text-anchor="end" fill="#4a5a6a">${esc(fmtAxis(t))}</text>`;
    });
    const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    s += `<polyline points="${pts}" fill="none" stroke="#2e8fd0" stroke-width="2"/>`;
    vals.forEach((v, i) => {
      s += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3" fill="#2e8fd0"/>`;
    });
    const rot = labels.length > 8;
    labels.forEach((lb, i) => {
      const x = X(i), y = m.top + ih + 14;
      s += rot
        ? `<text x="${x.toFixed(1)}" y="${y}" text-anchor="end" fill="#4a5a6a" transform="rotate(-38 ${x.toFixed(1)} ${y})">${esc(lb)}</text>`
        : `<text x="${x.toFixed(1)}" y="${y}" text-anchor="middle" fill="#4a5a6a">${esc(lb)}</text>`;
    });
    s += `<line x1="${m.left}" y1="${m.top + ih}" x2="${m.left + iw}" y2="${m.top + ih}" stroke="#9aa9bb"/>`;
    s += `<line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + ih}" stroke="#9aa9bb"/>`;
    if (spec.yLabel) s += `<text x="14" y="${m.top + ih / 2}" text-anchor="middle" fill="#5b6b7c" transform="rotate(-90 14 ${m.top + ih / 2})">${esc(spec.yLabel)}</text>`;
    s += '</svg>';
    return s;
  }

  // ---------------- Q-Q 图 ----------------
  function qq(spec) {
    const pts = spec.points || [];
    const W = 520, H = 320;
    const m = { top: 16, right: 20, bottom: 46, left: 60 };
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
    if (!pts.length) return svgOpen(W, H) + '</svg>';
    const allx = pts.map(p => p[0]), ally = pts.map(p => p[1]);
    const xr = niceTicks(Math.min(...allx), Math.max(...allx), 4);
    const yr = niceTicks(Math.min(...ally), Math.max(...ally), 4);
    const X = v => m.left + (v - xr.min) / (xr.max - xr.min) * iw;
    const Y = v => m.top + ih - (v - yr.min) / (yr.max - yr.min) * ih;
    let s = svgOpen(W, H);
    yr.ticks.forEach(t => {
      s += `<line x1="${m.left}" y1="${Y(t).toFixed(1)}" x2="${m.left + iw}" y2="${Y(t).toFixed(1)}" stroke="#eef2f7"/>`;
      s += `<text x="${m.left - 7}" y="${(Y(t) + 3.5).toFixed(1)}" text-anchor="end" fill="#4a5a6a">${esc(fmtAxis(t))}</text>`;
    });
    xr.ticks.forEach(t => {
      s += `<text x="${X(t).toFixed(1)}" y="${m.top + ih + 14}" text-anchor="middle" fill="#4a5a6a">${esc(fmtAxis(t))}</text>`;
    });
    const lo = Math.min(xr.min, yr.min), hi = Math.max(xr.max, yr.max);
    s += `<line x1="${X(lo).toFixed(1)}" y1="${Y(lo).toFixed(1)}" x2="${X(hi).toFixed(1)}" y2="${Y(hi).toFixed(1)}" stroke="#c0504d" stroke-width="1.5" stroke-dasharray="5 3"/>`;
    pts.forEach(p => {
      s += `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="2.8" fill="#2e8fd0" fill-opacity="0.7"/>`;
    });
    s += `<line x1="${m.left}" y1="${m.top + ih}" x2="${m.left + iw}" y2="${m.top + ih}" stroke="#9aa9bb"/>`;
    s += `<line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + ih}" stroke="#9aa9bb"/>`;
    if (spec.xLabel) s += `<text x="${m.left + iw / 2}" y="${m.top + ih + 32}" text-anchor="middle" fill="#5b6b7c">${esc(spec.xLabel)}</text>`;
    if (spec.yLabel) s += `<text x="14" y="${m.top + ih / 2}" text-anchor="middle" fill="#5b6b7c" transform="rotate(-90 14 ${m.top + ih / 2})">${esc(spec.yLabel)}</text>`;
    s += '</svg>';
    return s;
  }

  // ---------------- 误差条形图 ----------------
  function errorbar(spec) {
    const data = spec.series || [];
    const W = 560, H = 330;
    const m = { top: 16, right: 20, bottom: 52, left: 62 };
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
    if (!data.length) return svgOpen(W, H) + '</svg>';
    const lo = Math.min(...data.map(d => d.lo)), hi = Math.max(...data.map(d => d.hi));
    const yr = niceTicks(lo, hi, 5);
    const Y = v => m.top + ih - (v - yr.min) / (yr.max - yr.min) * ih;
    const step = iw / data.length;
    const bw = Math.min(46, step * 0.5);
    let s = svgOpen(W, H);
    yr.ticks.forEach(t => {
      s += `<line x1="${m.left}" y1="${Y(t).toFixed(1)}" x2="${m.left + iw}" y2="${Y(t).toFixed(1)}" stroke="#eef2f7"/>`;
      s += `<text x="${m.left - 7}" y="${(Y(t) + 3.5).toFixed(1)}" text-anchor="end" fill="#4a5a6a">${esc(fmtAxis(t))}</text>`;
    });
    data.forEach((d, i) => {
      const cx = m.left + step * (i + 0.5);
      const col = PALETTE[i % PALETTE.length];
      const h = Y(yr.min) - Y(d.mean);
      s += `<rect x="${cx - bw / 2}" y="${Y(d.mean).toFixed(1)}" width="${bw}" height="${Math.max(0, h).toFixed(1)}" fill="${col}" fill-opacity="0.45" stroke="${col}"/>`;
      s += `<line x1="${cx}" y1="${Y(d.lo).toFixed(1)}" x2="${cx}" y2="${Y(d.hi).toFixed(1)}" stroke="#2b3b4b" stroke-width="1.4"/>`;
      s += `<line x1="${cx - 7}" y1="${Y(d.hi).toFixed(1)}" x2="${cx + 7}" y2="${Y(d.hi).toFixed(1)}" stroke="#2b3b4b"/>`;
      s += `<line x1="${cx - 7}" y1="${Y(d.lo).toFixed(1)}" x2="${cx + 7}" y2="${Y(d.lo).toFixed(1)}" stroke="#2b3b4b"/>`;
      s += `<circle cx="${cx}" cy="${Y(d.mean).toFixed(1)}" r="3" fill="#2b3b4b"/>`;
      s += `<text x="${cx}" y="${(Y(d.hi) - 6).toFixed(1)}" text-anchor="middle" fill="#3b4b5b">${d.mean.toFixed(2)}</text>`;
      s += `<text x="${cx}" y="${m.top + ih + 14}" text-anchor="middle" fill="#4a5a6a">${esc(d.label)}</text>`;
    });
    s += `<line x1="${m.left}" y1="${m.top + ih}" x2="${m.left + iw}" y2="${m.top + ih}" stroke="#9aa9bb"/>`;
    s += `<line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + ih}" stroke="#9aa9bb"/>`;
    if (spec.yLabel) s += `<text x="14" y="${m.top + ih / 2}" text-anchor="middle" fill="#5b6b7c" transform="rotate(-90 14 ${m.top + ih / 2})">${esc(spec.yLabel)}</text>`;
    s += '</svg>';
    return s;
  }

  const RENDERERS = { bar, histogram, pie, scatter, box, line, qq, errorbar };

  function render(spec) {
    const fn = RENDERERS[spec && spec.type] || bar;
    try { return fn(spec || {}); }
    catch (e) { return svgOpen(520, 80) + `<text x="12" y="42" fill="#c0392b">图表渲染失败：${esc(e.message)}</text></svg>`; }
  }

  global.Charts = { render, PALETTE };
})(window);

import { escapeHtml as esc, formatMoney, formatDuration, modelStyle } from './utils.js';
import { icon } from './icons.js';

export function renderChart(host, legend, result, options, onTogglePin) {
  const { xKey, scale, onlyFront, showEnvelope, pinned } = options;
  const all = result.records.filter((r) => r.comparable);
  const records = onlyFront ? all.filter((r) => r.isPareto) : all;
  if (!records.length) {
    host.innerHTML = `<div class="empty-state">${icon('chart')}<strong>暂无可比较配置</strong>补齐任务效果、费用和完整耗时后，图表将在这里显示。</div>`;
    legend.innerHTML = '';
    return;
  }
  const w = Math.max(300, host.clientWidth || 660);
  const h = w < 450 ? 290 : w > 850 ? 390 : 330;
  const m = { left: 43, right: 22, top: 27, bottom: 45 };
  const pw = w - m.left - m.right, ph = h - m.top - m.bottom;
  const { benchmark: b, constraints: c } = result;
  const xMax = Math.max(...all.map((r) => r[xKey]), xKey === 'cost' ? 0.01 : 1) * 1.13;
  const yMin = Math.max(0, Math.floor((Math.min(...all.map((r) => r.quality)) - b.scoreMax * 0.08) / (b.scoreMax / 10)) * (b.scoreMax / 10));
  const yMax = b.scoreMax;
  const logUnit = xKey === 'cost' ? 0.01 : 1;
  const transform = (v) => scale === 'log' ? Math.log1p(v / logUnit) : v;
  const x = (value) => m.left + transform(value) / transform(xMax) * pw;
  const y = (value) => m.top + (yMax - value) / Math.max(yMax - yMin, 1) * ph;
  const xLabel = xKey === 'cost' ? `每任务平均费用（${b.currency}）` : '完整任务执行耗时（分钟）';
  const axisMoney = (v) => `${b.currency === 'CNY' ? '¥' : '$'}${v >= 1 ? Number(v.toFixed(1)) : Number(v.toFixed(3))}`;
  let xTicks;
  if (scale === 'log') {
    const candidates = xKey === 'cost' ? [0, .01, .03, .1, .3, 1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000, 300000, 1000000] : [0, 1, 10, 60, 300, 900, 3600, 14400, 86400, 604800, 31536000];
    xTicks = candidates.filter((v) => v <= xMax);
    const minGap = w < 450 ? 46 : 50;
    xTicks = xTicks.reduce((accepted, v) => {
      if (!accepted.length || x(v) - x(accepted.at(-1)) > minGap) accepted.push(v);
      return accepted;
    }, []);
  } else {
    const count = w < 450 ? 4 : 6;
    xTicks = Array.from({ length: count + 1 }, (_, i) => xMax * i / count);
  }
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (yMax - yMin) * i / 4);
  const limit = xKey === 'cost' ? c.maxCost : c.maxDuration;
  const effectiveLimit = limit === null ? xMax : Math.max(0, Math.min(limit, xMax));
  const qLimit = Math.max(yMin, Math.min(c.minQuality, yMax));
  let svg = `<svg class="scatter-chart" role="img" aria-label="${esc(xLabel)}与任务效果散点图；圆环表示三目标帕累托前沿" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;
  if (qLimit < yMax && effectiveLimit > 0) {
    svg += `<rect x="${m.left}" y="${m.top}" width="${Math.max(0, x(effectiveLimit) - m.left)}" height="${Math.max(0, y(qLimit) - m.top)}" fill="#f4faf7" rx="2"/>`;
  }
  for (const tick of yTicks) {
    svg += `<line x1="${m.left}" x2="${w - m.right}" y1="${y(tick)}" y2="${y(tick)}" stroke="#eeedf5" stroke-dasharray="3 5"/><text x="${m.left - 10}" y="${y(tick) + 3}" text-anchor="end" font-size="9" fill="#a4a3b2">${Number(tick.toFixed(1))}</text>`;
  }
  for (const tick of xTicks) {
    svg += `<line x1="${x(tick)}" x2="${x(tick)}" y1="${m.top}" y2="${h - m.bottom}" stroke="#eeedf5" stroke-dasharray="3 5"/><text x="${x(tick)}" y="${h - m.bottom + 18}" text-anchor="middle" font-size="9" fill="#a4a3b2">${xKey === 'cost' ? axisMoney(tick) : Number((tick / 60).toFixed(tick < 60 ? 2 : 1))}</text>`;
  }
  svg += `<text x="${m.left}" y="12" font-size="9" fill="#9e99ad">任务效果 / ${b.scoreMax} 分</text><text x="${m.left + pw / 2}" y="${h - 5}" text-anchor="middle" font-size="9" fill="#a09aaa">${xLabel}${scale === 'log' ? ' · 对数 log1p' : ''}</text>`;
  if (c.minQuality >= yMin && c.minQuality <= yMax && c.minQuality > 0) svg += `<line x1="${m.left}" x2="${w - m.right}" y1="${y(c.minQuality)}" y2="${y(c.minQuality)}" stroke="#b9d8cb" stroke-dasharray="4 4"/><text x="${w - m.right}" y="${y(c.minQuality) - 5}" text-anchor="end" font-size="8" fill="#9db5aa">最低效果 ${c.minQuality}</text>`;
  if (limit !== null && limit < xMax) svg += `<line x1="${x(limit)}" x2="${x(limit)}" y1="${m.top}" y2="${h - m.bottom}" stroke="#d7c6eb" stroke-dasharray="4 4"/><text x="${Math.min(w - m.right, Math.max(m.left + 32, x(limit) + 5))}" y="${m.top + 11}" font-size="8" fill="#b3a4c4">${xKey === 'cost' ? '预算上限' : '耗时上限'}</text>`;
  if (showEnvelope) {
    const envelope = all.filter((r) => !all.some((o) => o.quality >= r.quality && o[xKey] <= r[xKey] && (o.quality > r.quality || o[xKey] < r[xKey]))).sort((a, z) => a[xKey] - z[xKey]);
    if (envelope.length > 1) svg += `<path d="${envelope.map((r, i) => `${i ? 'L' : 'M'}${x(r[xKey])},${y(r.quality)}`).join(' ')}" stroke="#bcafd9" stroke-width="1.4" stroke-dasharray="4 5" fill="none"/>`;
  }
  const selected = new Set(result.recommendations.map((r) => r.recordId));
  const labelBoxes = [];
  const sorted = [...records].sort((a, z) => Number(a.feasible) - Number(z.feasible) || Number(pinned.has(a.id)) - Number(pinned.has(z.id)));
  for (const r of sorted) {
    const color = modelStyle(r.model).color;
    const px = x(r[xKey]), py = y(r.quality);
    const radius = 4.5 + Math.min(3, Math.sqrt(r.duration / 300));
    const pin = pinned.has(r.id);
    svg += `<g class="chart-point" tabindex="0" role="button" aria-pressed="${pin}" data-record-id="${esc(r.id)}" aria-label="${esc(`${r.model} ${r.reasoning}；效果 ${r.quality}；费用 ${formatMoney(r.cost, b.currency)}；耗时 ${formatDuration(r.duration)}；${r.isPareto ? '三目标前沿' : '被支配'}；${pin ? '从对比移除' : '加入对比'}`)}" opacity="${r.feasible ? 1 : .33}">`;
    if (pin) svg += `<circle cx="${px}" cy="${py}" r="${radius + 7}" fill="#7357e818" stroke="#7357e855" stroke-width="1"/>`;
    if (r.isPareto) svg += `<circle cx="${px}" cy="${py}" r="${radius + 3}" fill="none" stroke="${color}" stroke-width="1" stroke-opacity=".45"/>`;
    svg += `<circle class="point-core" cx="${px}" cy="${py}" r="${radius}" fill="${color}" stroke="#fff" stroke-width="1.8"/><circle cx="${px}" cy="${py}" r="${radius + 9}" fill="transparent"/></g>`;
    if (selected.has(r.id) || pin) {
      const text = `${r.model.includes('GPT-5.6 ') ? r.model.replace('GPT-5.6 ', '') : r.model.replace(' · 示例', '')} ${r.reasoning}`;
      const width = Math.min(150, text.length * 5.2);
      let lx = Math.min(w - m.right - width, Math.max(m.left, px + 10));
      let ly = py - radius - 8;
      if (ly < m.top + 7) ly = py + radius + 16;
      if (ly > h - m.bottom - 4) ly = py - radius - 8;
      const box = { x: lx, y: ly - 10, w: width, h: 14 };
      if (!labelBoxes.some((z) => box.x < z.x + z.w && box.x + box.w > z.x && box.y < z.y + z.h && box.y + box.h > z.y)) {
        labelBoxes.push(box);
        svg += `<text x="${lx}" y="${ly}" font-size="9" fill="${r.feasible ? '#827895' : '#b8b1c3'}" pointer-events="none">${esc(text)}</text>`;
      }
    }
  }
  svg += '</svg><div class="chart-tooltip" hidden></div>';
  host.innerHTML = svg;
  const tooltip = host.querySelector('.chart-tooltip');
  const showTooltip = (target, clientX, clientY) => {
    const r = records.find((row) => row.id === target.dataset.recordId);
    if (!r) return;
    tooltip.innerHTML = `<strong>${esc(r.model)} <span class="effort-chip">${esc(r.reasoning)}</span></strong><div class="tooltip-grid"><span>任务效果</span><b>${r.quality} / ${b.scoreMax}</b><span>每任务费用</span><b>${formatMoney(r.cost, b.currency)}</b><span>完整执行耗时</span><b>${formatDuration(r.duration)}</b><span>样本量</span><b>${r.sampleCount}</b></div><div class="tooltip-status">${r.isPareto ? '三目标帕累托前沿' : '存在三项均不差的配置'}${r.feasible ? ' · 满足条件' : ''}</div>${!r.feasible ? `<div>${esc(r.constraintReasons.join('；'))}</div>` : ''}`;
    tooltip.hidden = false;
    const bounds = host.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    const cx = clientX ?? box.left + box.width / 2;
    const cy = clientY ?? box.top;
    tooltip.style.left = `${Math.min(Math.max(0, cx - bounds.left + 13), Math.max(0, bounds.width - tooltip.offsetWidth))}px`;
    tooltip.style.top = `${Math.max(0, Math.min(bounds.height - tooltip.offsetHeight, cy - bounds.top - tooltip.offsetHeight - 10))}px`;
  };
  host.onpointermove = (event) => {
    const point = event.target.closest('.chart-point');
    if (point) showTooltip(point, event.clientX, event.clientY);
    else tooltip.hidden = true;
  };
  host.onpointerleave = () => { tooltip.hidden = true; };
  host.onfocusin = (event) => { if (event.target.matches('.chart-point')) showTooltip(event.target); };
  host.onfocusout = () => { tooltip.hidden = true; };
  host.onclick = (event) => { const point = event.target.closest('.chart-point'); if (point) onTogglePin(point.dataset.recordId); };
  host.onkeydown = (event) => {
    const point = event.target.closest('.chart-point');
    if (point && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onTogglePin(point.dataset.recordId); }
  };
  const families = [...new Map(all.map((r) => { const s = modelStyle(r.model); return [s.family, s]; })).values()];
  legend.innerHTML = families.map((s) => `<span class="legend-item"><i class="legend-dot" style="background:${s.color}"></i>${esc(s.family)}</span>`).join('') + '<span class="legend-item"><i class="legend-ring"></i>三目标前沿</span><span class="legend-item"><i class="legend-line"></i>二维投影包络</span><span class="legend-item">圆点越大，执行越久</span>';
}

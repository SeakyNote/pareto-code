import { icon } from './icons.js';
import { escapeHtml as esc, formatMoney, formatDuration, formatDate, modelStyle } from './utils.js';
import { renderChart } from './chart.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
$$('[data-icon]').forEach((node) => { node.innerHTML = icon(node.dataset.icon); });

const state = {
  catalog: null, result: null, benchmark: null, scenario: 'coding', channel: 'api', preference: 'balanced',
  view: 'workbench', pinned: new Set(), tableFilter: 'all', search: '', sort: 'cost', sortDirection: 1,
  xKey: 'cost', scale: 'linear', onlyFront: false, showEnvelope: true,
  controller: null, analyzedParams: null, dirty: true, previewPayload: null,
};
const titles = { workbench: '选型工作台', data: '评测数据', method: '方法与口径' };
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
}
async function api(url, options = {}) {
  const response = await fetch(url, options);
  const value = await response.json();
  if (!response.ok) { const error = new Error(value.error || '请求失败'); error.details = value.details || []; throw error; }
  return value;
}
function activate(selector, attribute, value) {
  $$(selector).forEach((node) => {
    const active = node.dataset[attribute] === value;
    node.classList.toggle('active', active);
    node.setAttribute('aria-pressed', active);
  });
}
function setView(view) {
  state.view = Object.hasOwn(titles, view) ? view : 'workbench';
  $$('.view').forEach((node) => { node.hidden = node.id !== `view-${state.view}`; });
  $$('.nav-item').forEach((node) => {
    const active = node.dataset.view === state.view;
    node.classList.toggle('active', active);
    if (active) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
  });
  $('#breadcrumb-current').textContent = titles[state.view];
  document.title = `${titles[state.view]} · Pareto Code`;
  closeMenu();
  if (state.view === 'workbench' && state.result) requestAnimationFrame(drawChart);
}
function closeMenu() {
  $('#sidebar').classList.remove('open');
  $('#sidebar-backdrop').hidden = true;
  $('#menu-toggle').setAttribute('aria-expanded', 'false');
}
function setDirty() {
  state.dirty = true;
  $('#analysis-status').textContent = '条件已修改，点击生成选型建议';
  $('#export-report').disabled = true;
}
function getBenchmark() { return state.catalog?.benchmarks.find((b) => b.id === state.benchmark); }
function pinKey() { return `pareto-pins:${state.benchmark}:${state.channel}`; }
function loadPins() {
  try {
    const saved = JSON.parse(localStorage.getItem(pinKey()) || '[]');
    state.pinned = new Set(Array.isArray(saved) ? saved.filter((v) => typeof v === 'string').slice(0, 5) : []);
  } catch { state.pinned = new Set(); }
}
function savePins() { try { localStorage.setItem(pinKey(), JSON.stringify([...state.pinned])); } catch { /* 隐私模式下仍可使用会话对比。 */ } }

function renderControls() {
  const b = getBenchmark();
  $('#scenario-options').innerHTML = state.catalog.scenarios.map((s) => {
    const available = state.catalog.benchmarks.some((benchmark) => benchmark.scenario === s.id);
    return `<button type="button" class="scenario-option ${s.id === state.scenario ? 'active' : ''}" data-scenario="${s.id}" aria-pressed="${s.id === state.scenario}" ${available ? '' : 'disabled'} title="${esc(available ? s.description : '暂无该场景评测，可导入对应场景的数据')}">${icon(s.icon)}${esc(s.name)}</button>`;
  }).join('');
  $('#benchmark-select').innerHTML = state.catalog.benchmarks.filter((snapshot) => snapshot.scenario === state.scenario).map((snapshot) => `<option value="${esc(snapshot.id)}" ${snapshot.id === state.benchmark ? 'selected' : ''}>${esc(snapshot.name)}</option>`).join('');
  activate('[data-channel]', 'channel', state.channel);
  $$('[data-channel]').forEach((button) => { button.disabled = !b?.channels.includes(button.dataset.channel); });
  activate('[data-preference]', 'preference', state.preference);
  const subscription = state.channel === 'subscription';
  $('#subscription-fields').hidden = !subscription;
  $('#monthly-price').disabled = !subscription;
  $('#monthly-tasks').disabled = !subscription;
  $('#channel-help').textContent = subscription ? '按用户输入的月费与有效任务量等额均摊' : '按每任务平均 API 费用比较';
  if (b) {
    $$('.currency-symbol').forEach((node) => { node.textContent = b.currency === 'CNY' ? '¥' : '$'; });
    $('#score-max-unit').textContent = `/ ${b.scoreMax} 分`;
    $('#min-quality').max = b.scoreMax;
    if (Number($('#min-quality').value) > b.scoreMax) $('#min-quality').value = b.scoreMax;
  }
}

function queryFromForm() {
  const params = new URLSearchParams({ benchmark: state.benchmark, channel: state.channel, preference: state.preference });
  if ($('#max-cost').value !== '') params.set('maxCost', $('#max-cost').value);
  if ($('#max-duration').value !== '') params.set('maxDuration', String(Number($('#max-duration').value) * 60));
  params.set('minQuality', $('#min-quality').value || '0');
  if (state.channel === 'subscription') {
    params.set('monthlyPrice', $('#monthly-price').value);
    params.set('monthlyTasks', $('#monthly-tasks').value);
  }
  return params;
}

async function runAnalysis() {
  if (!state.catalog || !$('#constraints-form').reportValidity()) return;
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  const params = queryFromForm();
  $('#analysis-status').textContent = '正在分析效果、费用与耗时…';
  $('#analyze-button').disabled = true;
  $('#export-report').disabled = true;
  $('#load-error').hidden = true;
  try {
    const result = await api(`/api/analyze?${params}`, { signal: controller.signal });
    if (controller !== state.controller) return;
    state.result = result;
    state.analyzedParams = params;
    state.dirty = false;
    state.pinned = new Set([...state.pinned].filter((id) => result.records.some((r) => r.id === id && r.comparable)));
    savePins();
    history.replaceState(null, '', `${location.pathname}?${params}#${state.view}`);
    renderResult();
    $('#export-report').disabled = false;
  } catch (error) {
    if (error.name !== 'AbortError') {
      $('#load-error').textContent = `${error.message} 请检查筛选条件后重试。`;
      $('#load-error').hidden = false;
      $('#analysis-status').textContent = '分析未完成';
    }
  } finally {
    if (controller === state.controller) $('#analyze-button').disabled = false;
  }
}

function renderResult() {
  const r = state.result, b = r.benchmark, s = r.stats;
  const demo = b.source.type === 'demo';
  const freshness = r.freshness.stale ? ` · 快照已 ${r.freshness.ageDays} 天，建议复测` : '';
  $('#snapshot-time').textContent = `快照 ${formatDate(b.evaluatedAt)}`;
  $('#data-notice').classList.toggle('neutral', !demo);
  $('#data-notice').innerHTML = `${icon('info')}<span>${demo ? '<strong>演示数据 · 非实测。</strong> 所有数值均为人工构造，仅供体验选型流程。' : `当前来源：${esc(b.source.name)}。结果仅适用于本次测试集与评测口径。`}${esc(freshness)}</span><a href="#data">查看数据来源 ${icon('arrow')}</a>`;
  $('#analysis-status').textContent = `${s.feasible} 个配置满足条件 · ${s.feasiblePareto} 个可选前沿配置`;
  const stats = [
    ['layers', '可比较配置', s.comparable, '个', `${s.excluded} 个待补齐指标，未参与计算`],
    ['chart', '三目标帕累托前沿', s.pareto, '个', '效果、费用、耗时均纳入计算'],
    ['check', '满足你的条件', s.feasible, '个', `其中 ${s.feasiblePareto} 个处于可选前沿`],
    ['coin', '最低可用费用', formatMoney(s.minFeasibleCost, b.currency), '/ 任务', state.channel === 'subscription' ? '基于当前订阅均摊假设' : '在满足全部约束的配置中'],
  ];
  $('#stats').innerHTML = stats.map(([name, label, value, unit, detail]) => `<article class="card stat-card"><div class="stat-label">${icon(name)}${label}</div><div class="stat-value">${value}<small>${unit}</small></div><div class="stat-detail">${detail}</div></article>`).join('');
  $('#table-source').textContent = `${b.source.type === 'demo' ? '演示快照' : b.source.name} · ${formatDate(b.evaluatedAt)} · ${b.currency} / 任务`;
  renderRecommendations();
  renderTable();
  renderComparison();
  drawChart();
}

function renderRecommendations() {
  const r = state.result;
  if (!r.recommendations.length) {
    $('#recommendations').innerHTML = `<div class="empty-state empty-recommendations">${icon('target')}<strong>暂无配置同时满足条件</strong><p>可以调整预算、耗时或最低效果。系统保留了你的全部约束。</p>${r.nearest.map((row) => `<div class="nearest-record"><strong>${esc(row.model)} · ${esc(row.reasoning)}</strong><small>${esc(row.constraintReasons.join('；'))}</small></div>`).join('')}</div>`;
    return;
  }
  const hints = {
    economy: '满足条件下，费用最低',
    balanced: { balanced: '效果与两种成本综合权衡', quality: '更看重任务产出效果', cost: '更看重资金成本', speed: '更看重任务完成速度' }[state.preference],
    quality: '满足条件下，效果最高',
  };
  $('#recommendations').innerHTML = r.recommendations.map((rec) => {
    const row = rec.record;
    return `<article class="recommendation-card ${rec.kind}"><div class="rec-label">${icon({ economy: 'coin', balanced: 'spark', quality: 'target' }[rec.kind])}${rec.title}${rec.kind === 'balanced' ? '<span class="rec-tag">按你的偏好</span>' : ''}</div><div class="rec-model"><strong>${esc(row.model)}</strong><span class="effort-chip">${esc(row.reasoning)}</span></div><div class="rec-metrics"><span>${icon('target')}${row.quality} 分</span><span>${icon('coin')}${formatMoney(row.cost, r.benchmark.currency)}</span><span>${icon('clock')}${formatDuration(row.duration)}</span></div><div class="rec-bottom"><p>${hints[rec.kind]}</p><button data-detail="${esc(row.id)}" title="${esc(rec.reason)}">查看依据 ${icon('arrow')}</button></div></article>`;
  }).join('');
}

function statusHtml(r) {
  if (!r.comparable) return `<span class="status-badge excluded">待补齐指标</span><div class="row-reason">${esc(r.exclusionReasons.join('；'))}</div>`;
  const badge = r.isPareto ? '<span class="status-badge pareto">◉ 帕累托前沿</span>' : r.feasible ? '<span class="status-badge feasible">满足条件</span>' : '<span class="status-badge">存在更优配置</span>';
  return badge + (r.constraintReasons.length ? `<div class="row-reason">${esc(r.constraintReasons.join('；'))}</div>` : '');
}
function renderTable() {
  if (!state.result) return;
  let rows = state.result.records.filter((r) =>
    (state.tableFilter === 'all' || state.tableFilter === 'pareto' && r.isPareto || state.tableFilter === 'feasible' && r.feasible || state.tableFilter === 'excluded' && !r.comparable) &&
    (!state.search || `${r.model} ${r.reasoning} ${r.agent} ${r.provider} ${r.version}`.toLocaleLowerCase().includes(state.search)));
  rows = [...rows].sort((a, b) => {
    if (a[state.sort] === null) return b[state.sort] === null ? 0 : 1;
    if (b[state.sort] === null) return -1;
    return (a[state.sort] - b[state.sort]) * state.sortDirection || a.id.localeCompare(b.id);
  });
  $('#total-count').textContent = state.result.stats.total;
  $('#table-summary').textContent = `显示 ${rows.length} / ${state.result.stats.total} 个配置`;
  activate('[data-table-filter]', 'tableFilter', state.tableFilter);
  $$('[data-sort]').forEach((button) => {
    button.classList.toggle('sorted', button.dataset.sort === state.sort);
    const th = button.closest('th');
    th.setAttribute('aria-sort', button.dataset.sort === state.sort ? state.sortDirection > 0 ? 'ascending' : 'descending' : 'none');
  });
  $('#config-table').innerHTML = rows.length ? rows.map((r) => {
    const style = modelStyle(r.model), pinned = state.pinned.has(r.id);
    return `<tr class="${pinned ? 'row-selected' : ''}" data-row-id="${esc(r.id)}"><td><div class="model-cell"><span class="provider-avatar" style="background:${style.background};color:${style.color}">${esc(style.short)}</span><div><div class="model-name">${esc(r.model)}</div><div class="model-sub"><span class="effort-chip">${esc(r.reasoning)}</span>${esc(r.version)}</div></div></div></td><td class="agent-cell">${esc(r.agent)}<small>${esc(r.provider)}</small></td><td><span class="score-value">${r.quality ?? '—'}</span>${r.quality !== null ? `<div class="score-bar"><span style="width:${Math.max(0, Math.min(100, r.quality / state.result.benchmark.scoreMax * 100))}%"></span></div>` : ''}</td><td><span class="cost-value">${formatMoney(r.cost, state.result.benchmark.currency)}</span>${r.channel === 'subscription' && r.comparable ? '<small class="cost-sub">订阅均摊</small>' : ''}</td><td>${formatDuration(r.duration)}</td><td>${statusHtml(r)}</td><td><div class="table-actions"><button class="text-button" data-detail="${esc(r.id)}">详情</button><button class="pin-button ${pinned ? 'active' : ''}" data-pin="${esc(r.id)}" aria-label="${esc(`${pinned ? '从对比移除' : '加入对比'} ${r.model} ${r.reasoning}`)}" aria-pressed="${pinned}" ${r.comparable ? '' : 'disabled'}>${icon(pinned ? 'check' : 'compare')}</button></div></td></tr>`;
  }).join('') : '<tr><td colspan="7"><div class="empty-state">当前筛选下没有配置。试试清空搜索或切换数据范围。</div></td></tr>';
}

function togglePin(id) {
  const row = state.result?.records.find((r) => r.id === id);
  if (!row?.comparable) return;
  if (state.pinned.has(id)) state.pinned.delete(id);
  else if (state.pinned.size >= 5) return toast('最多对比 5 个配置，请先移除一个。');
  else state.pinned.add(id);
  savePins(); renderTable(); renderComparison(); drawChart();
}
function renderComparison() {
  const rows = [...state.pinned].map((id) => state.result.records.find((r) => r.id === id)).filter(Boolean);
  $('#comparison-panel').hidden = !rows.length;
  $('#compare-count').textContent = `(${rows.length} / 5)`;
  $('#comparison-content').innerHTML = `<div class="comparison-grid">${rows.map((r) => `<article class="compare-card"><button class="icon-button" data-pin="${esc(r.id)}" aria-label="${esc(`移除 ${r.model} ${r.reasoning}`)}">${icon('close')}</button><h3>${esc(r.model)}</h3><p>${esc(r.agent)} · ${esc(r.reasoning)}</p><div class="compare-metrics"><span>任务效果</span><b>${r.quality} 分</b><span>每任务费用</span><b>${formatMoney(r.cost, state.result.benchmark.currency)}</b><span>完整执行耗时</span><b>${formatDuration(r.duration)}</b><span>有效样本</span><b>${r.sampleCount}</b></div><button class="text-button" data-detail="${esc(r.id)}">查看来源与依据 ${icon('arrow')}</button></article>`).join('')}</div>`;
}
function drawChart() {
  if (!state.result || state.view !== 'workbench') return;
  renderChart($('#chart-host'), $('#chart-legend'), state.result, state, togglePin);
}

function showDetail(id) {
  const r = state.result?.records.find((row) => row.id === id);
  if (!r) return;
  const b = state.result.benchmark, style = modelStyle(r.model);
  const entries = [
    ['模型版本', r.version], ['Agent / 供应商', `${r.agent} / ${r.provider}`], ['推理强度', r.reasoning], ['使用渠道', r.channel === 'api' ? '正价 API' : 'GPT 会员订阅折算'],
    ['任务效果', `${r.quality ?? '缺失'} / ${b.scoreMax} 分`], ['每任务费用', formatMoney(r.cost, b.currency)], ['完整执行耗时', formatDuration(r.duration)], ['有效样本', r.sampleCount ?? '缺失'],
    ['评测快照', b.name], ['测试集', b.taskSet], ['评分规则', b.scoring], ['统计口径', `${b.aggregation} / ${b.durationBasis} / ${b.costBasis}`],
    ['评测时间', `${formatDate(b.evaluatedAt, true)}（上海时间）`], ['数据来源', `${b.source.name}${b.source.type === 'demo' ? '（演示 · 非实测）' : ''}`],
    ['费用口径', r.costExplanation || '必要指标不完整，暂不计算'], ['记录备注', r.notes || '无'],
  ];
  let assessment;
  if (!r.comparable) assessment = `暂不纳入比较：${r.exclusionReasons.join('；')}。`;
  else if (r.isPareto) assessment = '该配置位于三目标帕累托前沿。在同一快照、同一渠道内，没有其他配置能在效果不低、费用不高、耗时不长的同时至少有一项严格更好。';
  else {
    const dominators = r.dominatedBy.map((rid) => state.result.records.find((row) => row.id === rid)).filter(Boolean);
    assessment = `该配置被以下配置支配（最多列出 5 个）：${dominators.map((row) => `${row.model} ${row.reasoning}（${row.quality} 分 / ${formatMoney(row.cost, b.currency)} / ${formatDuration(row.duration)}）`).join('；')}。`;
  }
  $('#detail-content').innerHTML = `<div class="detail-model"><span class="provider-avatar" style="background:${style.background};color:${style.color}">${esc(style.short)}</span><div><h3>${esc(r.model)}</h3><p>${esc(r.reasoning)} · ${esc(r.agent)} · ${esc(r.version)}</p></div></div>${statusHtml(r)}<dl class="metadata-grid">${entries.map(([key, value]) => `<dt>${key}</dt><dd>${esc(value)}</dd>`).join('')}${b.source.url ? `<dt>来源链接</dt><dd><a href="${esc(b.source.url)}" target="_blank" rel="noopener noreferrer">查看原始来源 ${icon('link')}</a></dd>` : ''}</dl><div class="detail-rule"><p>${esc(assessment)}</p>${state.result.recommendations.filter((rec) => rec.recordId === id).map((rec) => `<p><strong>${rec.title}：</strong>${esc(rec.reason)}</p>`).join('')}${r.comparable && !r.feasible ? `<p>当前未满足：${esc(r.constraintReasons.join('；'))}。</p>` : ''}</div>`;
  $('#detail-dialog').showModal();
}

function renderDatasets() {
  $('#dataset-list').innerHTML = state.catalog.benchmarks.map((b) => {
    const scenario = state.catalog.scenarios.find((s) => s.id === b.scenario);
    const entries = [['数据来源', b.source.name], ['评测时间', `${formatDate(b.evaluatedAt, true)}（上海时间）`], ['测试集', b.taskSet], ['评分规则', b.scoring], ['统计口径', `${b.aggregation} / ${b.durationBasis} / ${b.costBasis}`], ['样本配置', `${b.recordCount} 条记录 · ${b.comparableCount} 条指标完整 · ${b.currency}`], ['快照 ID', b.id]];
    return `<article class="card dataset-card"><div class="dataset-card-header"><span class="small-badge">${icon(scenario.icon)} ${esc(scenario.name)}</span><span class="status-badge ${b.source.type === 'demo' ? 'excluded' : 'feasible'}">${{ demo: '演示 · 非实测', internal: '自建评测', 'third-party': '第三方评测' }[b.source.type]}</span></div><h2>${esc(b.name)}</h2><p class="dataset-notes">${esc(b.notes || '独立评测快照，请在当前任务与评分范围内解读结果。')}</p><dl class="metadata-grid">${entries.map(([key, value]) => `<dt>${key}</dt><dd>${esc(value)}</dd>`).join('')}${b.source.url ? `<dt>来源链接</dt><dd><a href="${esc(b.source.url)}" target="_blank" rel="noopener noreferrer">原始评测 ${icon('link')}</a></dd>` : ''}</dl><div class="dataset-actions"><a class="text-button" href="/api/datasets/${encodeURIComponent(b.id)}" download>${icon('download')}导出原始 JSON</a><button class="button button-primary" data-select-dataset="${esc(b.id)}">使用此快照 ${icon('arrow')}</button></div></article>`;
  }).join('');
  $('#import-history').innerHTML = state.catalog.history.map((h) => `<div class="history-row"><span>${esc(h.name)}</span><span>${h.benchmarkCount} 个快照 · ${h.recordCount} 条记录</span><small>${formatDate(h.createdAt, true)}</small></div>`).join('') || '<p class="empty-state">暂无导入记录</p>';
}

function resetImportPreview() { state.previewPayload = null; $('#commit-import').disabled = true; $('#import-feedback').innerHTML = ''; $('#import-feedback').classList.remove('success'); }
function importPayload() { return { text: $('#import-text').value, format: $('#import-format').value, fileName: $('#import-file').files[0]?.name || '粘贴数据导入' }; }
function showImportError(error) {
  $('#import-feedback').classList.remove('success');
  $('#import-feedback').innerHTML = `<strong>${esc(error.message)}</strong>${error.details?.length ? `<ul>${error.details.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>` : ''}`;
}
async function readImportFile(file) {
  resetImportPreview();
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) return showImportError(new Error('文件超过 2 MiB，请分批导入。'));
  const extension = file.name.split('.').pop().toLowerCase();
  if (!['json', 'csv'].includes(extension)) return showImportError(new Error('仅支持 .json 与 .csv 文件。'));
  try {
    $('#import-format').value = extension;
    $('#import-text').value = await file.text();
    $('#file-label').textContent = file.name;
  } catch { showImportError(new Error('无法读取文件，请重新选择。')); }
}
async function previewImport() {
  resetImportPreview();
  $('#preview-import').disabled = true;
  $('#import-feedback').textContent = '正在检查字段、快照与比较口径…';
  const body = importPayload();
  try {
    const result = await api('/api/import/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (body.text !== $('#import-text').value || body.format !== $('#import-format').value) return resetImportPreview();
    state.previewPayload = JSON.stringify(body);
    $('#commit-import').disabled = false;
    $('#import-feedback').classList.add('success');
    $('#import-feedback').innerHTML = `<strong>${icon('check')} 校验通过，尚未写入</strong>${result.datasets.map((d) => `<p>${esc(d.name)}：${d.recordCount} 条配置，${d.comparableCount} 条可比较${d.source.type === 'demo' ? ' · 演示数据' : ''}。</p>${d.excluded.length ? `<ul>${d.excluded.slice(0, 8).map((r) => `<li>${esc(r.model)}：${esc(r.reasons.join('；'))}</li>`).join('')}${d.excluded.length > 8 ? `<li>另有 ${d.excluded.length - 8} 条待补齐记录</li>` : ''}</ul>` : ''}`).join('')}`;
  } catch (error) { showImportError(error); }
  finally { $('#preview-import').disabled = false; }
}
async function commitImport() {
  if (!state.previewPayload) return;
  const body = importPayload();
  if (JSON.stringify(body) !== state.previewPayload) return resetImportPreview();
  $('#commit-import').disabled = true;
  $('#preview-import').disabled = true;
  try {
    const result = await api('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: state.previewPayload });
    $('#import-dialog').close();
    state.previewPayload = null;
    state.catalog = await api('/api/catalog');
    renderDatasets();
    await selectDataset(result.imported[0]);
    toast(`已导入 ${result.imported.length} 个快照，数据已保存。`);
  } catch (error) { showImportError(error); }
  finally { $('#preview-import').disabled = false; }
}

async function selectDataset(id) {
  const b = state.catalog.benchmarks.find((snapshot) => snapshot.id === id);
  if (!b) return;
  state.benchmark = b.id; state.scenario = b.scenario; state.tableFilter = 'all'; state.search = '';
  if (!b.channels.includes(state.channel)) state.channel = b.channels[0] || 'api';
  $('#table-search').value = '';
  renderControls(); loadPins(); setDirty();
  location.hash = 'workbench'; setView('workbench');
  await runAnalysis();
}

$('#constraints-form').addEventListener('submit', (event) => { event.preventDefault(); runAnalysis(); });
$('#constraints-form').addEventListener('input', (event) => { if (event.target.matches('input')) setDirty(); });
$('#benchmark-select').addEventListener('change', (event) => selectDataset(event.target.value));
$('#reset-filters').addEventListener('click', () => {
  $('#max-cost').value = '2'; $('#max-duration').value = '30'; $('#min-quality').value = Math.min(80, getBenchmark().scoreMax);
  $('#monthly-price').value = '20'; $('#monthly-tasks').value = '400'; state.preference = 'balanced';
  renderControls(); runAnalysis();
});
$('#table-search').addEventListener('input', (event) => { state.search = event.target.value.trim().toLocaleLowerCase(); renderTable(); });
$('#chart-x').addEventListener('change', (event) => { state.xKey = event.target.value; drawChart(); });
$('#only-front').addEventListener('change', (event) => { state.onlyFront = event.target.checked; drawChart(); });
$('#show-envelope').addEventListener('change', (event) => { state.showEnvelope = event.target.checked; drawChart(); });
$('#clear-comparison').addEventListener('click', () => { state.pinned.clear(); savePins(); renderComparison(); renderTable(); drawChart(); });
$('#export-report').addEventListener('click', () => {
  if (state.dirty || !state.analyzedParams) return toast('请先生成当前条件下的分析结果。');
  const link = document.createElement('a'); link.href = `/api/report?${state.analyzedParams}`; link.download = `pareto-report-${state.benchmark}.md`; link.click();
});
$('#menu-toggle').addEventListener('click', () => {
  const open = !$('#sidebar').classList.contains('open'); $('#sidebar').classList.toggle('open', open); $('#sidebar-backdrop').hidden = !open; $('#menu-toggle').setAttribute('aria-expanded', open);
});
$('#sidebar-backdrop').addEventListener('click', closeMenu);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
window.addEventListener('hashchange', () => setView(location.hash.slice(1)));
document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.action === 'import') { resetImportPreview(); $('#import-dialog').showModal(); }
  if (button.dataset.close) $(`#${button.dataset.close}`).close();
  if (button.dataset.detail) showDetail(button.dataset.detail);
  if (button.dataset.pin) togglePin(button.dataset.pin);
  if (button.dataset.selectDataset) selectDataset(button.dataset.selectDataset);
  if (button.dataset.scenario) {
    const b = state.catalog.benchmarks.find((snapshot) => snapshot.scenario === button.dataset.scenario);
    if (b) selectDataset(b.id);
  }
  if (button.dataset.channel && button.dataset.channel !== state.channel) { state.channel = button.dataset.channel; renderControls(); loadPins(); setDirty(); runAnalysis(); }
  if (button.dataset.preference) { state.preference = button.dataset.preference; renderControls(); setDirty(); runAnalysis(); }
  if (button.dataset.tableFilter) { state.tableFilter = button.dataset.tableFilter; renderTable(); }
  if (button.dataset.scale) { state.scale = button.dataset.scale; activate('[data-scale]', 'scale', state.scale); drawChart(); }
  if (button.dataset.sort) { state.sortDirection = state.sort === button.dataset.sort ? -state.sortDirection : button.dataset.sort === 'quality' ? -1 : 1; state.sort = button.dataset.sort; renderTable(); }
});
$$('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
}));
$('#import-file').addEventListener('change', (event) => readImportFile(event.target.files[0]));
$('#import-text').addEventListener('input', resetImportPreview);
$('#import-format').addEventListener('change', resetImportPreview);
$('#preview-import').addEventListener('click', previewImport);
$('#commit-import').addEventListener('click', commitImport);
$('#file-drop').addEventListener('dragover', (event) => { event.preventDefault(); $('#file-drop').classList.add('drag-over'); });
$('#file-drop').addEventListener('dragleave', () => $('#file-drop').classList.remove('drag-over'));
$('#file-drop').addEventListener('drop', (event) => {
  event.preventDefault(); $('#file-drop').classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (file) { $('#import-file').files = event.dataTransfer.files; readImportFile(file); }
});
let resizeFrame;
new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(drawChart); }).observe($('#chart-host'));

async function init() {
  $('#export-report').disabled = true;
  setView(location.hash.slice(1));
  try {
    state.catalog = await api('/api/catalog');
    const params = new URLSearchParams(location.search);
    const benchmark = state.catalog.benchmarks.find((b) => b.id === params.get('benchmark')) || state.catalog.benchmarks[0];
    state.benchmark = benchmark.id; state.scenario = benchmark.scenario;
    if (['api', 'subscription'].includes(params.get('channel'))) state.channel = params.get('channel');
    if (!benchmark.channels.includes(state.channel)) state.channel = benchmark.channels[0] || 'api';
    if (['balanced', 'quality', 'cost', 'speed'].includes(params.get('preference'))) state.preference = params.get('preference');
    // 带快照参数的 URL 完整恢复约束；未提供上限表示不限。
    if (params.has('benchmark')) {
      $('#max-cost').value = params.get('maxCost') ?? '';
      $('#max-duration').value = params.has('maxDuration') ? Number(params.get('maxDuration')) / 60 : '';
      $('#min-quality').value = params.get('minQuality') || '0';
    }
    if (params.has('monthlyPrice')) $('#monthly-price').value = params.get('monthlyPrice');
    if (params.has('monthlyTasks')) $('#monthly-tasks').value = params.get('monthlyTasks');
    renderControls(); renderDatasets(); loadPins();
    await runAnalysis();
  } catch (error) {
    $('#load-error').textContent = `无法加载评测数据：${error.message}。请确认服务正常后刷新页面。`;
    $('#load-error').hidden = false;
    $('#snapshot-time').textContent = '数据连接失败';
    $('#analysis-status').textContent = '加载失败';
  }
}
init();

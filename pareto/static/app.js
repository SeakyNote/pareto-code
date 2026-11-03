"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const fmt = (value, digits = 1) => value == null ? "—" : Number(value).toLocaleString("zh-CN", { maximumFractionDigits: digits });
const money = (value) => value == null ? "—" : `¥${fmt(value, value > 0 && value < 0.01 ? 6 : value < 0.1 ? 4 : 3)}`;
const date = (value) => new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const state = { kind: "demo", channel: "api", groupId: null, catalog: null, raw: [], analysis: null, benchmark: null, axis: "cost_cny", sort: { key: "quality", desc: true }, baselineId: "demo-gpt-legacy", importRecords: null, score: null, sequence: 0, importVersion: 0, scoreVersion: 0, toastTimer: null, ready: false };
const VIEW_NAMES = { select: "智能选型", data: "评测数据", benchmark: "评测工作台", method: "方法与口径" };

async function api(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error("服务未返回有效数据，请检查本地服务是否运行。"); }
  if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
  return data;
}

function toast(message) {
  clearTimeout(state.toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.remove("hidden");
  state.toastTimer = setTimeout(() => $("#toast").classList.add("hidden"), 4200);
}

function showError(error) {
  $("#global-error").innerHTML = `${escapeHTML(error.message || error)} <button id="retry-load">重试连接</button>`;
  $("#global-error").classList.remove("hidden");
}

function inlineError(selector, error) {
  const target = $(selector);
  target.textContent = error ? error.message || String(error) : "";
  target.classList.toggle("hidden", !error);
}

function setSidebarOpen(open) {
  $("#sidebar").classList.toggle("open", open);
  $("#menu-toggle").setAttribute("aria-expanded", String(open));
  $("#sidebar").inert = matchMedia("(max-width: 800px)").matches && !open;
}

function route() {
  let view = location.hash.slice(1);
  if (!(view in VIEW_NAMES)) view = "select";
  $$(".view").forEach((el) => el.classList.toggle("hidden", el.id !== `view-${view}`));
  $$(".nav-link").forEach((link) => {
    const active = link.dataset.view === view;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  $("#breadcrumb-current").textContent = VIEW_NAMES[view];
  document.title = `${VIEW_NAMES[view]} · Pareto Code`;
  setSidebarOpen(false);
  if (view === "select" && state.analysis) requestAnimationFrame(renderChart);
}

function renderGroups() {
  if (!state.catalog) return;
  const groups = state.catalog.groups.filter((g) => g.dataset_kind === state.kind && g.channel === state.channel).sort((a, b) => b.count - a.count || a.suite.localeCompare(b.suite));
  if (!groups.some((g) => g.id === state.groupId)) state.groupId = groups[0]?.id || null;
  $("#group-select").innerHTML = groups.length ? groups.map((g) => `<option value="${escapeHTML(g.id)}">${escapeHTML(g.suite)} · ${g.count} 条</option>`).join("") : '<option value="">暂无可比数据组</option>';
  $("#group-select").value = state.groupId || "";
  $("#group-select").disabled = !groups.length;
  $("#dataset-select").innerHTML = `<option value="demo">演示数据 (${state.catalog.counts.demo})</option><option value="measured">真实评测 (${state.catalog.counts.measured})</option>`;
  $("#dataset-select").value = state.kind;
  const isDemo = state.kind === "demo";
  $("#dataset-banner").classList.toggle("real", !isDemo);
  $("#dataset-banner").innerHTML = isDemo
    ? `${icon("info")}<span>正在使用合成演示数据，所有指标与档位均为示例，不代表真实评测或当前报价。</span><a href="#data">导入真实数据 <span>↗</span></a>`
    : `${icon("check")}<span>正在使用导入的真实评测。请核查来源、版本与样本量，推荐仅适用于当前比较组。</span><a href="#benchmark">补充自建评测 <span>↗</span></a>`;
  $("#channel-note").textContent = state.channel === "api" ? "平均单任务账单费用，单位为人民币。" : "月费 ÷ 预计月任务量；摊销不代表额度或边际费用。";
}

async function refreshData() {
  const [catalog, records] = await Promise.all([api("/api/catalog"), api("/api/records")]);
  state.catalog = catalog;
  state.raw = records.records;
  renderGroups();
  renderData();
}

function readConstraints() {
  const optional = (selector) => $(selector).value.trim() === "" ? null : Number($(selector).value);
  return { dataset_kind: state.kind, channel: state.channel, group_id: state.groupId, budget_cny: optional("#budget"), max_latency_seconds: optional("#max-time"), min_quality: Number($("#min-quality").value), monthly_tasks: Number($("#monthly-tasks").value), baseline_id: state.baselineId };
}

async function runAnalysis() {
  if (!state.ready || !$("#constraints-form").reportValidity()) return;
  const sequence = ++state.sequence;
  $("#selection-workspace").classList.add("loading");
  $("#selection-workspace").setAttribute("aria-busy", "true");
  try {
    const result = await api("/api/analyze", readConstraints());
    if (sequence !== state.sequence) return;
    state.analysis = result;
    state.baselineId = result.baseline_id;
    $("#global-error").classList.add("hidden");
    renderAnalysis();
  } catch (error) {
    if (sequence !== state.sequence) return;
    state.analysis = null;
    $("#summary").innerHTML = "";
    $("#recommendations").innerHTML = '<div class="no-recommendations"><h3>本次计算未完成</h3><p>恢复连接后重试，避免使用过期的选型结果。</p></div>';
    $("#comparison-body").innerHTML = '<tr><td class="empty-cell" colspan="7">暂无本次计算结果</td></tr>';
    $("#scatter").innerHTML = "";
    showError(error);
  } finally {
    if (sequence === state.sequence) {
      $("#selection-workspace").classList.remove("loading");
      $("#selection-workspace").setAttribute("aria-busy", "false");
    }
  }
}

function renderAnalysis() {
  const a = state.analysis;
  const best = a.records.filter((r) => r.feasible).reduce((value, r) => Math.max(value, r.quality), -1);
  const savings = a.savings;
  const scope = state.kind === "demo" ? "演示" : "当前";
  $("#summary").innerHTML = `
    <article class="stat-card"><div class="stat-label">${icon("grid")}可比配置</div><div class="stat-number">${a.summary.comparable}<small>个</small></div><div class="stat-caption">${a.summary.feasible} 个满足全部约束 · ${a.summary.excluded} 条已排除</div></article>
    <article class="stat-card"><div class="stat-label">${icon("chart")}帕累托前沿</div><div class="stat-number">${a.summary.frontier}<small>个</small></div><div class="stat-caption">其中 ${a.feasible_frontier_ids.length} 个满足本次需求</div></article>
    <article class="stat-card"><div class="stat-label">${icon("spark")}可行方案最高效果</div><div class="stat-number">${best < 0 ? "—" : fmt(best)}<small>/ 100</small></div><div class="stat-caption">仅适用于当前代码审查任务集</div></article>
    <article class="stat-card emphasis"><div class="stat-label">${icon("wallet")}同质量月度节省估算</div><div class="stat-number">${savings ? money(savings.monthly_cny) : "—"}</div><div class="stat-caption">${savings ? `${scope}基准 · 效果 ≥ ${fmt(savings.quality_floor)} 分 · 省 ${fmt(savings.percent)}%` : "无满足约束且不低于基准质量的方案"}</div><div class="stat-trend" aria-hidden="true">↗</div></article>`;
  const group = a.group;
  const latest = group ? date(group.latest_at) : "—";
  $("#chart-snapshot").textContent = group ? `${group.suite} · ${state.kind === "demo" ? "合成快照" : "最新快照"} ${latest}` : "导入评测数据后开始比较";
  $("#recommendation-meta").textContent = a.summary.feasible ? `${a.summary.feasible} 个达标配置 · 规则推荐` : "不自动放宽任何约束";
  renderChart();
  renderRecommendations();
  renderTable();
  $("#excluded-count").textContent = `${a.excluded.length} 条记录未纳入本次比较`;
  $("#excluded-list").innerHTML = a.excluded.map(({ record, reasons }) => `<div class="excluded-row"><button class="text-button" data-detail="${escapeHTML(record.id)}">${escapeHTML(record.model)} · ${escapeHTML(record.provider)}</button><span>${escapeHTML(reasons.join("；"))}</span></div>`).join("") || '<div class="excluded-row">当前没有被排除的记录。</div>';
}

function renderChart() {
  const a = state.analysis;
  if (!a) return;
  const data = a.records;
  const xKey = state.axis;
  const width = Math.max(300, $("#scatter-wrap").clientWidth || 820);
  const height = Math.max(270, Math.min(365, width * .42));
  const left = width < 500 ? 39 : 54, right = 24, top = 27, bottom = 43;
  $("#scatter").setAttribute("viewBox", `0 0 ${width} ${height}`);
  const plotW = width - left - right, plotH = height - top - bottom;
  const xLimit = xKey === "cost_cny" ? a.constraints.budget_cny : a.constraints.max_latency_seconds;
  const dataXMax = Math.max(0.01, ...data.map((r) => r[xKey]));
  const xMax = dataXMax * 1.12;
  const yMin = data.length ? Math.max(0, Math.floor(Math.min(...data.map((r) => r.quality)) / 10) * 10 - 10) : 0;
  const yMax = 100;
  const x = (v) => left + (v / xMax) * plotW;
  const y = (v) => top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const timeMax = Math.max(1, ...data.map((r) => r.latency_seconds));
  let svg = '<title id="scatter-title">三维帕累托配置比较</title><desc id="scatter-desc">横轴为平均费用或完整执行耗时，纵轴为效果，气泡大小表示执行耗时。绿色是满足约束的前沿配置，金色是不满足约束的配置。每个气泡可用 Tab 聚焦，按回车打开详情。</desc>';
  const feasibleX = xLimit == null ? width - right : Math.max(left, Math.min(width - right, x(xLimit)));
  const feasibleY = Math.max(top, Math.min(height - bottom, y(a.constraints.min_quality)));
  svg += `<rect x="${left}" y="${top}" width="${feasibleX - left}" height="${feasibleY - top}" rx="3" fill="#f4f8ee"/>`;
  for (let i = 0; i <= 4; i++) {
    const xx = left + plotW * i / 4;
    const yy = top + plotH * i / 4;
    const xv = xMax * i / 4;
    const yv = yMax - (yMax - yMin) * i / 4;
    svg += `<line class="scatter-grid" x1="${xx}" y1="${top}" x2="${xx}" y2="${height - bottom}"/><line class="scatter-grid" x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}"/><text class="scatter-label" x="${xx}" y="${height - bottom + 19}" text-anchor="middle">${xKey === "cost_cny" ? `¥${fmt(xv, 3)}` : `${fmt(xv, 1)}s`}</text><text class="scatter-label" x="${left - 13}" y="${yy + 3}" text-anchor="end">${fmt(yv)}</text>`;
  }
  svg += `<text class="scatter-axis-title" x="${left}" y="12">任务效果 ↑</text><text class="scatter-axis-title" x="${width - right}" y="${height - 5}" text-anchor="end">${xKey === "cost_cny" ? "平均每任务费用 (CNY)" : "完整任务执行耗时 (秒)"} →</text>`;
  if (xLimit != null && xLimit <= xMax) svg += `<line x1="${x(xLimit)}" y1="${top}" x2="${x(xLimit)}" y2="${height - bottom}" stroke="#bacba8" stroke-dasharray="4 5"/><text class="scatter-label" x="${Math.min(width - right - 57, x(xLimit) + 5)}" y="${top + 10}">${xKey === "cost_cny" ? "费用上限" : "耗时上限"}</text>`;
  if (a.constraints.min_quality >= yMin) svg += `<line x1="${left}" y1="${y(a.constraints.min_quality)}" x2="${width - right}" y2="${y(a.constraints.min_quality)}" stroke="#c4d2b2" stroke-dasharray="4 5"/>`;
  const recommendations = new Set(a.recommendations.map((r) => r.record_id));
  const labelBoxes = [];
  for (const record of [...data].sort((r, s) => Number(r.is_frontier) - Number(s.is_frontier) || r.quality - s.quality)) {
    const xx = x(record[xKey]), yy = y(record.quality);
    const radius = 4.2 + Math.sqrt(record.latency_seconds / timeMax) * 8.5;
    const fill = !record.feasible ? "#e3d7b8" : record.is_frontier ? "#527c43" : "#c3ceba";
    const stroke = !record.feasible ? "#c1aa70" : record.is_frontier ? "#396434" : "#b0bfa4";
    const label = `${record.model}，${record.reasoning}，效果 ${fmt(record.quality)}，费用 ${money(record.cost_cny)}，耗时 ${fmt(record.latency_seconds)} 秒，${record.feasible ? record.is_frontier ? "前沿" : "被支配" : "不满足约束"}`;
    svg += `<g class="scatter-point" data-record="${escapeHTML(record.id)}" transform="translate(${xx},${yy})" tabindex="0" role="button" aria-label="${escapeHTML(label)}"><circle class="point-halo" r="${radius + 6}"/><circle r="${radius + 3}" fill="${fill}" opacity=".10"/><circle r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/><circle r="2" fill="#fff" opacity=".85"/></g>`;
    if (recommendations.has(record.id) && width > 540) {
      const labelWidth = 93;
      let labelX = Math.max(left + 3, Math.min(width - right - labelWidth, xx + radius + 5));
      let labelY = Math.max(top + 10, yy - radius - 6);
      for (let attempt = 0; attempt < 8 && labelBoxes.some((b) => Math.abs(labelY - b.y) < 14 && Math.abs(labelX - b.x) < labelWidth); attempt++) labelY += 15;
      labelY = Math.min(height - bottom - 4, labelY);
      labelBoxes.push({ x: labelX, y: labelY });
      svg += `<text class="point-name" x="${labelX}" y="${labelY}">${escapeHTML(record.model)}</text>`;
    }
  }
  $("#scatter").innerHTML = svg;
  $("#chart-empty").classList.toggle("hidden", data.length > 0);
  $("#chart-empty").innerHTML = `<strong>${state.kind === "measured" ? "还没有可比较的真实评测" : "当前没有完整的可比指标"}</strong><span>请补齐效果、每任务费用和完整执行时间。</span><a href="#data">前往评测数据 →</a>`;
}

function renderRecommendations() {
  const a = state.analysis;
  if (!a.recommendations.length) {
    const emptyDataset = !a.records.length;
    $("#recommendations").innerHTML = `<div class="no-recommendations">${icon(emptyDataset ? "data" : "search")}<h3>${emptyDataset ? "先建立你的评测数据" : "当前约束下，暂无达标配置"}</h3><p>${emptyDataset ? "导入真实评测，或使用固定任务集完成首轮实测，系统将按相同口径生成建议。" : "保留了所有约束。你可以调整需求，或补充更合适的评测配置。"}</p><div class="suggestion-actions">${emptyDataset ? '<a href="#benchmark" class="button small secondary">开始一次评测 ↗</a>' : a.suggestions.map((s) => `<button class="button small secondary" data-relax-field="${escapeHTML(s.field)}" data-relax-value="${s.value}">${s.field === "budget_cny" ? `费用上限调至 ${money(s.value)}` : s.field === "max_latency_seconds" ? `耗时上限调至 ${fmt(s.value, 3)} 秒` : `效果底线调至 ${Math.floor(s.value)} 分`}</button>`).join("")}</div></div>`;
    return;
  }
  $("#recommendations").innerHTML = a.recommendations.map((rec) => {
    const r = a.records.find((record) => record.id === rec.record_id);
    const featured = rec.role === "balanced";
    return `<article class="recommendation${featured ? " featured" : ""}"><div class="rec-header"><span>${icon(rec.role === "economy" ? "wallet" : featured ? "spark" : "chart")} ${escapeHTML(rec.label)}</span>${featured ? '<span class="rec-pill">建议关注</span>' : ""}</div><h3 class="rec-model" title="${escapeHTML(r.model)}">${escapeHTML(r.model)}</h3><div class="rec-config" title="${escapeHTML(`${r.reasoning} · ${r.provider}`)}">${escapeHTML(r.reasoning)}推理 · ${escapeHTML(r.provider)}</div><div class="rec-metrics"><div class="rec-metric"><strong>${fmt(r.quality)}</strong><span>任务效果</span></div><div class="rec-metric"><strong>${money(r.cost_cny)}</strong><span>费用 / 次</span></div><div class="rec-metric"><strong>${fmt(r.latency_seconds)}s</strong><span>完整耗时</span></div></div><p class="rec-reason">${escapeHTML(rec.reason)}</p><button class="rec-button" data-detail="${escapeHTML(r.id)}">查看配置与来源 ${icon("arrow")}</button></article>`;
  }).join("");
}

function modelCell(r) {
  const family = r.model.toLowerCase().split(/[ ·]/)[0];
  const style = ["claude", "gpt", "gemini", "deepseek"].includes(family) ? family : "";
  const initial = r.model.slice(0, 1).toUpperCase();
  return `<div class="model-cell"><span class="model-avatar ${style}">${escapeHTML(initial)}</span><div><strong>${escapeHTML(r.model)}</strong><small>${escapeHTML(r.reasoning)} · ${escapeHTML(r.provider)} · ${escapeHTML(r.agent)}</small></div></div>`;
}

function visibleRecords() {
  if (!state.analysis) return [];
  const search = $("#table-search").value.trim().toLowerCase();
  return state.analysis.records.filter((r) => (!$("#frontier-only").checked || r.is_frontier) && [r.model, r.model_version, r.agent, r.reasoning, r.provider].join(" ").toLowerCase().includes(search)).sort((a, b) => (a[state.sort.key] - b[state.sort.key]) * (state.sort.desc ? -1 : 1) || a.id.localeCompare(b.id));
}

function renderTable() {
  if (!state.analysis) return;
  const records = visibleRecords();
  $("#table-count").textContent = records.length;
  $("#comparison-body").innerHTML = records.map((r) => `<tr class="${r.id === state.analysis.baseline_id ? "baseline-row" : ""}"><td><input type="radio" name="baseline" value="${escapeHTML(r.id)}" aria-label="以 ${escapeHTML(r.model)} ${escapeHTML(r.provider)} 为基准" ${r.id === state.analysis.baseline_id ? "checked" : ""}></td><td>${modelCell(r)}</td><td><span class="metric-number">${fmt(r.quality)}</span><div class="quality-meter"><span style="width:${r.quality}%"></span></div></td><td class="metric-number">${money(r.cost_cny)}</td><td class="metric-number">${fmt(r.latency_seconds)}s</td><td><span class="tag ${!r.feasible ? "outside" : r.is_frontier ? "frontier" : "grey"}" title="${escapeHTML(r.violations.join("；"))}">${!r.feasible ? "不满足约束" : r.is_frontier ? "↗ 帕累托前沿" : "被其他配置支配"}</span></td><td><button class="detail-link" data-detail="${escapeHTML(r.id)}" aria-label="查看 ${escapeHTML(r.model)} 详情">↗</button></td></tr>`).join("") || '<tr><td colspan="7" class="empty-cell">没有符合当前筛选条件的配置</td></tr>';
  const baseline = state.analysis.records.find((r) => r.id === state.analysis.baseline_id);
  $("#comparison-footnote").textContent = baseline ? `当前基准：${baseline.model} · ${baseline.provider} · ${fmt(baseline.quality)} 分` : "完整执行时间，不含员工选型时间。";
  $$("[data-sort]").forEach((button) => button.closest("th").setAttribute("aria-sort", button.dataset.sort === state.sort.key ? state.sort.desc ? "descending" : "ascending" : "none"));
}

function renderData() {
  const records = state.raw.filter((r) => r.dataset_kind === state.kind).sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at) || a.id.localeCompare(b.id));
  const groups = state.catalog.groups.filter((g) => g.dataset_kind === state.kind);
  $("#data-summary").innerHTML = `<div class="stat-card"><div class="stat-label">${state.kind === "demo" ? "合成演示" : "真实评测"}记录</div><div class="stat-number">${records.length}<small>条</small></div></div><div class="stat-card"><div class="stat-label">独立比较组</div><div class="stat-number">${groups.length}<small>组</small></div></div><div class="stat-card"><div class="stat-label">已覆盖场景</div><div class="stat-number">${new Set(records.map((r) => r.scenario)).size}<small>/ 1</small></div></div>`;
  $("#data-count").textContent = records.length;
  $("#data-body").innerHTML = records.map((r) => `<tr><td>${modelCell(r)}</td><td><span class="tag">${escapeHTML(r.suite)}</span><small class="muted" style="display:block;font-size:8px;margin-top:5px">${r.channel === "api" ? "API 账单" : "订阅摊销"} · n=${r.sample_size}</small></td><td class="metric-number">${fmt(r.quality)} / ${r.channel === "subscription" ? `${money(r.monthly_fee_cny)} 月费` : money(r.cost_cny)} / ${fmt(r.latency_seconds)}s</td><td title="${escapeHTML(r.source_name)}">${escapeHTML(r.source_name.slice(0, 22))}<small class="muted" style="display:block;font-size:8px">${r.dataset_kind === "demo" ? "合成数据" : r.source_type === "self-built" ? "自建测试" : "第三方来源"}</small></td><td class="metric-number">${date(r.measured_at)}</td><td><button class="detail-link" data-detail="${escapeHTML(r.id)}" aria-label="查看 ${escapeHTML(r.model)} 来源详情">↗</button></td></tr>`).join("") || '<tr><td colspan="6" class="empty-cell">尚未导入真实评测。<button class="text-button" data-open-import>导入 JSON / CSV →</button></td></tr>';
}

function openDetail(id) {
  const raw = state.raw.find((r) => r.id === id);
  const r = state.analysis?.records.find((item) => item.id === id) || raw;
  if (!r) return;
  $("#detail-title").textContent = r.model;
  const fields = [["模型版本", r.model_version], ["Agent / 推理强度", `${r.agent} / ${r.reasoning}`], ["供应商 / 渠道", `${r.provider} / ${r.channel === "api" ? "API 按量" : "会员订阅"}`], ["数据性质 / 样本量", `${r.dataset_kind === "demo" ? "合成演示" : "真实评测"} / ${r.sample_size} 个任务`], ["任务集 / 评分方法", `${r.suite} / ${r.score_method}`], ["完整执行时间口径", r.latency_method], ["费用口径", r.cost_method], ["评测时间", r.measured_at], ["数据来源", r.source_name], ["记录 ID", r.id]];
  $("#detail-content").innerHTML = `<span class="tag ${r.dataset_kind === "demo" ? "outside" : "frontier"}">${r.dataset_kind === "demo" ? "合成示例 · 非实测" : "用户导入 · 请核查证据"}</span><div class="detail-metrics"><div><strong>${fmt(r.quality)}</strong><span>任务效果 / 100</span></div><div><strong>${r.channel === "subscription" && !state.analysis?.records.some((item) => item.id === id) ? money(r.monthly_fee_cny) : money(r.cost_cny)}</strong><span>${r.channel === "subscription" && !state.analysis?.records.some((item) => item.id === id) ? "订阅月费" : "人民币 / 任务"}</span></div><div><strong>${fmt(r.latency_seconds)}s</strong><span>平均完整执行时间</span></div></div><dl class="detail-grid">${fields.map(([label, value]) => `<div class="detail-field"><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join("")}</dl>${r.source_url ? `<div class="detail-notes">来源链接：<a href="${escapeHTML(r.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(r.source_url)}</a></div>` : ""}<div class="detail-notes"><strong>费用说明</strong><br>${escapeHTML(r.cost_notes)}${r.channel === "subscription" ? `<br>当前选型月任务量：${fmt(state.analysis?.constraints.monthly_tasks ?? 500)} 次。月费：${money(r.monthly_fee_cny)}。` : ""}</div>${r.notes ? `<div class="detail-notes">${escapeHTML(r.notes)}</div>` : ""}${r.dominated_by?.length ? `<div class="detail-notes">在全部三个目标上被以下配置支配：${r.dominated_by.map((other) => escapeHTML(state.analysis.records.find((item) => item.id === other)?.model)).join("、")}。</div>` : ""}${r.violations?.length ? `<div class="detail-notes">本次约束：${escapeHTML(r.violations.join("；"))}。</div>` : ""}${r.task_results ? `<h3 style="font-size:13px;margin-top:20px">逐题评分证据</h3>${r.task_results.map((t) => `<div class="score-feedback"><span>${escapeHTML(t.task_id)}</span><span>${fmt(t.score)} 分 · ${fmt(t.duration_seconds)}s · ${money(t.cost_cny)}</span></div>`).join("")}` : '<p class="muted">此记录未附逐题证据。汇总数据的真实性由来源方负责。</p>'}<div class="dialog-actions"><button class="button secondary" id="download-detail" data-id="${escapeHTML(id)}">导出原始记录</button></div>`;
  $("#detail-dialog").showModal();
}

function download(filename, content, type = "application/json") {
  const data = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCSV(records, filename) {
  if (!records.length) return toast("暂无可导出的记录");
  const fields = [...new Set(records.flatMap((r) => Object.keys(r)))];
  const cell = (value) => {
    let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    if (typeof value === "string" && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = [fields, ...records.map((r) => fields.map((f) => r[f]))].map((row) => row.map(cell).join(",")).join("\r\n");
  download(filename, "\ufeff" + csv, "text/csv");
}

function exportReport() {
  if (!state.analysis) return toast("请先完成一次选型计算");
  download(`pareto-selection-${state.kind}.json`, { title: "Pareto Code 选型报告", created_at: new Date().toISOString(), dataset_kind: state.kind, disclaimer: state.kind === "demo" ? "全部指标与档位为合成演示，不代表真实评测或报价。" : "结果仅适用于记录中的任务集和统计口径。数据真实性由来源方负责。", recommendation_method: "满足全部约束后，在三维前沿上选最低费用、最大归一化遗憾最小、最高效果。", savings_assumption: "相对所选基准，仅在效果不降低且满足全部约束的配置中估算月度费用差。订阅月费按预计月任务量分摊。", ...state.analysis });
  toast("选型报告已导出，包含约束、来源与推荐规则");
}

function resetImport() {
  state.importVersion++;
  state.importRecords = null;
  $("#confirm-import").disabled = true;
  $("#import-preview").classList.add("hidden");
  inlineError("#import-error", null);
}

function openImport() {
  resetImport();
  $("#import-dialog").showModal();
}

async function validateImport() {
  resetImport();
  const version = state.importVersion;
  $("#validate-import").disabled = true;
  try {
    const result = await api("/api/import", { format: $("#import-format").value, content: $("#import-content").value, dry_run: true });
    if (version !== state.importVersion) return;
    state.importRecords = result.records;
    $("#import-preview").innerHTML = `<strong>${result.count} 条记录校验通过</strong><br>${result.records.slice(0, 4).map((r) => `${escapeHTML(r.model)} · ${escapeHTML(r.suite)} · ${r.dataset_kind === "demo" ? "合成演示" : "真实评测"}`).join("<br>")}${result.count > 4 ? `<br>另有 ${result.count - 4} 条…` : ""}<br>将追加到本地数据库，不覆盖原始快照。`;
    $("#import-preview").classList.remove("hidden");
    $("#confirm-import").disabled = false;
  } catch (error) { inlineError("#import-error", error); }
  finally { $("#validate-import").disabled = false; }
}

async function importRecords(records) {
  const result = await api("/api/import", { records, dry_run: false });
  state.kind = records.some((r) => r.dataset_kind === "measured") ? "measured" : "demo";
  state.channel = records.find((r) => r.dataset_kind === state.kind).channel;
  state.groupId = null;
  state.baselineId = null;
  updateChannelButtons();
  await refreshData();
  const first = records.find((r) => r.dataset_kind === state.kind && r.channel === state.channel);
  const group = state.catalog.groups.find((g) => ["scenario", "suite", "score_method", "latency_method", "cost_method", "channel", "dataset_kind"].every((f) => g[f] === first[f]));
  if (group) { state.groupId = group.id; renderGroups(); }
  await runAnalysis();
  toast(result.message);
  return result;
}

async function confirmImport() {
  if (!state.importRecords) return;
  $("#confirm-import").disabled = true;
  try { await importRecords(state.importRecords); $("#import-dialog").close(); resetImport(); }
  catch (error) { inlineError("#import-error", error); $("#confirm-import").disabled = false; }
}

async function readFile(input, target, errorTarget, onRead) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) return inlineError(errorTarget, "文件不能超过 2 MiB");
  try {
    target.value = await file.text();
    onRead?.(file);
    inlineError(errorTarget, null);
  } catch { inlineError(errorTarget, "文件读取失败，请重新选择。"); }
}

function renderBenchmark() {
  if (!state.benchmark) return;
  $("#benchmark-task-list").innerHTML = state.benchmark.tasks.map((t, index) => `<details class="task-item"><summary><span>${String(index + 1).padStart(2, "0")}</span>${escapeHTML(t.title)}</summary><p>${escapeHTML(t.instruction)}</p><pre><code>${escapeHTML(t.code.split("\n").map((line, i) => `${String(i + 1).padStart(2, " ")}  ${line}`).join("\n"))}</code></pre><p>${escapeHTML(state.benchmark.response_instruction)}</p></details>`).join("");
}

function resetScore() {
  state.scoreVersion++;
  state.score = null;
  $("#score-output").classList.add("hidden");
  inlineError("#score-error", null);
}

async function scoreResults() {
  resetScore();
  const version = state.scoreVersion;
  $("#score-results").disabled = true;
  try {
    let bundle;
    try { bundle = JSON.parse($("#score-content").value); } catch { throw new Error("请粘贴有效的结果 JSON，或先下载并填写结果模板。"); }
    const scored = await api("/api/benchmark/score", bundle);
    if (version !== state.scoreVersion) return;
    state.score = scored;
    const r = scored.record;
    $("#score-output").innerHTML = `<div class="score-success">${icon("check")} 评分完成 · ${escapeHTML(r.model)} · 完整 ${r.sample_size} 题</div><div class="score-overview"><div><strong>${fmt(r.quality)}</strong><span>平均 F1 × 100</span></div><div><strong>${money(r.cost_cny)}</strong><span>平均每任务费用</span></div><div><strong>${fmt(r.latency_seconds)}s</strong><span>平均完整耗时</span></div></div>${scored.feedback.map((f) => `<div class="score-feedback"><span>${escapeHTML(f.task_id)}${f.error ? " · 格式无效" : ""}</span><span>${fmt(f.score)} 分 · ${fmt(f.duration_seconds)}s</span></div>`).join("")}<p class="muted" style="margin-top:12px">请确认真实版本、原始执行日志与费用口径。此分数仅适用于固定的 8 道任务。</p><div class="score-actions"><button class="button secondary" id="download-scored">导出评分记录</button><button class="button primary" id="save-scored">导入并选型 ${icon("arrow")}</button></div>`;
    $("#score-output").classList.remove("hidden");
  } catch (error) { inlineError("#score-error", error); }
  finally { $("#score-results").disabled = false; }
}

function updateChannelButtons() {
  $$("[data-channel]").forEach((button) => { const active = button.dataset.channel === state.channel; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
}

function parseRequirements() {
  const text = $("#quick-text").value;
  const budget = text.match(/(?:预算|不超过|上限)?\s*(\d+(?:\.\d+)?)\s*元/);
  const seconds = text.match(/(\d+(?:\.\d+)?)\s*秒/);
  const quality = text.match(/(\d+(?:\.\d+)?)\s*分/);
  const tasks = text.match(/(\d+)\s*次\s*[/／每]?\s*月/);
  const updates = [[budget, "#budget"], [seconds, "#max-time"], [quality, "#min-quality"], [tasks, "#monthly-tasks"]].filter(([match]) => match);
  if (!updates.length) return toast("可识别示例：预算 0.3 元，45 秒以内，至少 85 分，500 次/月");
  if (quality && Number(quality[1]) > 100) return toast("任务效果范围为 0–100 分");
  updates.forEach(([match, selector]) => { $(selector).value = match[1]; });
  $("#quality-value").innerHTML = `${$("#min-quality").value} <small>/ 100</small>`;
  runAnalysis();
  toast(`已按本地规则填写 ${updates.length} 项需求`);
}

function showChartTooltip(event) {
  const point = event.target.closest?.(".scatter-point");
  if (!point || !state.analysis) return;
  const r = state.analysis.records.find((record) => record.id === point.dataset.record);
  if (!r) return;
  const tip = $("#chart-tooltip");
  tip.innerHTML = `<strong>${escapeHTML(r.model)}</strong><span>效果 ${fmt(r.quality)} · 费用 ${money(r.cost_cny)}<br>完整耗时 ${fmt(r.latency_seconds)} 秒<br>${r.feasible ? r.is_frontier ? "三维帕累托前沿" : "被其他配置支配" : escapeHTML(r.violations.join("、"))}<br>点击或按回车查看来源 ↗</span>`;
  tip.classList.remove("hidden");
  const wrap = $("#scatter-wrap").getBoundingClientRect();
  const position = point.getBoundingClientRect();
  tip.style.left = `${Math.max(0, Math.min(wrap.width - tip.offsetWidth, position.left - wrap.left + 16))}px`;
  tip.style.top = `${Math.max(0, Math.min(wrap.height - tip.offsetHeight, position.top - wrap.top - tip.offsetHeight - 8))}px`;
}

let debounceTimer;
function scheduleAnalysis() { clearTimeout(debounceTimer); debounceTimer = setTimeout(runAnalysis, 220); }

function bindEvents() {
  let previousChartWidth = 0;
  new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    if (width && width !== previousChartWidth) { previousChartWidth = width; renderChart(); }
  }).observe($("#scatter-wrap"));
  window.addEventListener("hashchange", route);
  $("#menu-toggle").addEventListener("click", () => setSidebarOpen(!$("#sidebar").classList.contains("open")));
  matchMedia("(max-width: 800px)").addEventListener("change", () => setSidebarOpen(false));
  $("#dataset-select").addEventListener("change", () => { state.kind = $("#dataset-select").value; state.groupId = null; state.baselineId = state.kind === "demo" ? "demo-gpt-legacy" : null; renderGroups(); renderData(); runAnalysis(); });
  $("#constraints-form").addEventListener("submit", (event) => { event.preventDefault(); clearTimeout(debounceTimer); runAnalysis(); });
  ["#budget", "#max-time", "#monthly-tasks"].forEach((selector) => $(selector).addEventListener("input", scheduleAnalysis));
  $("#min-quality").addEventListener("input", () => { $("#quality-value").innerHTML = `${$("#min-quality").value} <small>/ 100</small>`; scheduleAnalysis(); });
  $("#group-select").addEventListener("change", () => { state.groupId = $("#group-select").value || null; state.baselineId = null; runAnalysis(); });
  $("#reset-constraints").addEventListener("click", () => { $("#budget").value = "0.5"; $("#max-time").value = "60"; $("#min-quality").value = "80"; $("#monthly-tasks").value = "500"; $("#quality-value").innerHTML = '80 <small>/ 100</small>'; runAnalysis(); });
  $("#parse-requirements").addEventListener("click", parseRequirements);
  $("#table-search").addEventListener("input", renderTable);
  $("#frontier-only").addEventListener("change", renderTable);
  $("#export-csv").addEventListener("click", () => exportCSV(visibleRecords(), `pareto-comparison-${state.kind}.csv`));
  $("#export-report").addEventListener("click", exportReport);
  $("#data-export-json").addEventListener("click", () => download(`pareto-records-${state.kind}.json`, state.raw.filter((r) => r.dataset_kind === state.kind)));
  $("#data-export-csv").addEventListener("click", () => exportCSV(state.raw.filter((r) => r.dataset_kind === state.kind), `pareto-records-${state.kind}.csv`));
  $("#download-template").addEventListener("click", () => {
    if (!state.benchmark && !state.raw.length) return toast("数据仍在加载，请稍后重试");
    const r = state.raw.find((r) => r.channel === "api");
    const template = r ? { ...r, id: "your-unique-record-id", dataset_kind: "measured", source_type: "self-built", model: "填写模型名", model_version: "填写实际版本", provider: "填写供应商", source_name: "填写真实来源", quality: null, cost_cny: null, latency_seconds: null, measured_at: new Date().toISOString(), cost_notes: "填写真实账单费用口径", notes: "请替换示例信息并补齐所有指标后导入。" } : { ...state.benchmark.result_template.config, scenario: "code-review", suite: "code-review-v1", score_method: "issue-f1-v1", latency_method: "end-to-end-v1", cost_method: "api-billed-cny-v1", quality: null, cost_cny: null, latency_seconds: null, monthly_fee_cny: null, sample_size: 8, measured_at: new Date().toISOString() };
    delete template.task_results;
    download("benchmark-record.template.json", [template]);
  });
  $("#validate-import").addEventListener("click", validateImport);
  $("#confirm-import").addEventListener("click", confirmImport);
  $("#import-content").addEventListener("input", resetImport);
  $("#import-format").addEventListener("change", resetImport);
  $("#import-file").addEventListener("change", () => { resetImport(); readFile($("#import-file"), $("#import-content"), "#import-error", (file) => { $("#import-format").value = file.name.toLowerCase().endsWith(".csv") ? "csv" : "json"; $("#import-file-name").textContent = file.name; resetImport(); }); });
  $("#download-tasks").addEventListener("click", () => { if (state.benchmark) { const { result_template, ...tasks } = state.benchmark; download("code-review-v1.tasks.json", tasks); } });
  $("#download-results-template").addEventListener("click", () => { if (state.benchmark) download("code-review-v1.results.template.json", state.benchmark.result_template); });
  $("#score-file").addEventListener("change", () => { resetScore(); readFile($("#score-file"), $("#score-content"), "#score-error", resetScore); });
  $("#score-content").addEventListener("input", resetScore);
  $("#score-results").addEventListener("click", scoreResults);
  $("#scatter").addEventListener("pointerover", showChartTooltip);
  $("#scatter").addEventListener("focusin", showChartTooltip);
  $("#scatter-wrap").addEventListener("pointerleave", () => $("#chart-tooltip").classList.add("hidden"));
  $("#scatter").addEventListener("focusout", () => $("#chart-tooltip").classList.add("hidden"));
  $("#scatter").addEventListener("click", (event) => { const point = event.target.closest(".scatter-point"); if (point) { $("#chart-tooltip").classList.add("hidden"); openDetail(point.dataset.record); } });
  $("#scatter").addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key) && event.target.matches(".scatter-point")) { event.preventDefault(); openDetail(event.target.dataset.record); } });
  $("#comparison-body").addEventListener("change", (event) => { if (event.target.matches('input[name="baseline"]')) { state.baselineId = event.target.value; runAnalysis(); } });
  $("#chart-help").addEventListener("click", () => { $("#detail-title").textContent = "如何阅读帕累托图"; $("#detail-content").innerHTML = '<div class="detail-notes">越靠左，费用越低或执行越快；越靠上，任务效果越高。气泡越大，完整执行耗时越长。绿色代表当前满足约束的三维前沿点，灰色代表被支配点，金色代表不满足当前约束的点。<br><br>图是三维指标的二维投影，因此不将点连成一条可能误导的二维前沿曲线。淡绿色区域表示图中两个维度满足约束，还需要检查第三个维度。<br><br>用鼠标悬停或 Tab 聚焦查看指标；点击气泡或按回车查看完整来源与口径。</div><a href="#method" class="text-link" data-close-dialog>查看完整方法 ↗</a>'; $("#detail-dialog").showModal(); });
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("button, a");
    if (!button) return;
    if (button.hasAttribute("data-open-import")) openImport();
    if (button.hasAttribute("data-close-dialog")) button.closest("dialog").close();
    if (button.dataset.detail) openDetail(button.dataset.detail);
    if (button.dataset.channel && button.dataset.channel !== state.channel) { state.channel = button.dataset.channel; state.groupId = null; state.baselineId = state.channel === "api" && state.kind === "demo" ? "demo-gpt-legacy" : null; updateChannelButtons(); renderGroups(); runAnalysis(); }
    if (button.dataset.axis) { state.axis = button.dataset.axis; $$("[data-axis]").forEach((b) => { const active = b.dataset.axis === state.axis; b.classList.toggle("active", active); b.setAttribute("aria-pressed", String(active)); }); renderChart(); }
    if (button.dataset.sort) { state.sort = { key: button.dataset.sort, desc: button.dataset.sort === state.sort.key ? !state.sort.desc : button.dataset.sort === "quality" }; renderTable(); }
    if (button.dataset.relaxField) { const selector = { budget_cny: "#budget", max_latency_seconds: "#max-time", min_quality: "#min-quality" }[button.dataset.relaxField]; $(selector).value = selector === "#min-quality" ? Math.floor(Number(button.dataset.relaxValue)) : button.dataset.relaxValue; $("#quality-value").innerHTML = `${$("#min-quality").value} <small>/ 100</small>`; runAnalysis(); }
    if (button.id === "download-detail") { const r = state.raw.find((item) => item.id === button.dataset.id); if (r) download(`${r.id}.json`, [r]); }
    if (button.id === "download-scored" && state.score) download(`${state.score.record.id}.json`, [state.score.record]);
    if (button.id === "save-scored" && state.score) {
      button.disabled = true;
      try { await importRecords([state.score.record]); location.hash = "select"; button.textContent = "已导入"; }
      catch (error) { inlineError("#score-error", error); button.disabled = false; }
    }
    if (button.id === "retry-load") initialize();
  });
  $$("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { const r = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close(); }));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") setSidebarOpen(false); });
}

async function initialize() {
  try {
    await Promise.all([refreshData(), api("/api/benchmark").then((data) => { state.benchmark = data; renderBenchmark(); })]);
    state.ready = true;
    await runAnalysis();
  } catch (error) { showError(error); }
}

bindEvents();
route();
initialize();

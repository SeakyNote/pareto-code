/* Optional browser QA. Requires Node 22+ and a local Chromium; no npm packages. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), "pareto-browser-"));
const output = path.join(root, "test-results");
await mkdir(output, { recursive: true });
const children = [];
let socket;
let counter = 0;
const pending = new Map();
const errors = [];

function launch(command, args, pattern) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    let log = "";
    const timer = setTimeout(() => reject(new Error(`启动超时: ${command}\n${log}`)), 15000);
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (data) => {
      log += data.toString();
      const match = log.match(pattern);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`${command} 提前退出 (${code})\n${log}`)); });
  });
}

function command(method, params = {}, sessionId) {
  const id = ++counter;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP 超时: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

try {
  const base = await launch(process.env.PYTHON || "python3", ["-m", "pareto.server", "--port", "0", "--db", path.join(temporary, "qa.sqlite3")], /(http:\/\/127\.0\.0\.1:\d+)/);
  const browser = await launch(process.env.CHROMIUM_BIN || "chromium", ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--disable-background-networking", "--no-first-run", "--disable-extensions", "--remote-debugging-port=0", `--user-data-dir=${path.join(temporary, "chrome")}`, "about:blank"], /DevTools listening on (ws:\/\/[^\s]+)/);
  socket = new WebSocket(browser);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const handler = pending.get(message.id);
      if (!handler) return;
      clearTimeout(handler.timer);
      pending.delete(message.id);
      if (message.error) handler.reject(new Error(message.error.message)); else handler.resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
  });
  const { targetId } = await command("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params = {}) => command(method, params, sessionId);
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = (expression) => evaluate(`(async () => { const until = Date.now() + 8000; while (Date.now() < until) { if (${expression}) return true; await new Promise(r => setTimeout(r, 50)); } throw new Error(${JSON.stringify("等待条件失败: " + expression)}); })()`);
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', {bubbles: true})); })()`);
  const screenshot = async (name) => {
    await evaluate("Promise.all(document.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})))");
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(output, name), Buffer.from(data, "base64"));
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: base });
  await waitFor("document.querySelectorAll('.recommendation').length === 3 && !document.querySelector('#selection-workspace').classList.contains('loading')");
  assert.equal(await evaluate("document.querySelectorAll('.scatter-point').length"), 12);
  assert.equal(await evaluate("document.querySelectorAll('#comparison-body tr').length"), 12);
  assert.ok((await evaluate("document.querySelector('#summary').textContent")).includes("130"));
  await screenshot("desktop.png");
  console.log("✓ 初始选型、三维前沿、三档推荐与同质量节省");

  await click('[data-axis="latency_seconds"]');
  await evaluate("(() => { const point = document.querySelector('.scatter-point'); point.focus(); point.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true})); })()");
  assert.equal(await evaluate("document.querySelector('#detail-dialog').open"), true);
  await evaluate("document.querySelector('#detail-dialog').close()");
  await click('[data-axis="cost_cny"]');
  await fill("#budget", "0");
  await waitFor("document.querySelector('.no-recommendations') && !document.querySelector('#selection-workspace').classList.contains('loading')");
  assert.equal(await evaluate("document.querySelectorAll('.recommendation').length"), 0);
  await click('[data-relax-field="budget_cny"]');
  await waitFor("document.querySelectorAll('.recommendation').length === 3 && !document.querySelector('#selection-workspace').classList.contains('loading')");
  await fill("#quick-text", "预算 0.3 元，45 秒以内，至少 85 分，300 次/月");
  await click("#parse-requirements");
  await waitFor("!document.querySelector('#selection-workspace').classList.contains('loading')");
  assert.deepEqual(await evaluate("['#budget','#max-time','#min-quality','#monthly-tasks'].map(s=>document.querySelector(s).value)"), ["0.3", "45", "85", "300"]);
  console.log("✓ 图表切换、键盘详情、无解状态、调整建议与规则快捷填写");

  await click('[data-channel="subscription"]');
  await fill("#budget", "100");
  await fill("#max-time", "120");
  await fill("#monthly-tasks", "100");
  await click('#constraints-form button[type="submit"]');
  await waitFor("document.querySelectorAll('#comparison-body tr').length === 4 && !document.querySelector('#selection-workspace').classList.contains('loading')");
  assert.ok((await evaluate("document.querySelector('#comparison-body').textContent")).includes("1.49"));
  await fill("#monthly-tasks", "1000");
  await click('#constraints-form button[type="submit"]');
  await waitFor("!document.querySelector('#selection-workspace').classList.contains('loading')");
  assert.ok((await evaluate("document.querySelector('#comparison-body').textContent")).includes("0.149"));
  await click('[data-channel="api"]');
  await click("#reset-constraints");
  await evaluate("document.querySelector('#dataset-select').value='measured'; document.querySelector('#dataset-select').dispatchEvent(new Event('change', {bubbles:true}))");
  await waitFor("document.querySelector('#chart-empty:not(.hidden)') && !document.querySelector('#selection-workspace').classList.contains('loading')");
  console.log("✓ API / 订阅隔离、任务量动态摊销、真实数据空状态");

  await evaluate("location.hash='data'");
  await click("#view-data [data-open-import]");
  await fill("#import-content", "bad-json");
  await click("#validate-import");
  await waitFor("!document.querySelector('#import-error').classList.contains('hidden')");
  assert.equal(await evaluate("document.querySelector('#confirm-import').disabled"), true);
  const imported = await evaluate(`(async()=>{ const records=await (await fetch('/api/records')).json(); const r={...records.records.find(r=>r.channel==='api'),id:'browser-import',model:'Browser <test>',model_version:'QA-fixture',provider:'=SUM(1+1)',dataset_kind:'measured',source_type:'self-built',source_name:'浏览器测试夹具（非真实模型）',quality:88,cost_cny:.1,latency_seconds:15,notes:'<img src=x onerror=alert(1)>'}; return r; })()`);
  await fill("#import-content", JSON.stringify([imported]));
  await click("#validate-import");
  await waitFor("!document.querySelector('#confirm-import').disabled");
  await click("#confirm-import");
  await waitFor("!document.querySelector('#import-dialog').open && document.querySelector('#dataset-select').value === 'measured'");
  await click('#data-body [data-detail="browser-import"]');
  assert.equal(await evaluate("document.querySelector('#detail-title').textContent"), "Browser <test>");
  assert.equal(await evaluate("document.querySelectorAll('#detail-content img').length"), 0);
  await evaluate("document.querySelector('#detail-dialog').close()");
  await click("#view-data [data-open-import]");
  await click("#validate-import");
  await waitFor("!document.querySelector('#import-error').classList.contains('hidden')");
  assert.ok((await evaluate("document.querySelector('#import-error').textContent")).includes("已存在"));
  await evaluate("document.querySelector('#import-dialog').close()");
  console.log("✓ 导入校验、预览、持久化、重复拒绝与 HTML 转义");

  await evaluate("location.hash='benchmark'");
  const results = await evaluate(`(async()=>{ const data=await (await fetch('/api/benchmark')).json(); const b=data.result_template; b.config.id='browser-scored'; b.config.model='Browser review fixture'; b.config.source_name='浏览器测试夹具（非真实模型）'; for(let i=0;i<b.responses.length;i++) Object.assign(b.responses[i],{started_at:new Date(Date.UTC(2026,10,3,8,i,0)).toISOString(),finished_at:new Date(Date.UTC(2026,10,3,8,i,10)).toISOString(),cost_cny:.08,output:{issues:[]}}); return b; })()`);
  await fill("#score-content", JSON.stringify(results));
  await click("#score-results");
  await waitFor("document.querySelector('#save-scored')");
  assert.ok((await evaluate("document.querySelector('.score-overview').textContent")).includes("25"));
  await click("#save-scored");
  await waitFor("location.hash==='#select' && !document.querySelector('#selection-workspace').classList.contains('loading')");
  const persisted = await evaluate("fetch('/api/records?dataset_kind=measured').then(r=>r.json())");
  assert.equal(persisted.records.length, 2);
  assert.equal(persisted.records.find((r) => r.id === "browser-scored").task_results.length, 8);
  await send("Page.reload");
  await waitFor("document.querySelectorAll('.recommendation').length === 3 && !document.querySelector('#selection-workspace').classList.contains('loading')");
  assert.equal((await evaluate("fetch('/api/records?dataset_kind=measured').then(r=>r.json())")).records.length, 2);
  console.log("✓ 固定任务评分、完整证据导入、闭环选型与页面刷新持久化");

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const view of ["select", "data", "benchmark", "method"]) {
    await evaluate(`location.hash=${JSON.stringify(view)}`);
    await waitFor(`!document.querySelector('#view-${view}').classList.contains('hidden')`);
    const size = await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})");
    assert.ok(size.scroll <= size.width, `${view} 出现页面级水平溢出: ${JSON.stringify(size)}`);
  }
  await evaluate("location.hash='select'; scrollTo(0,0)");
  await waitFor("!document.querySelector('#view-select').classList.contains('hidden')");
  await screenshot("mobile.png");
  await click("#menu-toggle");
  assert.equal(await evaluate("document.querySelector('#menu-toggle').getAttribute('aria-expanded')"), "true");
  await click('.nav-link[data-view="data"]');
  await waitFor("!document.querySelector('#sidebar').classList.contains('open')");
  assert.equal(errors.length, 0, `页面 JavaScript 错误: ${JSON.stringify(errors)}`);
  console.log("✓ 四个页面的移动端布局、导航与无运行时异常");
  console.log(`浏览器验证通过。截图：${output}`);
} finally {
  socket?.close();
  for (const child of children.reverse()) child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 400));
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

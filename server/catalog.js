export const SCENARIOS = [
  { id: 'coding', name: '代码开发', icon: 'code', description: '缺陷修复、功能实现与代码审查' },
  { id: 'svg', name: 'SVG 绘图', icon: 'pen', description: '图形、流程图与可视化' },
  { id: 'office', name: '办公自动化', icon: 'sheet', description: '表格处理与重复任务自动化' },
  { id: 'writing', name: '文档编写与审查', icon: 'file', description: '内容编写、校对与审查' },
];

// 人工构造的演示快照。名称仅用于演示配置维度，不代表产品现状或真实测评。
const configurations = [
  ['luna-low', 'GPT-5.6 Luna', 'Codex', 'OpenAI', 'low', 38, 0.04, 140],
  ['luna-medium', 'GPT-5.6 Luna', 'Codex', 'OpenAI', 'medium', 65, 0.10, 270],
  ['luna-high', 'GPT-5.6 Luna', 'Codex', 'OpenAI', 'high', 81, 0.24, 510],
  ['luna-xhigh', 'GPT-5.6 Luna', 'Codex', 'OpenAI', 'xhigh', 87, 0.40, 780],
  ['luna-max', 'GPT-5.6 Luna', 'Codex', 'OpenAI', 'max', 91, 0.68, 1260],
  ['terra-medium', 'GPT-5.6 Terra', 'Codex', 'OpenAI', 'medium', 78, 0.55, 420],
  ['terra-high', 'GPT-5.6 Terra', 'Codex', 'OpenAI', 'high', 89, 1.10, 660],
  ['terra-xhigh', 'GPT-5.6 Terra', 'Codex', 'OpenAI', 'xhigh', 94, 2.20, 1140],
  ['terra-max', 'GPT-5.6 Terra', 'Codex', 'OpenAI', 'max', 93, 3.20, 1680],
  ['sol-medium', 'GPT-5.6 Sol', 'Codex', 'OpenAI', 'medium', 88, 1.60, 600],
  ['sol-high', 'GPT-5.6 Sol', 'Codex', 'OpenAI', 'high', 97, 4.80, 1440],
  ['sol-xhigh', 'GPT-5.6 Sol', 'Codex', 'OpenAI', 'xhigh', 96, 6.20, 2100],
  ['deepseek-high', 'DeepSeek · 示例', '通用 Agent', 'DeepSeek', 'high', 86, 0.95, 1560],
  ['qwen-medium', 'Qwen Coder · 示例', '通用 Agent', 'Alibaba', 'medium', 75, 0.18, 390],
  ['sonnet-high', 'Claude Sonnet · 示例', '通用 Agent', 'Anthropic', 'high', 92, 1.85, 900],
  ['sonnet-medium', 'Claude Sonnet · 示例', '通用 Agent', 'Anthropic', 'medium', 84, 0.85, 450],
];

export const DEMO_DATASET = {
  benchmark: {
    id: 'code-repair-demo-20261101',
    name: '代码缺陷修复 · 演示基准 v1',
    scenario: 'coding',
    taskSet: 'code-repair-demo-v1 / 20 个示例任务',
    scoring: '同一测试集通过率，0–100 分；失败任务按 0 分计入平均值',
    scoreMax: 100,
    aggregation: 'mean-per-task',
    durationBasis: 'wall-clock',
    costBasis: 'per-task',
    currency: 'USD',
    evaluatedAt: '2026-11-01T08:00:00Z',
    source: { name: 'MVP 人工构造演示集', type: 'demo', url: null },
    notes: '所有数值均为人工构造，包含被支配、指标缺失和不同渠道的案例；不可作为真实采购或模型能力结论。模型名称仅用于界面演示。',
  },
  records: [
    ...configurations.map(([id, model, agent, provider, reasoning, quality, cost, duration]) => ({
      id, model, agent, provider, reasoning, quality, cost, duration,
      version: 'demo-v1', channel: 'api', sampleCount: 20,
      notes: '人工构造的演示配置；费用单位为 USD / 任务，执行耗时单位为秒。',
    })),
    ...[
      ['sub-luna-high', 'GPT-5.6 Luna', 'high', 81, 540],
      ['sub-luna-xhigh', 'GPT-5.6 Luna', 'xhigh', 87, 840],
      ['sub-terra-high', 'GPT-5.6 Terra', 'high', 89, 720],
      ['sub-sol-high', 'GPT-5.6 Sol', 'high', 97, 1560],
    ].map(([id, model, reasoning, quality, duration]) => ({
      id, model, agent: 'Codex', provider: 'OpenAI', reasoning, quality, duration,
      version: 'demo-v1', channel: 'subscription', cost: null, sampleCount: 20,
      notes: '订阅渠道演示数据。月费与任务量为用户假设，均摊费用不代表边际账单或配额保障。',
    })),
    { id: 'missing-duration', model: '待补齐耗时 · 示例', version: 'demo-v1', agent: '通用 Agent', provider: 'Other', reasoning: 'high', channel: 'api', quality: 90, cost: 0.30, duration: null, sampleCount: 20, notes: '缺少完整任务执行耗时，不能进入帕累托比较。' },
    { id: 'missing-cost', model: '待补齐费用 · 示例', version: 'demo-v1', agent: '通用 Agent', provider: 'Other', reasoning: 'medium', channel: 'api', quality: 85, cost: null, duration: 480, sampleCount: 20, notes: '缺少 API 任务费用，不能进入帕累托比较。' },
  ],
};

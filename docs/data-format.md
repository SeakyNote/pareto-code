# 评测数据与 HTTP API

## JSON

单个文件包含 `{ "benchmark": {...}, "records": [...] }`；多个快照用 `{ "datasets": [ ... ] }` 包装。完整示例见 [`examples/benchmark-template.json`](../examples/benchmark-template.json)，页面也可下载模板。

每次最多 20 个快照、总计 2000 条配置，文件最大 2 MiB。已有快照 id 不覆盖，重新评测应使用新 id。同一快照不应混入不同测试集、评分标准、时间快照或币种。

| benchmark 字段 | 含义与要求 |
| --- | --- |
| `id` | 唯一快照标识；字母或数字开头，允许字母、数字、`-`、`_`，至多 128 字符 |
| `name` | 人可读的评测快照名称 |
| `scenario` | `coding`、`svg`、`office`、`writing` |
| `taskSet` | 测试任务集名称与版本；建议包含任务数量与任务集哈希 |
| `scoring` | 评分规则，包括失败 / 超时如何计分；不超过 1000 字 |
| `scoreMax` | 评分上限，必须为正数且不超过 10000；效果只在此评分规则内有意义 |
| `aggregation` | 可比较口径为 `mean-per-task`，所有任务含失败计入均值 |
| `durationBasis` | 可比较口径为 `wall-clock`，从发起任务到返回完整结果 |
| `costBasis` | 可比较口径为 `per-task` |
| `currency` | `USD` 或 `CNY`；系统不自动换汇 |
| `evaluatedAt` | 真实存在、含时区的 ISO 时间，如 `2026-11-01T08:00:00Z` |
| `source.name` | 来源名称，至多 500 字 |
| `source.type` | `demo` 演示、`internal` 自建、`third-party` 第三方 |
| `source.url` | `http://` 或 `https://` 来源链接，或 `null`；第三方缺少链接时不参与比较 |
| `notes` | 可选，数据解释与限制，至多 4000 字 |

非目标 `aggregation`、`durationBasis` 或 `costBasis` 允许保存用于待对齐数据展示；对应快照的记录不参与计算。

| records 字段 | 含义与要求 |
| --- | --- |
| `id` | 同快照内唯一，格式同快照 id |
| `model`, `version` | 模型及明确版本；必须为非空文本，每项至多 200 字 |
| `agent`, `provider`, `reasoning` | Agent、供应商 / 使用渠道提供商、推理强度（无推理档位可填 `none`）；每项必须为非空文本，至多 200 字 |
| `channel` | `api` 或 `subscription` |
| `quality` | 0 至 `scoreMax` 的有限数值；缺失填 `null` |
| `cost` | API 每任务平均费用，0–1000000；缺失填 `null`；订阅记录必须为 `null` |
| `duration` | 每任务平均完整耗时，单位**秒**，大于 0 且至多 31536000；缺失填 `null` |
| `sampleCount` | 有效样本数，1–10000000 的整数；缺失填 `null` 并排除比较 |
| `notes` | 可选的配置备注，至多 4000 字 |

`quality`、API `cost`、`duration` 或 `sampleCount` 缺失时保留记录但单列原因。零费用是有效数据，不等于缺失。JSON 数值不能用字符串或布尔值代替。失败任务的费用和耗时同样计入均值。

## CSV

采用 UTF-8，支持 BOM、CRLF、引号包裹、双引号转义和引号内换行。表头见 [`examples/benchmark-template.csv`](../examples/benchmark-template.csv)。

每一行重复快照元数据（`benchmarkId`、`benchmarkName`、`scenario`、`taskSet`、`scoring`、`scoreMax`、`aggregation`、`durationBasis`、`costBasis`、`currency`、`evaluatedAt`、`sourceName`、`sourceType`、`sourceUrl`），再提供上述配置字段。`sourceUrl`、`notes` 列可省略；其他列必须出现，缺失数值单元格留空。

同一 `benchmarkId` 各行的快照元数据必须完全一致，否则整批拒绝；不同 id 独立保存。CSV `notes` 是配置备注，快照级备注请使用 JSON。

## HTTP API

同源调用，不设置跨域开放。成功返回 JSON，下载端点除外；失败返回 `{ "error": "说明", "details": [] }`，使用 400 / 403 / 404 / 409 / 413 / 415 / 422 状态码。服务端内部异常返回 500。

| 方法与地址 | 行为 |
| --- | --- |
| `GET /api/health` | 服务状态及版本 |
| `GET /api/catalog` | 场景、快照元数据、可用渠道、配置计数、最近 20 次导入历史 |
| `GET /api/analyze` | 约束分析、三目标前沿、支配示例、推荐与排除原因 |
| `GET /api/report` | 同一分析结果的 Markdown 附件 |
| `GET /api/datasets/:id` | 完整快照 JSON 附件，保留缺失指标 |
| `GET /api/template?format=json` | 演示 JSON 模板；`format=csv` 返回 CSV |
| `POST /api/import/preview` | 检查格式与重复 id，返回可比计数及排除原因，不写入 |
| `POST /api/import` | 重新检查并以事务整体写入，返回 201 和已导入 id |

分析 / 报告查询参数：

| 参数 | 默认 / 含义 |
| --- | --- |
| `benchmark` | 缺省使用评测时间最新的快照；评测时间相同则优先最近导入，建议明确传入 id |
| `channel` | `api`；也可为 `subscription` |
| `maxCost` | 缺省 / 空为不限；0 为零预算，上限 1000000 |
| `maxDuration` | 缺省 / 空为不限，单位秒，上限 31536000 |
| `minQuality` | 默认 0，上限为快照 `scoreMax` |
| `preference` | 默认 `balanced`，或 `quality`、`cost`、`speed` |
| `monthlyPrice` | 默认 20，订阅均摊的用户月费假设，沿用快照币种 |
| `monthlyTasks` | 默认 400，1–1000000 的整数 |

导入请求使用 `Content-Type: application/json`：

```json
{
  "format": "json",
  "fileName": "benchmark.json",
  "text": "原始 JSON 或 CSV 文件文本"
}
```

请求体总上限 4 MiB，解码后的文件文本上限 2 MiB。批次中任一记录格式错误、元数据冲突或 id 已存在均整批拒绝；合法但指标不完整的记录会保存并注明排除原因。

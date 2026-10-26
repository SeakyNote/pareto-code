# 哪些已有评测数据能够支持模型配置的可信比较？

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: /root/benchmark_evidence
Blocked by:

Parent: [MVP 决策地图](../map.md)

## Question

在不新增付费模型调用的约束下，调查公开且实际可取得的编码评测数据，确定哪些来源能支持“模型及其调用配置”的比较，哪些证据缺口会限制 MVP 的效果、费用和耗时评价。

至少核实几个有代表性的第一方来源，跟踪到可下载数据或实际记录样例，区分“网页展示分数”与“可导入记录”。逐项记录：编码任务类别、模型与配置标识、评估方法、执行方式/代理与工具环境、样本量、时间、费用/用量/价格口径、耗时、下载方式、许可或使用条款。缺失信息明确写未知，禁止按印象补齐。

指出哪些结果能在同一比较组内使用、哪些只能单独展示；费用重估、缺少耗时、无法识别配置或执行环境等情况应给出事实依据和候选应对路径，最终产品取舍留给后续人工决策。

研究只读获取公开资料，不创建付费服务、不调用收费模型、不为获得数据注册账号。用中文写一份有逐项来源链接的研究笔记，标明查证日期。按 research 技能使用后台研究代理。

## Comments

绘图时创建；本票只解决数据事实调查，不替用户决定首个任务范围或指标规则。

2026-10-26：已认领，交由后台研究代理查证。成果预期位于 `../research/existing-evaluation-data.md`，分支预期为 `research/pareto-mvp-evidence`；完成后必须用实际路径和提交标识更新，不把预期写成已完成。

## Answer

2026-10-26：已查证 Aider polyglot、LiveCodeBench、BigCodeBench、SWE-bench Verified 的第一方文档和实际可获取记录。详细字段、来源链接、许可标识、时间范围、抽查范围及未知项均保存在[已有编码评测数据的可导入性与比较边界](../research/existing-evaluation-data.md)。

- Aider 的官方 YAML 提供历史效果、整轮费用和平均每题耗时，以及配置/版本等字段；所查文件的最新评测日期是 2025-10-03，含缺失或零费用及未完成案例。历史成本与调用计时不能解释为当前任务的准确报价或总耗时。
- LiveCodeBench 的公开生成样例可下载；已查样例的 `execution time` 是生成代码的测试运行时间，不能充当模型生成延迟。
- BigCodeBench Full/Hard 官方结果表可下载为 Parquet，各 202 条记录，但表结构没有费用或生成延迟；只凭榜单效果不能还原每任务成本。
- SWE-bench 有任务级结果、配置与轨迹，可供来源追溯，但代理、版本、预算和实际模型服务需要核对；零成本轨迹及不明确的计时不能被当成完整三维证据。

研究资产已保存到独立分支 `research/pareto-mvp-evidence`，提交 `0a60cdfa23ce2b5c969dfe7010e5554d2daaa57e`；已成功推送到 `origin`。[远程固定版本研究笔记](https://github.com/SeakyNote/pareto-code/blob/0a60cdfa23ce2b5c969dfe7010e5554d2daaa57e/.scratch/pareto-mvp/research/existing-evaluation-data.md)。只提交该研究笔记，未创建 PR、未合并主分支；同份笔记保留在当前工作区供本地地图使用。

未解决的产品决定：首个任务类别、采用哪些来源、接受怎样的历史/缺失数据、比较组和维度的定义。这些分别留给[首个编码任务与选型需求](02-first-task-scope.md)、[比较口径与指标含义](03-comparison-and-metrics.md)和[导入与证据契约](05-import-and-evidence.md)，本研究未代用户选择。

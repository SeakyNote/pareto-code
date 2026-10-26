# Aider 初始历史证据的严格准入核验

查证日期：2026-10-26。当前契约参考主工作树[导入与证据契约](../issues/05-import-and-evidence.md#answer)；本研究不修改契约、不运行模型评测、不产生付费调用。研究分支从 `main` 创建，仅保存研究资产；工作树中的最新决策票和词汇表是只读上下文，不随研究分支提交。

## 结论及计数边界

**本次检查未能证明“至少一个严格比较组、两个不同合格候选”的初始数据门槛已达到。** 在逐运行深查的三条 GPT-5 汇总记录中，可认证严格比较组为 **0**、合格候选为 **0**、合格评测运行为 **0**。这里的零表示这些已检查资料不足以完成当前契约的认证，不表示评测没有发生、结果造假或所有公开资料都不存在合格组。

三条资料直接报告不同推理强度的模型配置、明确运行目录标识、相同 Aider 提交和完整题数，以及齐全的历史三维值；它们是 **三个待补证的配置记录/运行**。仍缺逐运行关联的题集版本及完整题目范围、实际尝试与反馈规则、完整有效调用配置。不能以同为 225 题、同一 Aider 提交、默认两次尝试或目录命名填补这些缺口。[固定汇总来源](https://github.com/Aider-AI/aider/blob/cb6a152e5ee27fbc77ac499d5e628ccd74a5fa2a/aider/website/_data/polyglot_leaderboard.yml#L1715)

全量 69 条 YAML 记录做了字段层检查，但只有下列三条做了本次关联资料深查；没有给其余 66 条做逐运行准入认证。来源网页及搜索只用于找第一方入口，第三方重述不作为补证。

## 实际检查对象与来源留存

原始文件留存在 [initial-evidence-sources](initial-evidence-sources/manifest.json)，逐文件包含下载 URL、获取时间、字节数和 SHA-256。下载内容原样保存；历史代码和 README 的 Git blob SHA-1 另与固定 Aider 树核对一致。来源快照用于复核，不是正式产品导入数据。

| 对象 | 固定版本或实际检查范围 | 核验用途 |
| --- | --- | --- |
| [官方 polyglot YAML](initial-evidence-sources/polyglot_leaderboard.yml) | `cb6a152e5ee27fbc77ac499d5e628ccd74a5fa2a`；45,725 字节；69 条 | 全字段检查、三条运行逐值定位 |
| [历史 benchmark 代码](initial-evidence-sources/benchmark-32faf82.py) | `32faf82b31c54d6f19c5c3d63bc294f748bd3e72` | 配置、效果、费用、计时、日期及简略命令的生成机制 |
| [历史运行说明](initial-evidence-sources/benchmark-readme-32faf82.md) | 同一 Aider 提交 | 沿官方说明寻找题集与逐运行结果入口 |
| [榜单页面源码](initial-evidence-sources/leaderboard-index.md)、[指标/费用说明](initial-evidence-sources/leaderboard-notes.md)、[基准介绍](initial-evidence-sources/polyglot-description.md) | `cb6a152e5ee27fbc77ac499d5e628ccd74a5fa2a` | 页面详情是否另有逐运行证据、历史价格限制、题集入口 |
| [high 发布提交](initial-evidence-sources/gpt5-high-update.json) | `bfef1906bb036f7db0d618e789e299dffdc493ca` | 确认发布改动是否附运行资料 |
| [medium/low 发布提交](initial-evidence-sources/gpt5-medium-low-update.json) | `54b266f2895c5023470d712ad7d51df1b545560c` | 同上 |
| [rungrid](initial-evidence-sources/benchmark-rungrid-32faf82.py)、[rsync](initial-evidence-sources/benchmark-rsync-32faf82.sh) | `32faf82b31c54d6f19c5c3d63bc294f748bd3e72` | 检查 benchmark 目录中的运行/资料流转线索；均未关联三次 GPT-5 运行 |
| Aider 历史树 | 同上，765 个路径，API `truncated=false` | 路径级查找三次运行及结果/对话文件入口，不是读取所有文件内容 |
| 题集树及[题集 README](initial-evidence-sources/polyglot-readme.md) | 本次解析的 `7e0611e77b54e2dea774cdc0aa00cf9f7ed6144f`，3,646 个路径，`truncated=false` | 沿官方题集入口检查；不能将当前树倒推为 2025 年运行时题集 |

树响应没有全量随附，保存了[可复查的派生检查摘要](initial-evidence-sources/tree-inspection.json)：固定 API、原响应指纹、路径数量、截断状态、实际搜索条件和命中路径。搜索条件为 `gpt-5`、`gpt5`、`.aider.results.json`、`.aider.chat.history`、`tmp.benchmarks`，这两个树内均没有对应路径命中。此结论限于路径检查，不能证明其他文件正文或其他资产库没有结果。独立网页精确搜索三次运行目录名没有提供新的第一方逐运行资料；搜索未命中不作为不存在的证明。

主要内容指纹：

| 文件 | SHA-256 |
| --- | --- |
| `polyglot_leaderboard.yml` | `85a50b25953512d18ba4bb0c23c0b8e626fcf9a5b52d287644b8a0b44b9535de` |
| `benchmark-32faf82.py` | `ba350b7b3ebcc9da6f588c0724dade552791b3c5edd9f16641eadb5931de9c30` |
| `benchmark-readme-32faf82.md` | `c87a9cd84c1d55a0d5e3d3b7d61e65d83c0dd6f66fe12310bfd37c5994d22074` |

其余快照指纹及 UTC 获取时间见 manifest。快照沿用第一方原文，Aider 的 Apache-2.0 [许可副本](initial-evidence-sources/LICENSE.txt)一并保留；没有复制练习题或模型生成代码。题集 README 自行说明其 Exercism 来源，不将 Aider 许可扩展为所有练习内容的许可结论。

## 逐运行证据矩阵

“直接”指汇总明确报告；“关联机制”指匹配其 Aider 提交的代码可解释字段含义，但不独立重现这次运行；“未知”指本次未找到满足契约的逐运行证明。

| 栏目 | GPT-5 high | GPT-5 medium | GPT-5 low | 证据状态 |
| --- | --- | --- | --- | --- |
| 来源内运行标识 `dirname` | `2025-08-23-15-47-21--gpt-5-high` | `2025-08-25-13-23-27--gpt-5-medium` | `2025-08-25-14-16-37--gpt-5-low` | 直接，三条分别定位；标识不是完整日志 |
| 原始文件行范围 | 1715–1742 | 1744–1771 | 1773–1800 | 本次原文件物理行号，优先按 dirname 定位 |
| 模型标签 / 调用名 | `gpt-5 (high)` / `openai/gpt-5` | `gpt-5 (medium)` / `openai/gpt-5` | `gpt-5 (low)` / `openai/gpt-5` | 直接；未单列解析后的提供商模型快照版本 |
| 推理强度 / 编辑格式 | high / diff | medium / diff | low / diff | 直接 |
| 其他有效采样设置、覆盖文件、参数不适用依据 | 未知 | 未知 | 未知 | 不能把缺列当默认或不适用 |
| Aider 提交 / 版本 | `32faf82` / `0.86.2.dev` | 相同 | 相同 | 直接；短提交已解析为上表完整 SHA |
| 题集及其版本 | polyglot 场景；运行时版本未知 | 相同缺口 | 相同缺口 | 官方介绍可说明场景，未与每次运行绑定题集提交 |
| 完整题目范围 | 未提供逐运行题目清单或其固定引用 | 相同缺口 | 相同缺口 | 225 个相同数量不证明题目内容/版本一致 |
| 实际最大尝试次数 / 反馈机制 | 未知 | 未知 | 未知 | 有两轮成绩列及代码机制，仍缺实际运行设置关联 |
| 完成题数 / 总题数 | 225 / 225 | 225 / 225 | 225 / 225 | 直接；数量完整，题目范围证明仍不足 |
| 最终通过题数 / 报告比例 | 198 / 88.0% | 195 / 86.7% | 183 / 81.3% | 直接；按一位小数检查舍入一致 |
| 历史整轮费用 USD | 29.0829 | 17.6930 | 10.3713 | 直接，正值；来源报告，未独立复算 |
| 平均调用秒数 | 194.0 | 118.7 | 62.4 | 直接，指标含义由历史代码关联解释 |
| 来源评测日期 | 2025-08-23 | 2025-08-25 | 2025-08-25 | 直接；代码由运行目录日期生成，非本次采集日期 |
| 准入结论 | 证据不足 | 证据不足 | 证据不足 | 均不进入前沿或选型建议 |

上述三条运行的字段和数值均来自[固定 YAML](https://github.com/Aider-AI/aider/blob/cb6a152e5ee27fbc77ac499d5e628ccd74a5fa2a/aider/website/_data/polyglot_leaderboard.yml#L1715)。本次原始快照共 1,856 行；网页工具渲染或去空行后的行号可能不同，所以保留 `dirname` 和文件指纹作为稳定定位依据。

## 已能解释的口径，及解释不能替代的证明

- 历史代码按完成结果累加费用与调用段时长，再除以完成数得平均秒数。调用段包围 `coder.run`，测试在段后执行；失败测试输出会成为下一次输入。这能解释历史指标是带反馈的调用过程汇总，不是独立采样 Pass@2 或整轮测试墙钟耗时。[统计及运行机制](https://github.com/Aider-AI/aider/blob/32faf82b31c54d6f19c5c3d63bc294f748bd3e72/benchmark/benchmark.py#L467-L618)、[运行循环](https://github.com/Aider-AI/aider/blob/32faf82b31c54d6f19c5c3d63bc294f748bd3e72/benchmark/benchmark.py#L847-L905)
- `tries` 默认 2，但允许参数改变；也可改题目子集、禁用测试、重放已有输出或加载模型设置。两轮成绩列和共同提交本身不能证明实际参数及全部条件一致。[实际可配置项](https://github.com/Aider-AI/aider/blob/32faf82b31c54d6f19c5c3d63bc294f748bd3e72/benchmark/benchmark.py#L160-L216)
- 汇总的 `command` 是重新拼出的 `aider --model …`，不是原始 benchmark 命令；不能据其中缺少参数推断未设置。日期取目录名，汇总中的 Aider 版本从代码提交解析；都应保留其来源含义。[生成机制](https://github.com/Aider-AI/aider/blob/32faf82b31c54d6f19c5c3d63bc294f748bd3e72/benchmark/benchmark.py#L548-L612)
- README 让操作者分别克隆 Aider 和题集；没有将某次运行绑定到题集 SHA。README 声称汇总包含运行设置，但本次实见 YAML 没有题集版本、`tries` 或温度列，不能用说明文字补齐未记录的逐运行事实。[准备及报告说明](https://github.com/Aider-AI/aider/blob/32faf82b31c54d6f19c5c3d63bc294f748bd3e72/benchmark/README.md)
- 官方价格说明接受历史运行时的来源报告值，同时明示价格可能变化且准确性有限。三条正费用不涉及零费用补证问题；没有复算并不单独导致拒绝，当前拒绝原因是其他必需证据缺失。[费用说明](https://github.com/Aider-AI/aider/blob/cb6a152e5ee27fbc77ac499d5e628ccd74a5fa2a/aider/website/docs/leaderboards/notes.md)

## 沿第一方链接补查的结果

1. 榜单详情由同一 YAML 的键值渲染，展开详情没有新增逐运行日志链接或题目清单，不能当成独立补证来源。[页面源码](https://github.com/Aider-AI/aider/blob/cb6a152e5ee27fbc77ac499d5e628ccd74a5fa2a/aider/website/docs/leaderboards/index.md)
2. [high 的发布提交](https://github.com/Aider-AI/aider/commit/bfef1906bb036f7db0d618e789e299dffdc493ca)和[medium/low 的发布提交](https://github.com/Aider-AI/aider/commit/54b266f2895c5023470d712ad7d51df1b545560c)各自只改 YAML，没有附逐题结果、题集提交或完整配置。前者父提交恰是报告的 `32faf82…`，后者父提交为前者；这确认发布链，不能确认每次评测的独立题集状态。
3. 历史代码会在运行目录内保存 `.aider.results.json` 和 `.aider.chat.history.md`，README 说明目录位于 `tmp.benchmarks`；这些是可继续索取的具体证据类型。本次检查的历史仓库树没有找到相应路径，未进入维护者机器或私有存储，也没有为寻找资料注册账号。[结果保存代码](https://github.com/Aider-AI/aider/blob/32faf82b31c54d6f19c5c3d63bc294f748bd3e72/benchmark/benchmark.py#L943-L974)
4. 官方基准介绍链接至独立题集仓库；本次固定的题集 README 反向链接到博客和 harness，没有给三次 GPT-5 运行提供题集版本对应关系。取得当前题目清单即使恰有 225 题，也不能代替历史运行关联。[题集 README](https://github.com/Aider-AI/polyglot-benchmark/blob/7e0611e77b54e2dea774cdc0aa00cf9f7ed6144f/README.md)

## 可供后续人工决策使用的事实

严格门槛保持不变，现有这三条只能保存查看。要认证它们，需取得与这些 `dirname` 明确关联的历史记录：

- 题集固定提交及运行时内容范围；若有本地改动，需能识别实际内容，单纯题数不够。
- 原始运行命令、配置或可信逐运行说明，覆盖最大尝试次数、测试与反馈规则、是否重放以及有效模型配置和参数依据。
- 来源报告的模型版本/调用身份依据；必要时说明别名在该次运行中的含义，不能把本次查到的别名解释回填成历史事实。
- 原始逐题结果/对话或发布者补充说明可作为关联证明的途径；按当前契约它们不是一律必需，可靠且明确关联的第一方证据也可使用。

后续可以决定是否向资料持有人取得补证、寻找另一批有完整证明的既有运行，或重新讨论范围/契约。但本研究不替用户选路径，不发送联系消息，不新增付费评测，也不把无法证明的前提改写为已满足。上述事实足以回答本研究问题；初始数据未达门槛不等于研究未完成。

## 研究交付记录

研究资产位于 `.scratch/pareto-mvp/research/initial-evidence-verification.md` 及 `initial-evidence-sources/`；独立分支 `research/pareto-mvp-initial-evidence`，工作树 `/tmp/pareto-mvp-initial-evidence-research`。提交与推送结果由研究票的 Comments 记录，避免研究文件包含自身提交哈希的循环依赖。不开 PR、不合并，也不提交主工作树中的票据、地图或词汇表。

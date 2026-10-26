# 已有编码评测数据的可导入性与比较边界

查证日期：2026-10-26。研究范围：Aider polyglot、LiveCodeBench、BigCodeBench、SWE-bench Verified 的第一方公开资料与实际记录。只读下载，无账号注册、付费调用或评测执行。下文“事实”来自所链接资料或本次文件检查；“推断”用于提示后续决策，不代表用户已经选定方案。

## 结论与证据矩阵

存在不新增模型调用即可导入的评测结果。四类来源提供的信息并不等价：Aider 有较完整的历史效果、费用和每题耗时记录；BigCodeBench 的现成结果表缺少费用与生成延迟；LiveCodeBench 的样例含生成代码的测试执行时间，不能将其当模型响应速度；SWE-bench 必须核对代理、配置和实际轨迹。具体依据见各节。

| 来源 | 实际可取得的记录 | 效果证据 | 费用证据 | 时间证据 | 首要比较边界 |
| --- | --- | --- | --- | --- | --- |
| Aider polyglot | 官方 YAML 汇总记录 | 完成案例中的通过比例 | 历史整轮费用；部分缺失或零值 | 每案例平均调用过程耗时 | 编辑方式、Aider 版本、完成案例、模型配置 |
| LiveCodeBench | 官方样例 JSON 与题目 JSON | 每题各样本是否通过 | 已检查样例没有 API 用量/费用 | `execution time` 是代码执行时间 | 发布版本、日期窗口、采样数、温度、场景 |
| BigCodeBench | 官方 Full/Hard 结果 Parquet | Complete / Instruct 的校准 Pass@1 | 结果表没有该列 | 结果表没有该列 | Full/Hard、Complete/Instruct、评估版本和提示方式 |
| SWE-bench Verified | 提交元数据、结果 JSON、日志与轨迹 | 测试通过后判定的 issue 解决结果 | 每条轨迹是否可靠记录需查证 | 示例没有明确的任务总延迟字段 | 同一代理/版本、预算、尝试数、模型配置、500 题分母 |

## Aider：已有历史三维记录，不能直接承诺当前价格与延迟

**事实。** [官方说明](https://aider.chat/docs/leaderboards/)将 polyglot 定义为 225 道、覆盖六种语言的 Exercism 编辑任务。[原始 YAML](https://raw.githubusercontent.com/Aider-AI/aider/cb6a152e5ee27fbc77ac499d5e628ccd74a5fa2a/aider/website/_data/polyglot_leaderboard.yml)可匿名下载，包含模型、命令、编辑格式、推理强度（非所有行都有）、版本、提交、日期、案例数、通过率、费用和每案例秒数。本次快照有 69 条记录，评测日期为 2024-12-21 至 2025-10-03；这是该文件的覆盖范围，不是全行业或所有新模型的覆盖范围。

下面三条来自同一 YAML，编辑格式均为 diff、Aider 提交均为 `32faf82`、版本均为 `0.86.2.dev`，完成案例均为 225。它们只展示已有字段，不构成当前模型购买建议。

| 配置 | 评测日期 | `pass_rate_2` (%) | `total_cost` (USD) | `seconds_per_case` |
| --- | --- | ---: | ---: | ---: |
| gpt-5 (high) | 2025-08-23 | 88.0 | 29.0829 | 194.0 |
| gpt-5 (medium) | 2025-08-25 | 86.7 | 17.6930 | 118.7 |
| gpt-5 (low) | 2025-08-25 | 81.3 | 10.3713 | 62.4 |

**口径事实。** [统计代码](https://github.com/Aider-AI/aider/blob/main/benchmark/benchmark.py)以实际完成案例为通过率分母，将各案例费用相加，将累计调用过程时长除以完成案例数。代码在 `coder.run` 周围计时，单元测试在该计时段之后；这不是整个评测的墙钟耗时，也不是首 token 延迟。第二轮可接收第一次测试失败的反馈，因此 `pass_rate_2` 不能无条件改名为独立采样的 Pass@2。历史行应结合其记录的代码提交追溯；当前代码仅解释统计机制。

**缺口。** YAML 中有 `test_cases` 小于 `total_tests` 的记录，有未写 `total_cost` 的记录，也有零费用；其中一条零费用旁明确注释费用不正确。不能统一解释为“免费”。命令列也可能缺少独立保存的推理强度，不能只靠命令或展示名构造配置身份。部分记录是主模型与编辑模型组合，超出“单模型及调用配置”的直接解释，需要后续决定排除或单独分类。[记录依据](https://raw.githubusercontent.com/Aider-AI/aider/cb6a152e5ee27fbc77ac499d5e628ccd74a5fa2a/aider/website/_data/polyglot_leaderboard.yml)

**费用与许可事实。** [官方费用说明](https://aider.chat/docs/leaderboards/notes.html)明确采用评测运行时价格，且不保证当前或完全准确；不能将历史整轮费用标成用户下一次任务的报价。[仓库许可](https://github.com/Aider-AI/aider/blob/main/LICENSE.txt)为 Apache-2.0。本次只研究汇总记录，没有复制 Exercism 题目或评测生成内容；这些内容的再分发范围不由上述汇总记录调查确定。

**推断。** 在用户接受“历史、指定执行方式下的证据”这一价值边界时，可讨论导入其中配置较清楚、案例完整且费用可用的子集。共同版本与题数有助于比较，但仍不能证明运行日期、服务端负载或全部隐藏配置一致。若要按语言分组，当前汇总 YAML 本身不足以重算各语言成绩。

## LiveCodeBench：题目与历史输出可下载，代码执行时间不是生成延迟

**事实。** [官方运行说明](https://github.com/LiveCodeBench/LiveCodeBench)区分代码生成、代码执行、测试输出预测等场景，也区分发布版本、采样参数和时间窗口；版本题数会变化。[题目数据卡](https://huggingface.co/datasets/livecodebench/code_generation_lite)包含难度与题目日期，不能把某个窗口的成绩与另一窗口直接当同分母比较。

**下载验证。** 官方 README 指向的 [样例空间文件目录](https://huggingface.co/spaces/livecodebench/code_generation_samples/tree/main)中，`all_outputs.json` 为 284,487,753 字节，`problems.json` 为 1,552,205 字节。本次实际读取前者 64 KiB 并解析首条完整记录，完整读取后者：题目文件有 880 条，日期范围 2023-05-07 至 2025-01-04。这里的日期是题目日期，不是模型调用日期，也不能据此宣称它覆盖最新发布版本。

首条样例模型键为 `DeepSeek-R1-Preview`，题目记录包含 `code_list`、`pass1_list`、`metadata_list`；metadata 示例为 `{"execution time": 0.011070966720581055}`。官方 [展示程序](https://huggingface.co/spaces/livecodebench/code_generation_samples/blob/main/app.py)按同位置关联题目与输出。[判题实现](https://github.com/LiveCodeBench/LiveCodeBench/blob/main/lcb_runner/evaluation/testing_util.py)累计执行生成代码的时间并返回 `execution time`，所以不能把这个值用于模型生成延迟的前沿维度。

**未知与许可。** 已检查样例没有足够 API 输入/输出用量、调用价目或生成计时以还原费用和生成延迟；本次只抽查大文件开头，不声称扫描过全文件。代码仓库 [MIT 许可](https://github.com/LiveCodeBench/LiveCodeBench/blob/main/LICENSE)、[样例空间 README 的 MIT 标记](https://huggingface.co/spaces/livecodebench/code_generation_samples/blob/main/README.md)和[题目卡的泛化 `cc` 标记](https://huggingface.co/datasets/livecodebench/code_generation_lite)是不同对象；题目卡未清楚指明具体 CC 版本，不把代码许可扩展为所有题目内容的许可结论。

**推断。** 可作为单独场景的历史效果证据候选；仅凭这里核实到的字段，无法补出可靠的效果—费用—生成延迟三维记录。若另行取得同一次运行的用量/时间记录，应逐运行关联，不能拿另一基准的成本配上本基准分数。

## BigCodeBench：实际结果表可导入，成本与延迟仍为空缺

**事实。** [官方数据集](https://huggingface.co/datasets/bigcode/bigcodebench)为函数级 Python 任务，Full 有 1,140 题；[官方 README](https://github.com/bigcode-project/bigcodebench)另列 Hard 的 148 题以及 Complete/Instruct 两种输入方式。[榜单程序](https://huggingface.co/spaces/bigcode/bigcodebench-leaderboard/blob/main/app.py)将 Complete 和 Instruct 显示为各自校准的 Pass@1；Full 与 Hard 不应混作同一个比较组。

**下载验证。** 沿[榜单环境配置](https://huggingface.co/spaces/bigcode/bigcodebench-leaderboard/blob/main/src/envs.py)追到 [Full 结果](https://huggingface.co/datasets/bigcode/bigcodebench-results)与 [Hard 结果](https://huggingface.co/datasets/bigcode/bigcodebench-hard-results)。两表各 202 行，模式包含 `model`、`link`、`moe`、`size`、`act_param`、`type`、`complete`、`instruct`、`date`、`prefill`，没有费用、token 用量或生成延迟列。匿名读取 Full 的 rows API，首条模型 `Magicoder-S-DS-6.7B` 的 Complete/Instruct 为 47.6/36.2，说明取得的是可解析记录，不只是网页截图。`date` 的具体含义未在已检查数据卡中清晰定义，不能默认当评测运行日期。

本次还实际下载两个 Parquet 文件，均具有 `PAR1` 文件头：Full 12,503 字节、Hard 11,998 字节。[Full 下载](https://huggingface.co/datasets/bigcode/bigcodebench-results/resolve/08ceb6b15ecd9c0f7c82932e4e248208ffeeb9b4/data/train-00000-of-00001.parquet)、[Hard 下载](https://huggingface.co/datasets/bigcode/bigcodebench-hard-results/resolve/522a45334d838a87b421ac96db27b2ef7fc165bb/data/train-00000-of-00001.parquet)。

**其他资产与未知。** [v0.2.4 发布](https://github.com/bigcode-project/bigcodebench/releases/tag/v0.2.4)有 `sanitized_calibrated_samples.zip`（94,704,640 字节）；文件名与 README 提及的名称顺序不同，应以实际发布附件为准。本次核实发布 API 中的附件存在，没有下载或执行该压缩包，未确认其中所有模型配置和计费字段。仓库和题目卡标注 Apache-2.0，但上述独立结果数据卡没有单列明确 license 字段；结果表再分发范围仍需数据来源确认，不能仅借题目许可下结论。[仓库](https://github.com/bigcode-project/bigcodebench)、[结果卡](https://huggingface.co/datasets/bigcode/bigcodebench-results/blob/main/README.md)

**推断。** 可导入独立的效果比较组；若没有关联运行的用量与价格，不能从模型每百万 token 单价推得“每任务费用”，也不能把模型参数量当 API 成本。是否接受只有效果的记录，属于指标决策。仓库页面显示 2026-07-20 已归档，应把这当维护状态事实，不推定数据自动更新。

## SWE-bench Verified：任务结果可追溯，模型名不足以标识测量条件

**事实。** [Verified 数据卡](https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified)给出 500 个经人工验证的 Python 仓库 issue—PR 样本。它是仓库级修复，不等价于前述函数生成或练习编辑。[实验仓库说明](https://github.com/SWE-bench/experiments)说明：2026 年中之后的条目用 `metadata.yaml` 指向提交者公共资产仓库，旧条目仍可能指向公共 S3；说明称两者均无需凭据。

**实际样例。** 本次读取 [2026-09-01 条目元数据](https://github.com/SWE-bench/experiments/blob/main/evaluation/verified/20260901_mini-v2.4.2_gemini-3-5-flash/metadata.yaml)、[说明](https://github.com/SWE-bench/experiments/blob/main/evaluation/verified/20260901_mini-v2.4.2_gemini-3-5-flash/README.md)、[结果 JSON](https://github.com/SWE-bench/experiments/blob/main/evaluation/verified/20260901_mini-v2.4.2_gemini-3-5-flash/results/results.json)，再跟到提交者仓库的一条 [astropy 任务轨迹](https://github.com/john-b-yang/20260901_mini-v2.4.2_gemini-3-5-flash/blob/main/trajs/astropy__astropy-12907.traj.json)。条目报告解决 359/500，59 个实例没有生成补丁；不能把完成了生成的实例数当效果分母。元数据保存代理版本、尝试数、推理强度与模型标签。

**需要核对的事实。** 该轨迹记录 `instance_cost: 0.0`、`api_calls: 24`，同时配置 `cost_tracking: ignore_errors`，实际模型名含 `-fair` 后缀、使用代理 API 地址；因此零值不足以证明免费，展示模型名不足以复原实际服务配置。此条轨迹未提供明确的任务总延迟字段，本次未扫描全部轨迹，也不推定其他提交都缺少计时。元数据的提交标识可帮助追溯代理环境，但还需核对实际保存配置；不能仅因代理名相同就认为所有提交严格可比。[轨迹依据](https://github.com/john-b-yang/20260901_mini-v2.4.2_gemini-3-5-flash/blob/main/trajs/astropy__astropy-12907.traj.json)

**未知与推断。** 所查提交者资产树没有找到许可文件，Verified 题目卡也未明确整体数据许可；不据此断言禁止使用，记录为待核实。可以调查同一固定代理和任务集下的模型比较子集，但不能把不同代理的榜单表现全解释为模型差异，也不能据一条轨迹的成本重建整组费用。

## 给后续决策的事实输入

- 可讨论以 Aider 历史记录展示三维权衡，前提是明确执行方式、数据时效、费用可靠性与比较组；该方案仍待用户决定，不是本研究锁定的数据源。
- 若首个任务选择算法生成或函数生成，已检查到的效果数据可用，但费用与生成延迟未随之完备。可讨论收缩比较维度、只展示有证据的子集，或允许显式估算；不能用零填充缺失值。
- 历史费用可原样保留；若讨论当前价格重估，必须取得同运行的计费用量、缓存/推理等计费细分以及带日期的价目。现有聚合 token 数不必然足够。本次未研究供应商当前价目，不提供当前报价。
- “固定编码执行方式”是比较条件，不等于把完整工具作为产品选型对象；需要用户确认接受哪些执行方式作为证据适用边界。
- 对未覆盖的新模型、配置、任务类别和用户具体请求，现有来源不支持无依据地产生预测值。如何拒绝、降级或解释，留给任务范围、指标、导入与推荐票据。

## 复查指针与检查范围

| 已检查对象 | 版本或内容指纹 | 本次获取范围 |
| --- | --- | --- |
| Aider YAML | 最后修改该文件的提交 `cb6a152e5ee27fbc77ac499d5e628ccd74a5fa2a`；blob `1ddb905c42025459745ecbbbc4f07c82f5a1dd4e` | 整份 45,725 字节；检查字段、日期与异常样例 |
| BigCodeBench Full 结果 | HF revision `08ceb6b15ecd9c0f7c82932e4e248208ffeeb9b4`；Parquet SHA-256 `b2aa99eff40dd1c62d5038a85e90f473c01405cd34dfd9fb0d645fe107feb647` | 数据卡、rows API 两行、整个小型 Parquet 文件 |
| BigCodeBench Hard 结果 | HF revision `522a45334d838a87b421ac96db27b2ef7fc165bb`；Parquet SHA-256 `a1fe024c16f4fdac9ca7c6418d4bb47810c7c9d8fc4de1ff01c4cfea39b79615` | 元数据、整个小型 Parquet 文件 |
| LiveCodeBench explorer | [文件目录 API](https://huggingface.co/api/spaces/livecodebench/code_generation_samples/tree/main) | 完整题目文件、输出文件前 64 KiB、完整展示程序；未下载 284 MB 全量输出 |
| SWE-bench 示例 | [条目目录](https://github.com/SWE-bench/experiments/tree/main/evaluation/verified/20260901_mini-v2.4.2_gemini-3-5-flash) | 元数据、说明、完整结果 JSON、资产树、一条完整轨迹 |

所有链接按查证日读取。未将第三方汇总、厂商宣传分数或搜索摘要当作数据证据；没有复跑判题，因此本研究确认的是数据结构和来源可获得性，不是独立重现其成绩。

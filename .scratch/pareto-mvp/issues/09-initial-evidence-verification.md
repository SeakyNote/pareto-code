# 现有 Aider 历史资料能否证明至少一组两个候选满足严格准入？

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: Codex research agent
Blocked by: 05

Parent: [MVP 决策地图](../map.md)

Prerequisites: [导入哪些字段，怎样保存来源并处理不完整或冲突的记录？](05-import-and-evidence.md#answer)

## Question

核实首版真实初始数据能否达到至少一个严格比较组、两个不同合格候选的门槛。调查已有资料，不运行付费模型评测，不用默认配置、相同题数或相同工具提交代替逐运行证明。

从固定 Aider polyglot YAML 中已定位的 gpt-5 high/medium/low 三条记录开始，必要时检查其他可得记录与第一方运行资料。逐运行核实来源身份、模型及有效调用配置、题集版本及完整题目范围、Aider 版本/提交、实际测试反馈及最大尝试次数、完整完成题数、三维指标口径与可信费用、评测日期；关联固定来源及条目位置。

区分已直接证实、可由明确关联资料推出和仍未知的条件，记录来源快照及指纹。报告检查范围内可认证组数、不同候选数和运行数；不能将局部未找到证明夸大成所有公开数据不存在合格组。缺项记录逐条说明不足及可以继续寻找的证据。

成果为一份带第一方引用的研究笔记与逐运行证据矩阵，不是正式导入系统或最终产品数据集。若门槛无法证明，如实报告并指出仍需人工决策/获取的证据，不静默降低门槛。研究结论只回答资料能够证明什么，不替代用户调整范围或准入规则。

研究发现的资料获取及责任选择由[严格比较证据尚未获认证时，首版采用哪条数据获取路径？](10-evidence-acquisition-path.md)承接；本研究解决不等于真实数据验收通过。

## Comments

2026-10-26：已完成有限第一方资料调查，成果为 [Aider 初始历史证据的严格准入核验](../research/initial-evidence-verification.md)，附逐运行矩阵、实际检查范围、[来源快照与指纹](../research/initial-evidence-sources/manifest.json)及路径检查摘要。全量 69 条汇总做字段检查，三条 GPT-5 运行做关联资料深查；在这三条中可认证的严格组、合格候选、合格运行均为 0，表示本次资料不足以认证，不推断其他公开来源均无合格组。详细缺项和继续补证所需资料见研究笔记。

独立分支 `research/pareto-mvp-initial-evidence`，提交 `3cf18731c04ab688defda6093dba93eeca32bad7`，工作树 `/tmp/pareto-mvp-initial-evidence-research`。仅提交研究资产，未提交主工作树的票据、地图或词汇表；同份资产已复制至主工作树供本地阅读。验证了 12 份下载文件的 SHA-256/字节数、本地文档链接、69 条记录计数及三次运行的原文件位置。原始快照保持字节内容不变，包含来源自带空白；原创笔记与派生元数据的 diff 格式检查通过。

分支尚未推送：普通 `git push -u origin research/pareto-mvp-initial-evidence` 因沙箱代理连接失败；随后针对同一操作的自动审批拒绝，理由是未由可信证据确认具体远程目的地及向其外传项目内部上下文的授权。未绕过或再次尝试；若要发布，需用户明确授权向 `https://github.com/SeakyNote/pareto-code.git` 推送该研究分支。未开 PR、未合并；推送受阻不改变已完成的本地研究结论。票据由主代理复核后处理状态。

2026-10-26：主代理复核研究笔记、原始字段与历史统计代码，确认研究已回答限定范围内的资料可认证性；本票解决。远程推送仍待明确授权，不将本地研究完成写成已发布。

2026-10-26：用户回复“推吧”，明确授权向 `https://github.com/SeakyNote/pareto-code.git` 发布已准备好的研究分支。执行 `git push -u origin research/pareto-mvp-initial-evidence` 成功，远程分支已创建并设置 upstream，发布提交为 `3cf18731c04ab688defda6093dba93eeca32bad7`。此前推送阻碍已解除；[远程研究分支](https://github.com/SeakyNote/pareto-code/tree/research/pareto-mvp-initial-evidence)仅保留研究资产，未开 PR、未合并。

## Answer

2026-10-26：本次检查未能认证初始数据已达到至少一组、两个不同合格候选的门槛。全量 69 条固定 YAML 记录仅做字段检查；对 gpt-5 high/medium/low 三次运行做了关联资料深查，在这三条范围内认证严格组 0、合格候选 0、合格运行 0。

三条记录有明确来源运行标识、相同 Aider 提交、225/225 题、推理强度及完整三维报告值；但仍缺逐运行绑定的任务集版本与完整题目范围、实际尝试/反馈设置、完整有效模型配置证明。两次官方发布提交只改汇总文件，榜单详情未提供额外独立证明。结论是本次资料不足以认证，不是全网不存在合格组，也不否认评测发生或来源报告值。

完整逐运行矩阵、检查对象、第一方引用及下一步所需材料见 [Aider 初始历史证据的严格准入核验](../research/initial-evidence-verification.md)，原始资料见[来源快照与指纹](../research/initial-evidence-sources/manifest.json)。独立分支和提交、远程推送实际阻碍见上方 Comments。

沿用既定准入与至少一组两个候选的验收门槛；这三条暂仅供查看。获取证据的路径与责任由[严格比较证据尚未获认证时，首版采用哪条数据获取路径？](10-evidence-acquisition-path.md)与用户讨论；本票不替用户选路径或修改范围。研究完成不代表真实数据就绪，最终规格验收继续受数据门槛约束。

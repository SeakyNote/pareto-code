# 哪些验收场景足以证明 MVP 规格可以交给开发？

Type: grilling
Labels: wayfinder:grilling
Status: open
Assignee:
Blocked by: 04, 05, 06, 07, 09, 10

Parent: [MVP 决策地图](../map.md)

Prerequisites: [选型规则](04-pareto-and-selection.md)、[导入契约](05-import-and-evidence.md)、[使用流程](06-selection-experience.md)、[运行方式与技术边界](07-delivery-and-architecture.md)、[真实初始数据补证](09-initial-evidence-verification.md)、[证据获取路径](10-evidence-acquisition-path.md)

## Question

与用户共同核对所有前置决策，确定首版完成标准、验收数据与可观察结果，并检查是否还有实施前必须决定的问题。

至少核对：导入与来源追溯、比较组隔离、支配与非支配案例、约束无解、缺失数据、并列候选、建议理由，以及用户完成核心选型流程的标准。确认哪些要求必须满足，哪些明确延期。

依据[导入哪些字段，怎样保存来源并处理不完整或冲突的记录？](05-import-and-evidence.md#answer)，核验逐条校验与预览确认、单位/数值/题数一致性、重复导入与多次运行区分、同次运行冲突隔离、最新合格运行选择先于约束筛选、同日无法排序时明确选择、旧运行沿用原因、原文件及来源快照和修订追溯。最终必须有至少一个严格比较组和两个不同合格候选的真实证据；研究完成不自动表示门槛已满足，若仍有缺口，本票不能宣布规格就绪。假设数据仅可用于解释验收案例与交互讨论。

若没有未决关键问题，将已确认决策组织为本目录的 MVP 规格并链接回原票据，供用户确认共享理解；不在此拆分或执行实现任务。若发现新决策则增补票据及依赖，本票保持未解决。

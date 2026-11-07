# 确定预算约束下的前沿计算与推荐规则

Type: grilling
Labels: wayfinder:grilling
Status: open
Parent: ../map.md
Blocked by: 04

## Question

预算和最长执行时间怎样约束候选，前沿在什么集合内计算，多个可行前沿配置怎样生成可解释的推荐？

需决定数值相等与容差、约束边界、并列结果、无可行解、缺失数据的反馈，以及展示全局前沿还是约束内前沿。说明质量优先、费用优先或耗时优先是否作为显式偏好，避免暗中加入主观综合权重。

答案应包含可人工核对的小样例及预期结果，用于后续算法验收。

## Dependencies

以[数据可比条件与汇总口径](04-comparability.md)为计算契约。

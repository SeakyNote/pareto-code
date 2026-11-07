# 确定数据可比条件与费用耗时汇总口径

Type: grilling
Labels: wayfinder:grilling
Status: open
Parent: ../map.md
Blocked by: 01, 02, 03

## Question

所选数据应满足哪些条件才能进入同一帕累托比较组？多任务、重试、失败、缺失指标及不同时间的记录，如何形成配置级的效果、单次任务费用和完整执行耗时？

需确定来源与配置标识必填项、价格与币种口径、聚合方式、失败与重试的归属、缺失值处理及展示边界。不得静默拼接不同评测集的质量分数、公开单价和另一来源的耗时。

答案应给出最小数据契约和一组可比/不可比示例，而不是提前实现导入系统。

## Dependencies

依赖[数据路线](01-data-route.md)、[评分依据](02-quality.md)与[候选覆盖](03-candidates.md)。

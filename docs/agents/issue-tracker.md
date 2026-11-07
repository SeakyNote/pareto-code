# Issue tracker: Local Markdown

本仓库的任务与规格以 Markdown 文件保存在 `.scratch/`。

## 约定

- 每个功能一个目录：`.scratch/<feature-slug>/`。
- 规格文件：`.scratch/<feature-slug>/spec.md`。
- 实现任务：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，
  从 01 编号，每个任务独立一个文件。
- 分诊状态记录在任务文件顶部的 `Status:` 行，
  取值见 `docs/agents/triage-labels.md`。
- 评论与讨论追加到文件底部的 `## Comments` 下。

## 发布到任务跟踪器

在 `.scratch/<feature-slug>/` 下创建相应文件，按需创建目录。

## 获取相关任务

读取给定路径的任务文件。只有任务编号时，在对应功能目录下查找。

## Wayfinding 操作

- 地图：`.scratch/<effort>/map.md`，
  包含 Notes、Decisions-so-far、Fog。
- 子任务：`.scratch/<effort>/issues/NN-<slug>.md`，
  从 01 编号，正文记录待解决的问题。
- 类型：顶部 `Type:` 行取 research、prototype、grilling 或 task。
- 执行状态：`Status: claimed` 表示已领取，
  `Status: resolved` 表示已解决；这是 wayfinder 的执行状态。
- 阻塞关系：顶部 `Blocked by: NN, NN` 行列出依赖；
  所有依赖均 resolved 后才可开始。
- 前沿：按编号选择第一个未解决、无阻塞且未领取的任务。
- 领取：开始工作前写入 `Status: claimed` 并保存。
- 解决：在 `## Answer` 下追加答案，设置 `Status: resolved`，
  再将结论摘要和文件链接追加到地图的 Decisions-so-far。

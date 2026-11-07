# Domain Docs

本仓库采用 single-context 领域文档布局。

## 探索代码前阅读

- 根目录的 `GLOSSARY.md`。
- `docs/adr/` 中与当前任务相关的架构决策记录。

这些文件尚不存在时直接继续。
当领域术语或决策得到明确结论后，由 domain-modeling 技能按需创建。

## 文件布局

- `GLOSSARY.md`：项目领域术语。
- `docs/adr/NNNN-<decision>.md`：架构决策记录。

## 使用领域术语

任务标题、重构提议、假设和测试名称中的领域概念，
使用 GLOSSARY.md 定义的术语。

所需概念未收录时，判断它是否符合项目现有语言；
确有缺口则记录下来，交由 domain-modeling 处理。

## 标明决策冲突

提议与现有 ADR 冲突时，明确指出对应 ADR、
冲突内容及重新讨论该决策的理由。

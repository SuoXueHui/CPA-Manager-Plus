# 认证卡片套餐等级显示计划

## 目标

在 CPA Manager Plus 认证卡片头部独立显示 xAI 与 Codex 的明确套餐等级，不依赖额度加载或健康状态，也不从 `$0/$0` 等额度数据推断 Free。

## 阶段

1. [completed] 追踪认证列表数据契约、卡片渲染与现有套餐解析逻辑。
2. [completed] 先补卡片级失败测试，固定 xAI/Codex、字段缺失和零额度边界。
3. [completed] 最小实现套餐展示模型与卡片 badge。
4. [completed] 运行定向测试、type-check、lint、全量测试与生产构建。
5. [completed] Review 改动并更新 planning；由主代理统一提交、合并和发布。

## 约束

- 仅修改 CPA Manager Plus 前端，不修改 CLIProxyAPI Go 后端。
- xAI 只根据明确的套餐字段展示，字段缺失或不支持时不展示。
- Codex 复用现有 `plan_type`/`id_token` 解析链路。
- 套餐 badge 与额度状态、健康状态和启停状态相互独立。

## 错误记录

| 错误 | 次数 | 处理 |
|---|---:|---|

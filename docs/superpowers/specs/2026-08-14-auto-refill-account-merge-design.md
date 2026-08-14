# 自动补号账号合并与金额展示设计

## 目标
自动补号账号列表以“逻辑账号”为展示粒度。同一规范化完整邮箱的多个 OAuth 凭证合并一行，明确显示凭证数量与成员 ID；5h/7d 请求、Token、金额按成员凭证窗口统计求和，金额来自 Controller 已按模型价格计算的 `cost_micro_usd`，不做平均分摊。

## 数据流
Manager 账号列表请求携带 `grouped=true`，Controller 在分页前按 `provider + lower(trim(email))` 聚合；无完整邮箱时以物理账号 ID 回退。Controller 返回代表账号字段、`merged`、`credential_count`、`credential_ids` 及聚合后的 `usage_windows`。不改变默认未分组 API 和容量决策逻辑。

## UI
账号页增加固定口径说明；账号列显示合并徽标和凭证数；状态列显示成员状态摘要；金额列显示 5h/7d 的请求数、Token、`A $`，并在标题/提示中说明“所有凭证请求成本合计，不除以凭证数”。详情抽屉标题显示合并账号与凭证数，并列出成员 ID。

## 边界与测试
分页、筛选在 Controller 分组后执行；同一邮箱不跨页重复。邮箱大小写/空白差异合并，缺失邮箱不按 masked email 合并。新增 Controller SQL/DTO 测试与 Manager 前端聚合展示契约测试；运行 Go、Vitest、TypeScript build。

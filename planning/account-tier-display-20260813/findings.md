# 发现记录

- 实际前端仓库为 `CPA-Manager-Plus`，认证卡片位于 `apps/web/src/features/authFiles/components/AuthFileCard.tsx`。
- 卡片头部当前只渲染供应商、启停状态、Antigravity 套餐和故障/自动化状态，没有 xAI/Codex 套餐 badge。
- Codex 套餐数据已存在：`resolveCodexPlanType` 会读取根级 `plan_type`/`planType`、`id_token`、metadata 和 attributes。
- CLIProxyAPI 后端新增的 xAI 安全契约为根级 `xai_plan_type` 与 `xai_plan_source`；前端不得读取或显示 token。
- xAI 额度对象中的 `$0/$0`、月额度为零或额度请求失败都不能证明账号为 Free，套餐展示只能使用明确字段。
- 现有 locale 已包含 Codex `Free/Plus/Team/Pro/Pro 5x` 与 xAI `SuperGrok/SuperGrok Heavy` 文案，可复用；只需补通用套餐 badge 标题。

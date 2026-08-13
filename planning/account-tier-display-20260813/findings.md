# 发现记录

- 实际前端仓库为 `CPA-Manager-Plus`，认证卡片位于 `apps/web/src/features/authFiles/components/AuthFileCard.tsx`。
- 卡片头部当前只渲染供应商、启停状态、Antigravity 套餐和故障/自动化状态，没有 xAI/Codex 套餐 badge。
- Codex 套餐数据已存在：`resolveCodexPlanType` 会读取根级 `plan_type`/`planType`、`id_token`、metadata 和 attributes。
- CLIProxyAPI 后端新增的 xAI 安全契约为根级 `xai_plan_type` 与 `xai_plan_source`；前端不得读取或显示 token。
- xAI 额度对象中的 `$0/$0`、月额度为零或额度请求失败都不能证明账号为 Free，套餐展示只能使用明确字段。
- 现有 locale 已包含 Codex `Free/Plus/Team/Pro/Pro 5x` 与 xAI `SuperGrok/SuperGrok Heavy` 文案，可复用；只需补通用套餐 badge 标题。

- 套餐功能提交 `7cf0686a`、内嵌页面提交 `02137eaf`，与 usage-window 最终变更合并后的维护 fork `master=2cf66b31`。
- 最终生产 Manager 镜像为 `cpa-manager-plus:master-account-tier-usage-window-2cf66b31-amd64`，直接从合并后的 fork master 构建，避免后续并发发布覆盖套餐 badge。

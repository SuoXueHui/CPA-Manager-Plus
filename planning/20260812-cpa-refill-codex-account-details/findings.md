# Findings

- Manager 当前本地稳定分支为 `master@f084d7b9`，线上 Manager 镜像为 `cpa-manager-plus:master-cpa-refill-404-d2a4a870-amd64`，404 已修复。
- Controller 当前本地稳定分支为 `master@1743205`，线上镜像仍是通过门禁的 `cpa-refill-controller:shadow-7424456-amd64`。
- 线上 Controller 账号表当前有 Codex 71 个（disabled 67、unavailable 4）及 xAI 1 个 active；现有 overview 的 available_accounts 会把 xAI 算入，和“仅 Codex”新要求冲突。
- `auth_usage_hour_buckets` 已按 `auth_index` 聚合 token 和 `cost_micro_usd`，线上已有 4 个 Codex 账号 usage，可用来显示累计 token/金额，无需扫描 Manager 48 GiB 原始事件库。
- CPA `/v0/management/auth-files` 当前返回完整邮箱，但 Controller client 主动脱敏为 `EmailMasked`；用户明确允许完整账号后，应仅在 Admin Key 保护的 Controller 管理 DTO 中暴露完整邮箱，仍禁止任何 access/refresh/id token。
- CPA auth JSON 含 `expired` 字段，现有 auth-files API 没有直接返回它；可从 Codex `id_token.chatgpt_subscription_active_until` 或安全白名单字段补充过期时间，但必须避免下发 `id_token` 本身。
- 现有前端状态、模式、依赖信息和布尔值仍显示大量英文；需要在展示层做中文 label/value 映射，而非改 Controller 内部协议枚举。
- 采用两个独立分支：Manager `/Users/suo/.config/superpowers/worktrees/CPA-Manager-Plus/cpa-refill-codex-account-details-20260812`；Controller `/Users/suo/.config/superpowers/worktrees/cpa-refill-controller/codex-account-details-20260812`。
- 发布前复核确认：此前 `f76abdf6` 属于 CLIProxyAPIPlus 的独立页面，不是线上真实 CPA Manager Plus React 管理台；线上真实 Manager 分支 `944c0eb8` 只有设计文档，页面仍使用 `masked_email` 与英文状态值。
- Controller 最新独立 review 提出的 PostgreSQL RETURNING、历史 provider 归一化、Codex-only 容量与过滤顺序问题，已在当前 `20f0aec` 提交中修复并有测试覆盖。

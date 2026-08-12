# CPA 自动补号 Codex 账号明细增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让自动补号只管理 Codex 账号，并在中文管理页显示完整账号、累计 token/金额和生命周期时间。

**Architecture:** Controller 负责 Codex 账号事实、生命周期和有界 usage 聚合；Manager 保持显式代理和 UI 展示，不扫描大 SQLite 原始事件表。内部枚举保持英文协议值，前端统一中文化。

**Tech Stack:** Go 1.x、PostgreSQL、React/TypeScript、Vite/Vitest、SCSS、Docker Compose。

---

### Task 1: Controller Codex-only 账号快照与 schema

**Files:**
- Modify: `migrations/001_init.sql`
- Modify: `internal/cpa/client.go`
- Modify: `internal/cpa/client_test.go`
- Modify: `internal/store/accounts_reconcile.go`
- Modify: `internal/store/accounts_reconcile_test.go`
- Modify: `internal/store/migrate_test.go`

- [ ] 先写失败测试：CPA 白名单保留完整 `email` 和安全 `expires_at`，reconcile 只写 Codex，migration 包含可空 `email`。
- [ ] 运行 `go test ./internal/cpa ./internal/store -count=1`，确认因字段/过滤缺失失败。
- [ ] 最小实现：解析 Codex 白名单字段；非 Codex 从 reconcile 输入中过滤；SQL 写入 `email`、`imported_at`、`expires_at`。
- [ ] 重跑定向测试并提交 `feat: restrict refill accounts to codex`。

### Task 2: Controller 账号 usage 管理 DTO

**Files:**
- Modify: `internal/store/accounts.go`
- Modify: `internal/store/accounts_test.go`
- Modify: `internal/store/management.go`
- Modify: `internal/store/management_test.go`
- Modify: `internal/httpapi/management_integration_test.go`

- [ ] 先写失败测试：列表/详情返回 `email,total_tokens,cost_micro_usd,imported_at,expires_at`，overview 和列表均排除非 Codex。
- [ ] 运行 `go test ./internal/store ./internal/httpapi -count=1`，确认 SQL/DTO 缺字段失败。
- [ ] 最小实现：账号查询左连接按 `auth_index` 汇总的 `auth_usage_hour_buckets`；所有账号/容量入口加 Codex 条件；继续使用参数化 SQL和 keyset cursor。
- [ ] 重跑定向测试、`go test ./...`、`go test -race ./...`、`go vet ./...`、`go build ./cmd/controller` 并提交。

### Task 3: Manager 中文化和账号列

**Files:**
- Modify: `apps/web/src/features/cpa-refill/CPARefillPage.tsx`
- Modify: `apps/web/src/features/cpa-refill/CPARefillPage.module.scss`
- Modify: `apps/web/src/features/cpa-refill/cpaRefillWiring.test.ts`
- Modify: `apps/web/src/i18n/locales/zh-CN.json`
- Modify: `apps/web/src/i18n/locales/zh-TW.json`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/ru.json`

- [ ] 先写失败测试：账号列包含完整账号/token/金额/导入/过期，账号 provider 固定 Codex，中文状态映射存在。
- [ ] 运行定向 Vitest，确认页面仍使用 `masked_email` 和英文枚举而失败。
- [ ] 最小实现：字段列、格式化 helper、中文 value 映射、搜索提示和响应式宽度；其他语言保留兼容 key。
- [ ] 重跑定向测试和 type-check/lint。

### Task 4: 构建、内嵌同步与合并发布

**Files:**
- Modify generated: `apps/manager-server/internal/httpapi/web/management.html`
- Modify: `planning/20260812-cpa-refill-codex-account-details/*`
- Modify project knowledge only after live verification.

- [ ] Manager 全量运行 `npm test`、`npm run type-check`、`npm run lint`、`npm run build`、`npm run check:demo-isolation`；同步生产 HTML 后执行 Manager Go test/race/vet/build。
- [ ] 分别 review 两仓库 diff，确认无 token/cookie 字段、无大表扫描、无 N+1。
- [ ] 提交后合并各自 `master`，在合并结果重跑门禁。
- [ ] 本地构建 linux/amd64 镜像；线上先备份 Compose/inspect/migration 状态，再发布 Controller 和 Manager。
- [ ] 浏览器验证只显示 Codex 完整账号、token/金额/时间；检查日志、p95、CPU/RSS、restart/OOM，更新知识文档和回滚记录。

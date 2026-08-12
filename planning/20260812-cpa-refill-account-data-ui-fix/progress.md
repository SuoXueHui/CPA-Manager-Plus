# Progress

## 2026-08-12

- 已确认继续使用 Manager 分支/worktree `codex/cpa-refill-detail-drawer-fix-20260812`。
- 已检查 Manager 与 Controller 的 `AGENTS.md`、当前 Git 状态、上一轮详情抽屉修复和账号 API/列表字段。
- 已创建本轮独立 planning 目录并完成线上只读核对。
- 线上数据库确认：202 个 Codex 账号无一条过期早于导入；全部 `last_request_at` 为空，而 usage 桶已有约 9.5 亿 Token。
- 按 TDD 增加 Controller 聚合/存储/迁移失败测试与 Manager 共享 Select/中文字段失败测试，确认 RED 后实施。
- Controller 增加每批单语句的最后请求摘要更新和历史小时桶回填迁移；不进入 CPA 请求链路，不逐账号发 SQL。
- Manager 将状态、导入状态、事件级别、账号类型和策略模式下拉替换为共享 Select；补齐决策/详情中文字段和值映射，并区分 micro USD 与人民币分。
- Controller 全量 test/race/vet/build、Compose 静态校验与 diff-check 通过。
- Manager 前端 139 文件/1387 测试、type-check、lint、生产 build、demo isolation；后端全量 Go test/race/vet/build 与 diff-check 通过，内嵌 management.html 已与生产 bundle 同步。
- 线上迁移只读 EXPLAIN/ROLLBACK 约 12.95 ms、32 kB HashAggregate，Controller 约 11.31 MiB/384 MiB；未发布、未修改线上数据。
- 已发起独立代码审查；审查发现订单 amount 单位问题并已修正。
- 发布前新鲜门禁通过：前端 139 文件/1387 测试、type-check、lint、生产 build、demo isolation；后端全量 Go test/race/vet 与 `go build ./cmd/cpa-manager-plus`；内嵌 bundle SHA256 一致。
- 用户已授权合并与发布；准备提交本轮 Manager 改动并合并本地 `master`。

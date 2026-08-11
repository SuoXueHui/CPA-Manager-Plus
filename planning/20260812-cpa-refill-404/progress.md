# Progress

## 2026-08-12

- 已读取截图并在用户当前 Chrome 标签复现页面 404。
- 已通过 Manager access log 定位双前缀：`/v0/management/v0/management/cpa-refill/*`。
- 已确认服务端正确路径 `/v0/management/cpa-refill/*` 在线返回 200。
- 已从 `master@d65486d3` 创建独立分支 `codex/cpa-refill-404-fix-20260812` 和隔离 worktree。
- 已执行 `npm ci`，定向基线 2 个测试文件、5 个测试全部通过；npm 仅报告既有 Node 23 engine 警告和依赖审计告警，不属于本次回归。
- RED：将回归期望改为 management base 下的相对路径后，`cpaRefill.test.ts` 3 个测试按预期失败，实际值均带错误的 `/v0/management/cpa-refill/*`。
- 已实施最小修复：`cpaRefill.ts` 的 `BASE_PATH` 改为 `/cpa-refill`，服务端路由和其他 API client 行为不变。
- GREEN：自动补号定向 2 个测试文件、6 个测试全部通过，确认读写请求均使用 `/cpa-refill/*` 相对路径。
- 全量门禁通过：type-check、lint、139 个测试文件/1384 个测试、生产 build、demo isolation、Manager Server Go test/race/vet/build 和 diff-check。
- 已将生产构建同步到 `apps/manager-server/internal/httpapi/web/management.html`；bundle 不含旧完整前缀或双前缀。
- 功能分支 `30986b23` 已非快进合并到本地 `master@d2a4a870`；合并后 type-check/lint、139 文件 1384 测试、定向 Go test/vet 通过。
- 已构建并上传 linux/amd64 镜像，校验传输 SHA256 后仅 recreate Manager；新容器 healthy、0 restart、未 OOM，Controller/CPA 未重启。
- 用户当前 Chrome 标签已 reload：概览和账号页均正常，404 消失；线上 access log 从 reload 后只出现正确路径和 200。
- 已保留旧 Compose/container/image inspect 回滚材料，备份目录为 `/data/apps/cpa-manager-plus/backups/20260811T170702Z-cpa-refill-404`。
- 已更新 CPA Manager Plus 当前阶段、问题排查和变更记录；发布后 Manager health 约 1.1--1.3 ms，RSS 约 24 MiB，启动期后台工作暂占约 0.8--1 个 CPU core，未影响 Controller/CPA 容器状态。
- 最终资源复核确认 Manager CPU 已回落到约 `0.19%`、RSS 约 `21.5 MiB`；17:08 后 23 条自动补号 access log 全为正确路径和 200。

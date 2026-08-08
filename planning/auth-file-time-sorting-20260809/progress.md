# 认证文件时间排序进度

## 2026-08-09

- 已确认需求包含导入时间与最后请求时间两套排序。
- 已核对 CPA 原生时间字段和 Manager usage 数据，确认不能依赖认证 JSON 或短期请求桶。
- 已从 Manager `master` 创建分支 `codex/auth-file-time-sorting-20260809`。
- 当前阶段：设计与实现计划。
- 已定位 SQLite migration、Store repository 组合方式、collector fanout 和前端 usage-service API 扩展点。
- 基线验证通过：Manager Server `go test ./...`；前端 136 个测试文件、1373 个测试全部通过。
- 已写入设计说明和逐步实现计划，开始后端 TDD。

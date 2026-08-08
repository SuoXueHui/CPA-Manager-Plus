# 认证文件时间排序进度

## 2026-08-09

- 已确认需求包含导入时间与最后请求时间两套排序。
- 已核对 CPA 原生时间字段和 Manager usage 数据，确认不能依赖认证 JSON 或短期请求桶。
- 已从 Manager `master` 创建分支 `codex/auth-file-time-sorting-20260809`。
- 当前阶段：设计与实现计划。
- 已定位 SQLite migration、Store repository 组合方式、collector fanout 和前端 usage-service API 扩展点。
- 基线验证通过：Manager Server `go test ./...`；前端 136 个测试文件、1373 个测试全部通过。
- 已写入设计说明和逐步实现计划，开始后端 TDD。
- 仓储 RED：新测试因 `FileObservation`、`RequestActivity`、`New` 等未定义而按预期失败。
- 仓储 GREEN：新增 `auth_file_activity` migration/repository，验证导入时间不可覆盖、请求时间单调推进、scope 隔离和 rollup 回填。
- 聚焦验证通过：`go test ./internal/repository/authfileactivity ./internal/repository/sqlite ./internal/store`。
- usage worker RED/GREEN 完成，成功、失败、乱序和无身份事件测试通过。
- service/controller RED/GREEN 完成，时间回退、rollup 回填、鉴权和 API 响应测试通过。
- 前端 RED/GREEN 完成，时间归一化、活动合并、四种排序和 API 请求契约测试通过。
- 已补充旧版“仅文件名”请求与稳定 `auth_index` 的合并回归测试。
- 最终全量验证通过：Manager Server `go test ./...`、新增链路 `go test -race`、独立输出路径构建；前端 type-check、lint、137 个测试文件/1378 个测试和生产构建全部通过。
- `git diff --check` 通过；临时 Go 构建产物已清理，未把生成二进制加入工作区。
- 已检查项目 `AGENTS.md`，现有规则能够覆盖本次变更，无需修改。
- 已检查 Obsidian 项目知识目录；原目录不存在，已创建最小同步规则和本次接口/数据结构、变更记录。
- 当前阶段：实现与验证完成，等待选择合并、PR 或保留分支。

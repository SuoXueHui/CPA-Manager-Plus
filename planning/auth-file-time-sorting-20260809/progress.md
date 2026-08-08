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
- 已创建 `backup/master-pre-auth-file-time-20260809`，并将功能分支非快进合并到本地 `master`，合并提交 `206398f5`。
- 合并后的 `master` 再次通过 Manager 全量测试、相关包竞态测试、Go 构建，以及前端 type-check、lint、137 个测试文件/1378 个测试和生产构建。
- 发布前只读确认线上旧镜像为 `cpa-manager-plus:master-v1.11.12-6ce1140c`，容器 healthy、重启次数 0；数据库约 40 GiB，`auth_file_activity` 表尚不存在。
- 已在独立临时目录嵌入最新前端并交叉编译 Linux amd64 静态二进制；上传后完成 SHA256 校验和空数据库容器冒烟测试。
- 已创建线上回滚目录 `/data/apps/cpa-manager-plus/releases/master-auth-file-time-20260809-0121/`，保留旧 compose、inspect、镜像引用、data key 和旧镜像。
- 已发布 `cpa-manager-plus:master-auth-file-time-206398f5`；只重建 Manager 容器，CPA/CLIProxyAPI 未重启。
- 发布后容器连续健康、重启次数 0；外部 health/management 页面 200，活动同步接口 200，数据库新表存在。
- 已用真实 CPA 认证列表同步 593 个非 runtime 文件：593 个返回导入时间，499 个返回最后请求时间；没有输出或持久化认证内容。
- 线上面板 SHA256 为 `c023c1b9...127838`，与本地生产构建一致；排序键和新接口路径均已确认包含在面板中。
- 当前阶段：合并与线上发布完成。

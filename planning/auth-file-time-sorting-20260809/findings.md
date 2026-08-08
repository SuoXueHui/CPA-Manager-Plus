# 认证文件时间排序发现

## 当前实现

- 认证文件页面当前只有默认、名称、备注、优先级、套餐排序。
- CPA 认证列表返回 `created_at`、`modtime/updated_at` 和内存态 `recent_requests`。
- 文件存储加载认证时会把文件 `ModTime()` 同时赋给 `CreatedAt` 和 `UpdatedAt`，因此 CPA 重启后 `created_at` 不能作为严格导入时间。
- CPA `recent_requests` 以 10 分钟为桶，仅覆盖约 3 小时 20 分钟且不持久化。
- Manager `usage_events` 包含 `timestamp_ms`、`auth_index`、`auth_file_snapshot` 等认证身份快照，能确定精确请求时间。
- 原始请求数据会按既定策略清理，因此最后请求时间不能仅在查询时对 `usage_events` 做 `MAX(timestamp_ms)`。

## 选定方向

- 在 Manager SQLite 中增加轻量认证活动表。
- 认证列表被观察到时只写入一次导入时间；后续文件修改不覆盖。
- collector 收到 usage event 时以批量 upsert 方式推进最后请求时间。
- 页面读取活动数据后增加导入时间和最后请求时间排序。

## 代码落点

- SQLite 表结构统一在 `apps/manager-server/internal/repository/sqlite/migrate.go` 创建。
- `store.Store` 通过具体 repository 字段组合数据访问能力，适合新增独立 `authfileactivity` repository。
- usage collector 支持多个 `HandleUsageEvents` handler，通过 `worker.UsageEventFanout` 接线；活动更新可作为独立 worker 接入，不侵入现有自动禁用逻辑。
- Manager Server 已有受认证的 `/usage-service/*` API，前端 `usageServiceApi` 可增加活动同步接口。
- 认证文件前端列表继续从 CPA `/auth-files` 获取；活动接口只接收并解析非敏感的文件身份和时间元数据，不传认证内容。

## 实施结果

- 新增 `/usage-service/auth-file-activity`，由 Manager 面板认证保护。
- usage collector 在原始请求进入保留清理前更新 `last_request_at_ms`，成功和失败请求均计入。
- 页面会把 CPA 文件列表的 `created_at/modtime` 作为存量回填输入；Manager 一旦保存 `imported_at_ms` 后不再被修改时间覆盖。
- 兼容缺少 `auth_index` 的旧事件：先按文件名记录，后续发现稳定 `auth_index` 时合并，避免形成两个互相脱节的活动记录。
- 前端新增四种排序；导入时间未知值始终靠后，最久未用排序中从未请求值靠前。
- 前端生产构建仍输出 `apps/web/dist/index.html`；原生发布脚本会在打包工作目录中将该文件复制为嵌入式 `management.html`，无需把构建产物直接提交到源码树。
- 项目知识目录此前不存在，本次按长期维护需要创建最小同步规则，并记录新增接口、数据表和排序语义。

## 线上发布

- 功能分支已通过非快进合并进入本地 `master`，合并提交为 `206398f5`。
- 线上只重建 `cpa-manager-plus`；`cli-proxy-api` 容器未重启，仍保持原运行镜像和启动时间。
- 新镜像为 `cpa-manager-plus:master-auth-file-time-206398f5`；旧镜像 `cpa-manager-plus:master-v1.11.12-6ce1140c` 保留用于回滚。
- 回滚目录为 `/data/apps/cpa-manager-plus/releases/master-auth-file-time-20260809-0121/`，包含发布前后 compose、container inspect、镜像引用、data key 备份和产物摘要。
- 迁移只新增 `auth_file_activity` 表，不改写认证 JSON；发布后真实同步 593 个认证文件，全部获得导入时间，其中 499 个具有最后请求时间。
- 外部 `/health`、`/management.html` 和已鉴权活动同步接口均返回 200；线上面板 SHA256 与本地构建产物一致。

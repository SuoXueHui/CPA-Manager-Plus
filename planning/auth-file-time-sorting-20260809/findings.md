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

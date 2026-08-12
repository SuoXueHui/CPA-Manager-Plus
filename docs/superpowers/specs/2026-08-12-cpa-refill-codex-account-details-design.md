# CPA 自动补号 Codex 账号明细增强设计

## 目标与范围

自动补号只管理 Codex 账号。管理页以简体中文为主，账号列表直接显示完整账号、状态、累计 token、累计金额、导入时间、过期时间、最后请求时间；详情保留完整生命周期和事件。不改 Sub2API，不把 Controller 放入 CPA 请求链路。

## 方案选择

选择“Controller 作为账号事实源，Manager 作为管理展示与既有计价补充层”：

1. Controller 从 CPA auth-files 完整快照中只接收 Codex 白名单字段，持久化 `email`、导入/过期时间及 `auth_index`；非 Codex 不写入新快照，历史非 Codex 在列表和容量 SQL 中统一排除。
2. Controller 的账号列表/详情用左连接 `auth_usage_hour_buckets` 返回 `total_tokens`、`cost_micro_usd`，这是决策链路同口径的已聚合金额，不扫描原始 usage。
3. Manager 继续只代理 Controller 显式路由；前端把金额从 `micro USD` 格式化为美元，把内部状态和值映射成中文。

没有采用“Manager 直接扫 SQLite usage_events”的方案，因为线上数据库约 48 GiB，会增加磁盘 I/O 和查询延迟；也没有采用“浏览器并发请求 CPA auth-files + Controller”的方案，因为会扩大浏览器权限面并暴露不必要的 CPA 字段。

## 数据模型与接口

- `refill.auth_accounts` 增加可空 `email`；只存账号标识，不存 token/cookie。
- CPA `AuthFile` 白名单增加 `email`、安全解析后的 `expires_at`；Codex snapshot 把 `created_at` 映射为现有账号的导入基线，供应商交付仍以实际 `imported_at` 为准。
- Controller `GET /internal/v1/management/accounts` 和详情增加：`email`、`total_tokens`、`cost_micro_usd`、`imported_at`、`expires_at`。
- overview 的 `available_accounts` 和容量查询固定 `provider='codex'`。
- 搜索 `q` 支持完整邮箱、ID、CPA auth ID；筛选继续使用参数化 SQL、keyset cursor 和 50 条默认上限。

## 前端

- 账号列调整为：账号、状态、累计 Token、累计金额、导入时间、过期时间、最后请求、操作。
- 账号搜索提示改为“搜索账号、ID 或 CPA Auth ID”。provider 输入从账号页移除/固定 Codex，避免用户误以为支持其他账号。
- 状态、模式、依赖、原因、来源、导入状态、事件级别和布尔值优先显示简体中文；内部 API 值保持不变以兼容现有接口。
- 金额显示 `$x.xxxxxx`；token 使用本地千分位；空数据展示 `—`。

## 性能与故障边界

- 账号列表单条 SQL 左连接按 `auth_index` 已有主键聚合表；不做 N+1 请求。
- Controller 连接池、队列、资源硬限制不变；Manager 读超时仍为 5 秒。
- 新字段缺失时前端降级为 `—`；migration 可重复执行，发布前后兼容旧数据。
- 任何 CPA 快照/usage 缺失保持 observe/degraded，不影响 CPA 用户请求响应。

## 验证

- Controller：migration、Codex-only reconciliation、历史非 Codex 排除、usage 聚合、完整邮箱/过期时间 DTO、无凭据泄露测试。
- Manager：API 代理、中文映射、账号列、金额/token 格式化、筛选和 reset 回归。
- 全量 Go test/race/vet/build、Node test/type-check/lint/build、内嵌 HTML 同步。
- 线上：账号页只显示 Codex，完整邮箱和 usage 正确；Controller/Manager healthy、0 restart/OOM；对比 CPA health 和管理 API p95，确认无响应耗时回归。

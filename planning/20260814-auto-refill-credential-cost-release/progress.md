# 进度

- 2026-08-14：完成数据、后端与前端只读审计。
- 2026-08-14：账号分组、分页、合计金额和凭证成本 UI 已合并到 `master`。
- 2026-08-14：补齐逐凭证明细的请求数、Token、CPA Auth ID、状态降级、六位美元金额及移动端布局。
- 2026-08-14：定向前端 14/14、全量前端 1404/1404、type-check、lint、生产 build、demo isolation、bundle 一致性、Manager Server 全量 Go test 与 Go build 均通过。
- 2026-08-14：功能提交 `c0bc7e20` 已推送 fork `master`，仅重建生产 Manager 为 `cpa-manager-plus:refill-credential-breakdown-c0bc7e20-amd64`；旧镜像继续保留回滚。
- 2026-08-14：线上连续三次 health=200，Manager/Controller healthy、restart=0、OOM=false；50 个账号组中 28 个合并账号均返回逐凭证明细，5h/7d 请求、Token、金额聚合错配为 0。
- 2026-08-14：真实 Chrome 验证合并账号只显示一行，详情按凭证显示数据库 ID、CPA Auth ID、状态、5h/7d 请求、Token 和六位金额，页面控制台无错误。
- 2026-08-14：回滚目录 `/data/apps/cpa-manager-plus/releases/refill-credential-breakdown-c0bc7e20-20260814T051344Z/`。

# Findings

- 用户 Chrome 页面位于 `http://174.128.243.42:18317/management.html#/cpa-refill`，页面菜单和静态资源正常，但 overview 显示 `Request failed with status code 404`。
- 同一时段 Manager access log 明确记录浏览器请求为 `/v0/management/v0/management/cpa-refill/overview`，账号、决策、订单等页面请求也全部带重复前缀并返回 404。
- 服务器端真实契约 `/v0/management/cpa-refill/*` 已通过 localhost API 验证返回 200，因此故障位于前端 URL 与现有 API base 的组合，不是 Controller、网络、token 或 Manager 路由缺失。
- 修复必须在真实浏览器配置下覆盖“API base 已含 `/v0/management`”场景，不能只测试 service 常量字符串。
- `apiClient.setConfig()` 会通过 `computeApiUrl()` 将基础地址固定为 `<origin>/v0/management`；项目中其他 `apiClient` service 均使用 `/config`、`/auth-files` 等相对此 management base 的路径。
- `cpaRefill.ts` 独自把 `BASE_PATH` 写成 `/v0/management/cpa-refill`，现有 mock 测试也错误固化了这个重复前缀，解释了为何服务端直连测试通过而真实浏览器失败。
- 最小修复后生产 bundle 包含 `/cpa-refill`，不再包含 `/v0/management/cpa-refill` 或双前缀；Manager Server 仍在 apiClient base 层统一添加 `/v0/management`。
- 修复已合并到本地 `master@d2a4a870`，线上镜像为 `cpa-manager-plus:master-cpa-refill-404-d2a4a870-amd64`；仅 Manager 被 recreate，Controller 与 CPA 容器未重启。
- 用户原 Chrome 标签 reload 后，404 和“不可用”均消失；overview 显示 available account `1`、容量缺口 `0`、计划补号 `0`、队列 `0/4096`，账号页筛选与实际行可见。
- 浏览器 reload 后 access log 请求均为 `/v0/management/cpa-refill/*` 且返回 200；overview 约 2.4--3.4 ms、账号列表约 7.4 ms。17:07:17--17:07:47 的 3 条双前缀 404 来自旧页面 bundle 在 reload 前的残留轮询，17:08 后未再出现。
- Manager 重启后短时占用约 1 个 CPU core、RSS 约 20 MiB；CPA/Controller 状态与资源未受影响。需继续观察该既有 Manager 启动期后台工作是否按预期回落。
- 最终复核时 Manager 启动期 CPU 已回落到约 `0.19%`，RSS 约 `21.5 MiB`；17:08 后累计 23 条自动补号请求全部使用正确路径并返回 200，双前缀和非 200 均为 0。
- 回滚目录为 `/data/apps/cpa-manager-plus/backups/20260811T170702Z-cpa-refill-404`，旧镜像仍保留。

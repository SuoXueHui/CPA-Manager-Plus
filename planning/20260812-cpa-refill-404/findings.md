# Findings

- 用户 Chrome 页面位于 `http://174.128.243.42:18317/management.html#/cpa-refill`，页面菜单和静态资源正常，但 overview 显示 `Request failed with status code 404`。
- 同一时段 Manager access log 明确记录浏览器请求为 `/v0/management/v0/management/cpa-refill/overview`，账号、决策、订单等页面请求也全部带重复前缀并返回 404。
- 服务器端真实契约 `/v0/management/cpa-refill/*` 已通过 localhost API 验证返回 200，因此故障位于前端 URL 与现有 API base 的组合，不是 Controller、网络、token 或 Manager 路由缺失。
- 修复必须在真实浏览器配置下覆盖“API base 已含 `/v0/management`”场景，不能只测试 service 常量字符串。
- `apiClient.setConfig()` 会通过 `computeApiUrl()` 将基础地址固定为 `<origin>/v0/management`；项目中其他 `apiClient` service 均使用 `/config`、`/auth-files` 等相对此 management base 的路径。
- `cpaRefill.ts` 独自把 `BASE_PATH` 写成 `/v0/management/cpa-refill`，现有 mock 测试也错误固化了这个重复前缀，解释了为何服务端直连测试通过而真实浏览器失败。
- 最小修复后生产 bundle 包含 `/cpa-refill`，不再包含 `/v0/management/cpa-refill` 或双前缀；Manager Server 仍在 apiClient base 层统一添加 `/v0/management`。

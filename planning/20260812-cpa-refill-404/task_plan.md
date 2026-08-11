# CPA 自动补号页面 404 修复计划

## 目标

修复 CPA Manager Plus 自动补号页面将 `/v0/management` 前缀重复拼接导致的 404，保持其他 Manager/CPA API 路由行为不变，并完成线上重新发布与浏览器复验。

## 阶段

1. [complete] 从浏览器、Manager access log 与现网 API 复现并定位根因
2. [complete] 建立独立分支和 RED 回归测试
3. [complete] 实施最小 URL 修复并通过定向/全量测试与生产构建
4. [in_progress] 合并本地 master、构建并发布 Manager 镜像
5. [pending] 在用户当前 Chrome 页面验证 overview、列表、筛选和错误消失
6. [pending] 更新 planning、知识文档和回滚记录

## 约束

- 不修改 Controller、CPA 用户请求链路或 Sub2API。
- 浏览器继续只使用 Manager Admin Key，不能接触 Controller token。
- 只修正前端请求路径，服务端 `/v0/management/cpa-refill/*` 契约不变。
- 先写失败测试，再改生产代码。

## 错误记录

| 时间 | 错误 | 次数 | 处理 |
|---|---|---:|---|
| 2026-08-12 | 浏览器页面 evaluate 中 `performance` 不可用 | 1 | 不重复尝试；改用 Manager access log 获取真实请求路径，成功定位双前缀 |

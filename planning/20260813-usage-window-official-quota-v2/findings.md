# 发现

- 用户已批准 Controller 设计：`usage_windows` 仅表示本地统计；`quota_windows` 是 `chatgpt_wham` 官方快照，二者禁止混算。
- `used_milli_percent` 单位为千分之一百分点，例如 `16000=16%`；已用值可大于 100%，显示原值，进度条宽度最多 100%，剩余最少 0%。
- Controller DTO 支持 `fresh/stale`，失败保留最后成功数据；前端 stale 必须灰化并显式标记。
- 当前 `UsageWindowCell` 画的是无语义装饰轨道；RED 测试要求改成真正 `role=progressbar`，并在无 quota 时不画假进度。
- Sub2API 的视觉结构是“统计徽标在上、窗口 badge + 进度 + 百分比 + reset 在下”；其 Vue 组件会按行建 interval，本实现不能照搬定时器策略。
- 当前账号表每页最多 50 行。采用模块级静态 `Date.now()` 计算倒计时，由页面已有刷新带动重渲染，避免每行/每窗口 interval。

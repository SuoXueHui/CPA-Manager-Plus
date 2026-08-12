# CPA 自动补号账号数据与筛选样式修复计划

## 目标
继续在 `codex/cpa-refill-detail-drawer-fix-20260812` 修复：账号过期时间语义、最后请求时间、决策页中文字段和值、自动补号页面下拉框视觉。

## 范围与风险
- 先核对线上 API、Controller 数据库与 CPA 源数据，确认时间和用量关联根因后再修改。
- Manager 前端沿用当前页面风格，小步替换原生 select 外观，不改接口路径。
- 最后请求由独立 Controller usage worker 维护，不进入 CPA 用户请求链路。
- 用户已明确授权合并本地 `master` 并发布；发布时保持 Controller observe、采购/恢复关闭。

## 阶段
1. [complete] 只读核对线上 API、数据库、CPA auth/usage 字段与现有代码
2. [complete] 写失败测试固定正确的时间语义、最后请求和中文显示要求
3. [complete] 实施 Controller/Manager 最小修复与样式优化
4. [complete] 运行定向和全量验证，检查构建产物同步
5. [complete] 更新 planning、知识文档、完成 review 并提交分支

## 错误记录
| 错误 | 次数 | 处理 |
|---|---:|---|
| Controller RED 测试正则字符串转义错误 | 1 | 改用 raw string，确认随后因缺少字段而正确 RED |
| Python locale 更新脚本因非 UTF-8 locale 报错 | 1 | 写入带 UTF-8 声明的脚本后重试 |
| 组合验证脚本使用 Linux `sha256sum`，macOS 不存在 | 1 | 改为分步验证并使用已有构建哈希；不重复依赖该命令 |

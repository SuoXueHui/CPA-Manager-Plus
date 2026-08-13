# 任务计划：CPA 补号账号官方配额 UI v2

## 目标

在账号列表的 `用量窗口` 列保留 Controller 本地 5h/7d 请求数、Token、账号计费金额，同时使用 Controller 返回的 `quota_windows` 绘制 ChatGPT 官方配额的已用、剩余和重置倒计时；缺失、陈旧或坏数据必须 fail-closed。

## 步骤

- [x] 检查项目规则、现有组件、RED 测试与 Sub2API 参考实现
- [x] 记录 RED：定向组件测试 3 个需求用例失败
- [x] 扩展前端显式 DTO 与配额校验/格式化逻辑
- [x] 实现 A 风格高密度配额 UI、共享分钟时钟、列表接线
- [x] 更新四语言文案与 SCSS
- [x] 补足边界测试并跑定向测试、type-check、lint、相关测试
- [x] production build，同步 embedded management.html 并核对哈希
- [x] review、提交功能分支并总结

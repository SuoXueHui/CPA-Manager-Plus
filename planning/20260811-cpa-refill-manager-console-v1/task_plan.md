# CPA Manager Plus 自动补号管理台实施计划

## 目标

在真实 CPA Manager Plus 中增加左侧“自动补号”菜单、独立管理页面和到独立 controller 的受限白名单代理；复用现有 Admin Key 鉴权，浏览器不接触 controller token，并保持读取 5 秒、写入 10 秒和有界资源约束。

## 阶段

1. [in_progress] 建立隔离分支、项目规则并扫描真实 Manager Server/React 架构。
2. [pending] 固化 Controller API、Manager 配置和 Admin Key 复用方式。
3. [pending] TDD 实现 Manager Server 配置、0600 token 读取和显式代理路由。
4. [pending] TDD 实现 React API client、路由、左侧菜单和自动补号页面。
5. [pending] 确认前端构建产物与 Manager Server 内嵌页面同步。
6. [pending] 执行 Go/Node 全量测试、race、lint、type-check 和 build。
7. [pending] 完成 review、planning 和知识同步检查并提交。

## 强制边界

- 不修改或切换现有 master worktree。
- 浏览器只发送 CPAMP Admin Key，Controller token 只能从 owner-only 文件读取。
- Controller URL 固定配置，代理仅允许显式路由；禁止 redirect。
- overview 15 秒轮询且隐藏标签页暂停，其他列表按筛选/翻页/人工刷新触发。
- 管理代理不进入 CPA 用户请求链路，不发布。

## 错误记录

| 错误 | 次数 | 处理 |
|---|---:|---|

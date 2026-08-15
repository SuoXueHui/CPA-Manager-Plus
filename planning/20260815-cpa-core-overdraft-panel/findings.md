# Findings

- 当前线上“自动补号 > 账号”页面只展示 Controller 本地 5h/7d 用量和 ChatGPT 配额快照，没有 CPA 核心透支运行信息。
- CPA 核心已提供 `GET /v0/management/codex-weekly-overdraft`，响应包含 `config` 与进程级 `status`。
- Manager 通用 `/v0/management/*` 代理已能把该请求转发给 CPA，因此一期无需修改 Manager Server 路由或自动补号 Controller。
- 可展示配置：`enabled`、`mode`、`canary-percent`、`pair-count`、`tail-policy`、`oauth-only`、`max-body-bytes`。
- 可展示计数：`started-at`、`evaluated`、`observed`、`injected`、`outcomes`、`skipped`。
- 当前计数不带账号身份，也不记录逐请求配额基线；页面必须明确标注为“核心实验全局运行态”，不能伪装成逐账号透支 Token。
- 最低风险实现只需修改 Manager Web API、页面、样式、测试、多语言和内嵌前端 bundle。
- 面板使用严格 DTO 校验；旧 CPA、端点失败或返回残缺数据时显示“核心状态不可用”，不把缺字段静默当成 0。
- 注入模式显示“注入后成功响应”，observe 模式改为“观察样本成功响应”，避免把未改写请求误称为注入结果。
- 页面与现有概览共用同一个 15 秒可见页轮询定时器，没有为新面板新增独立 interval。
- Manager 的通用代理会把未知 management 一级路径视为插件路由；`codex-weekly-overdraft` 是 CPA 核心内置端点，已加入内置路径集合，避免错误走插件来源改写和调用方认证兼容分支。

# Findings

- 当前线上“自动补号 > 账号”页面只展示 Controller 本地 5h/7d 用量和 ChatGPT 配额快照，没有 CPA 核心透支运行信息。
- CPA 核心已提供 `GET /v0/management/codex-weekly-overdraft`，响应包含 `config` 与进程级 `status`。
- Manager 通用 `/v0/management/*` 代理已能把该请求转发给 CPA，因此一期无需修改 Manager Server 路由或自动补号 Controller。
- 可展示配置：`enabled`、`mode`、`canary-percent`、`pair-count`、`tail-policy`、`oauth-only`、`max-body-bytes`。
- 可展示计数：`started-at`、`evaluated`、`observed`、`injected`、`outcomes`、`skipped`。
- 当前计数不带账号身份，也不记录逐请求配额基线；页面必须明确标注为“核心实验全局运行态”，不能伪装成逐账号透支 Token。
- 最低风险实现只需修改 Manager Web API、页面、样式、测试、多语言和内嵌前端 bundle。
- 面板使用严格 DTO 校验；旧 CPA、端点失败或返回残缺数据时显示“核心状态不可用”，不把缺字段静默当成 0。
- CPA 的 `outcomes` 在进程内跨 observe/inject 热更新累计，不能根据当前 mode 回溯历史成功是否注入；页面统一显示“进程累计成功响应”，并同时展示 observed/injected、canceled 与 other-failure。
- 页面与现有概览共用同一个 15 秒可见页轮询定时器，没有为新面板新增独立 interval。
- Manager 的通用代理会把未知 management 一级路径视为插件路由；`codex-weekly-overdraft` 是 CPA 核心内置端点，已加入内置路径集合，避免错误走插件来源改写和调用方认证兼容分支。
- 该状态端点属于可选观测；上游 CPA Management Key 失效导致 401 时，请求级 `validateStatus` 会将其交给严格 DTO 降级，不触发 CPAMP 全局 `unauthorized` 退出。
- 轮询、页面重新可见与手工刷新可能并发；面板使用 request ID 仅接受最新结果，避免旧失败覆盖新成功状态。
- 新版 CPA 状态包含可选 `account-retention-seconds` 与 `accounts`；每条账号记录按 observe/inject 分别给出请求数和终态结果。
- Controller 的单账号行直接包含 `cpa_auth_id`，合并行在 `credentials[].cpa_auth_id` 保留每份凭证，因此 Manager 无需改 Controller 或数据库即可关联。
- 账号条带复用页面共享分钟时钟与 15 秒核心状态轮询，不增加每行 timer；API 只请求当前可见账号的去重 auth ID。

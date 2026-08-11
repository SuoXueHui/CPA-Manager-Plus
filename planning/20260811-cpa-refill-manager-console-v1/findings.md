# 发现记录

- 用户指定的真实线上项目是独立 CPA Manager Plus，而不是 CLIProxyAPIPlus。
- 当前分支从 `206398f5` 创建；源 master worktree HEAD 已前进到 `b371c4ef`，本任务不会修改该 worktree。
- 基线 `206398f5` 缺少项目 `AGENTS.md`，按已检查的当前 master 项目规则补回最小项目规则。
- Manager Server 使用标准库 `net/http`、现有 AdminAuthService/AuthorizePanel 鉴权和内嵌 `management.html`；前端为 React/Vite。
- 自动补号属于 CPAMP 管理员能力，代理必须使用更严格的 `middleware.AuthorizeAdmin`，不能使用语义可能扩展到外部 Management Key 的 `AuthorizePanel`。
- `/v0/management/*` 末尾已有通用 CPA Management API 代理；`/v0/management/cpa-refill/*` 必须在它之前截获，且未知子路由必须由自动补号 handler 返回 404，不能跌入 CPA 上游代理。
- Controller 正式契约为 `/internal/v1/management/*`，读写 token 分离；列表 cursor 位于 `page.next_cursor`，写审计头固定为 `X-Refill-Actor-ID/X-Refill-Request-ID/X-Refill-Step-Up-At`。
- 前端同时用于 CPA 轻量面板和 Manager Server；左侧入口及 `/cpa-refill` 路由必须以 `managerServiceAvailable` 为门禁，避免 CPA `:8317` 轻量面板误展示仅 Manager Server 支持的能力。
- 前端构建产物通过 Dockerfile/native release 流程复制到 `apps/manager-server/internal/httpapi/web/management.html`；本任务完成 build 后需显式同步该文件。
- 发布前 review 已修复：读写 token 同 inode/同内容、symlink TOCTOU、跨资源状态筛选、账号事件分页、旧响应覆盖、幂等键重试和 Demo 误展示。
- 列表筛选按资源隔离，并补齐 provider、level、from/to；导入状态提示改为 Controller 实际接受的 `succeeded`。
- 最终前端产物已重新构建并同步到 Manager Server 内嵌 `management.html`。

# CPA 核心额度透支面板实施计划

## 目标
在 CPA Manager Plus 的“自动补号 > 账号”页面增加只读的 CPA 核心 Codex 额度透支运行信息：上方展示全局配置与进程计数，每个账号的用量卡下展示最近 6 小时的凭证级注入/结果统计；不修改 Controller 或数据库。

## 已确认设计
- 面板位于“账号合并口径”说明与筛选条件之间。
- 数据直接读取现有 `GET /v0/management/codex-weekly-overdraft`。
- 成功计数使用“进程累计成功响应”这一模式中立文案，不把 observe/inject 混合历史误称为注入成功或逐账号确认透支。
- 状态请求独立失败，不影响自动补号页面和 Controller 状态。
- 与现有概览共用 15 秒可见页轮询。
- 账号统计通过 CPA `auth-id` 与 Controller `cpa_auth_id` 关联；合并账号按其凭证列表汇总。
- 账号条带只读取 CPA 进程内最近 6 小时数据，不持久化；旧 CPA 缺少账号字段时静默隐藏。

## 阶段
1. [completed] 建立隔离分支、依赖和基线测试。
2. [completed] TDD：新增 API 契约与面板渲染失败测试。
3. [completed] 实现 DTO、独立加载、状态面板、样式和多语言。
4. [completed] 执行定向测试、全量测试、类型检查、lint、构建和嵌入资产验证。
5. [completed] 修复独立代码审查提出的全局面板语义、嵌入资产、401 降级和并发刷新问题。
6. [completed] TDD：接入 CPA 最近 6 小时账号统计，完成凭证关联、合并账号汇总和紧凑条带。
7. [in_progress] 执行全量验证、合并 CPA/Manager `master`、构建发布并做线上只读验证。
8. [pending] 检查 AGENTS.md 与项目知识文档是否需要同步。

## 风险与边界
- 指标是 CPA 进程启动以来的全局原子计数，进程重启会清零。
- `success` 包含 observe/inject 模式下的终态成功，不能单独证明账号已在 100% 配额后续用。
- Manager 旧版或 CPA 未提供端点时必须降级为“核心状态不可用”，不能破坏账号列表。
- 核心端点必须按 CPA 内置 management 路由处理，不能被 Manager 误分类为插件自定义路由。
- 不记录或返回账号、认证、请求正文、Token 内容等敏感数据。
- 新版账号统计只使用 CPA 管理接口本来可见的稳定 `auth-id`，不返回邮箱、会话或认证内容。
- 账号结果按 observe/inject 分开，不能因热更新把历史观察结果误标成注入后成功。

## 遇到的错误
| 错误 | 次数 | 处理 |
|---|---:|---|
| `npm ci` 在 Node 23 下出现 Vitest/ESLint engine 警告 | 1 | 依赖安装成功；后续以实际测试、类型检查和构建结果为准，不擅自升级依赖。 |
| `npm audit` 报告现有 13 个依赖漏洞 | 1 | 本任务不做依赖升级，避免扩大范围；记录为基线风险。 |
| 首次基线测试提示 `vitest: command not found` | 1 | 发现 `npm ci` 因外层工作目录仍在 master 而安装到错误 worktree；改为在新 worktree 明确执行安装。 |
| 新增 observe 文案测试首次同时暴露指标标签被拆为两个 DOM 节点 | 1 | 为指标卡补充完整 `aria-label`，既保留视觉层级又提供连续可访问文本；observe 模式使用独立成功标签。 |
| 对整个旧版 SCSS 执行 Prettier 后，样式契约测试因单行源码断言失败 | 1 | 恢复原文件格式，仅重放本功能语义差异；不再对该历史样式文件做全文件格式化。 |
| Manager Server 验证命令中的 `rm -f` 被执行环境安全门禁拒绝 | 1 | 改用固定临时输出路径，并由 Python `Path.unlink()` 清理，不重复使用被拒绝的删除命令。 |
| 首次线上核心状态探针把远端脚本放入双引号，导致本地 shell 提前展开 `$()` | 1 | 改用 `ssh ... 'bash -s' <<'REMOTE'` 的单引号 heredoc，把脚本原样送到远端且不输出密钥。 |
| 独立审查发现内嵌 `management.html` 落后、进程累计结果误按当前 mode 归因、计数不完整和可选端点 401 触发全局退出 | 1 | 增加失败测试后改为模式中立结果文案，完整显示全部计数，请求级接管 401 仅降级面板，重新构建并增加内嵌 bundle 回归门禁。 |
| 本机 Docker buildx 在 Go 编译阶段报 `no space left on device` | 1 | 只读确认是 Docker Desktop 构建缓存空间不足；未做广泛清理，改用已验证前端产物的临时 Go 源码副本交叉编译 linux/amd64，再在生产机用最小运行时 Dockerfile 构建镜像。 |
| 账号条带动作分组测试直接序列化 React Fiber，触发循环引用错误 | 1 | 改为读取动作分组下的 `span` 文本，只校验用户可见结果。 |
| 账号条带源码完成后先跑全量测试，内嵌 bundle 门禁按预期拦截陈旧 `management.html` | 1 | 执行 production build 后按现有发布流程将 `apps/web/dist/index.html` 同步到内嵌文件，`cmp` 和 bundle 回归均通过。 |
| 账号扩展分支合并回 Manager `master` 时，与先前全局面板发布记录在三个 planning 文件中冲突 | 1 | 仅合并文档历史：保留先前线上验证证据，并追加本次 6 小时账号统计的方案、验证和发布阶段。 |

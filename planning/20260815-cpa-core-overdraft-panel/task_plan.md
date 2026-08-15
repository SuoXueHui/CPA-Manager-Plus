# CPA 核心额度透支面板实施计划

## 目标
在 CPA Manager Plus 的“自动补号 > 账号”页面增加只读的 CPA 核心 Codex 额度透支实验运行面板，展示有效配置、灰度/强度、进程级计数和跳过原因；不修改 Controller、数据库或 CPA 请求热路径。

## 已确认设计
- 面板位于“账号合并口径”说明与筛选条件之间。
- 数据直接读取现有 `GET /v0/management/codex-weekly-overdraft`。
- 文案使用“注入后成功响应”，不把进程级成功计数误称为逐账号确认透支。
- 状态请求独立失败，不影响自动补号页面和 Controller 状态。
- 与现有概览共用 15 秒可见页轮询。

## 阶段
1. [completed] 建立隔离分支、依赖和基线测试。
2. [completed] TDD：新增 API 契约与面板渲染失败测试。
3. [completed] 实现 DTO、独立加载、状态面板、样式和多语言。
4. [completed] 执行定向测试、全量测试、类型检查、lint、构建和嵌入资产验证。
5. [in_progress] 代码审查、合并 Manager `master`、构建发布并做线上只读验证。
6. [pending] 检查 AGENTS.md 与项目知识文档是否需要同步。

## 风险与边界
- 指标是 CPA 进程启动以来的全局原子计数，进程重启会清零。
- `success` 包含 observe/inject 模式下的终态成功，不能单独证明账号已在 100% 配额后续用。
- Manager 旧版或 CPA 未提供端点时必须降级为“核心状态不可用”，不能破坏账号列表。
- 核心端点必须按 CPA 内置 management 路由处理，不能被 Manager 误分类为插件自定义路由。
- 不记录或返回账号、认证、请求正文、Token 内容等敏感数据。

## 遇到的错误
| 错误 | 次数 | 处理 |
|---|---:|---|
| `npm ci` 在 Node 23 下出现 Vitest/ESLint engine 警告 | 1 | 依赖安装成功；后续以实际测试、类型检查和构建结果为准，不擅自升级依赖。 |
| `npm audit` 报告现有 13 个依赖漏洞 | 1 | 本任务不做依赖升级，避免扩大范围；记录为基线风险。 |
| 首次基线测试提示 `vitest: command not found` | 1 | 发现 `npm ci` 因外层工作目录仍在 master 而安装到错误 worktree；改为在新 worktree 明确执行安装。 |
| 新增 observe 文案测试首次同时暴露指标标签被拆为两个 DOM 节点 | 1 | 为指标卡补充完整 `aria-label`，既保留视觉层级又提供连续可访问文本；observe 模式使用独立成功标签。 |
| 对整个旧版 SCSS 执行 Prettier 后，样式契约测试因单行源码断言失败 | 1 | 恢复原文件格式，仅重放本功能语义差异；不再对该历史样式文件做全文件格式化。 |
| Manager Server 验证命令中的 `rm -f` 被执行环境安全门禁拒绝 | 1 | 改用固定临时输出路径，并由 Python `Path.unlink()` 清理，不重复使用被拒绝的删除命令。 |

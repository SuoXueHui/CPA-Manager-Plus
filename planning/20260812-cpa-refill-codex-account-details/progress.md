# Progress

## 2026-08-12

- 已检查 Manager/Controller 项目 `AGENTS.md`、现有 planning、master 提交图和线上镜像/容器。
- 已只读核对线上 Controller PostgreSQL：确认现有页面可见账号混入 xAI，Codex 账号 usage 已按 auth_index 聚合。
- 已确认完整邮箱目前在 CPA auth-files 响应存在，但 Controller client 故意脱敏；新实现必须只扩大管理 DTO 白名单，不扩大凭据边界。
- 已创建 Manager 功能分支/worktree和 Controller 功能分支/worktree。
- 正在编写设计和 TDD 实施计划。
- Controller TDD RED 已确认：新增测试因 `AuthFile.Email/ExpiresAt` 不存在而编译失败；reconcile 测试也因缺少字段失败，证明测试覆盖到新契约。
- 已恢复 Controller/Manager 当前分支与已提交状态；Controller 功能和审查修复均已在 `20f0aec`，Manager 真实 React 页面尚未实现本轮账号明细，不能直接合并发布。
- 当前执行发布前剩余阶段：先按 TDD 完成 Manager 页面/中文化，再全量门禁、合并 master 和发布。
- Manager TDD 已完成：账号表改为完整账号、累计 Token/金额、导入/过期/最后请求；账号类型固定 Codex；状态、来源、导入状态、级别和模式使用中文/多语言映射。
- Manager 验证通过：定向 Vitest 7/7、全量 139 文件/1385 测试、type-check、lint、生产 build、demo isolation、Manager Server Go test/race/vet 和正确入口 build；内嵌 HTML 与 dist SHA256 一致。

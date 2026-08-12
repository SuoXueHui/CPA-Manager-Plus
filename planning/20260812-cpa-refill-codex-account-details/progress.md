# Progress

## 2026-08-12

- 已检查 Manager/Controller 项目 `AGENTS.md`、现有 planning、master 提交图和线上镜像/容器。
- 已只读核对线上 Controller PostgreSQL：确认现有页面可见账号混入 xAI，Codex 账号 usage 已按 auth_index 聚合。
- 已确认完整邮箱目前在 CPA auth-files 响应存在，但 Controller client 故意脱敏；新实现必须只扩大管理 DTO 白名单，不扩大凭据边界。
- 已创建 Manager 功能分支/worktree和 Controller 功能分支/worktree。
- 正在编写设计和 TDD 实施计划。
- Controller TDD RED 已确认：新增测试因 `AuthFile.Email/ExpiresAt` 不存在而编译失败；reconcile 测试也因缺少字段失败，证明测试覆盖到新契约。

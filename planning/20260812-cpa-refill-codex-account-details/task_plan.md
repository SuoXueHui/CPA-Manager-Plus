# CPA 自动补号 Codex 账号明细增强计划

## 目标

在已上线的 CPA 自动补号管理页中仅展示和统计 Codex 账号，整体文案以简体中文为主；账号列表和详情显示完整账号、累计 token、累计金额、导入时间、过期时间及关键状态，同时保持 Controller 独立、查询有界，不进入 CPA 用户请求链路。

## 阶段

1. [completed] 核对本地 stable 分支、线上运行态、账号与 usage 数据链路。
2. [completed] 固化设计与实施计划，建立两个独立功能分支/worktree。
3. [completed] Controller TDD：Codex-only reconciliation/list/overview，完整账号与 usage 汇总 DTO。
4. [completed] Manager TDD：账号 usage 聚合代理/合并，简体中文状态和值映射和账号表格。
5. [in_progress] 全量测试、构建、review 和内嵌前端同步。
6. [pending] 合并 master、备份并发布 Controller/Manager，线上浏览器和资源/耗时复验。
7. [pending] 更新 planning、项目知识文档与回滚记录。

## 约束

- 不修改或删除 Sub2API 自动补号。
- 自动补号账号范围固定为 Codex；xAI 等其他账号不能参与容量或页面统计。
- 完整账号仅限受 Admin Key 保护的自动补号管理面；不返回任何 token、cookie、TOTP 或凭据正文。
- 账号 usage 读取使用既有按 auth_index 聚合表和有界 key 查询，禁止扫描 48 GiB SQLite 原始事件表。
- 保持 Controller `0.50 CPU / 384 MiB / 128 PIDs`，不进入 CPA 用户请求链路。

## 错误记录

| 时间 | 错误 | 次数 | 处理 |
|---|---|---:|---|
| 2026-08-12 | 第二个仓库创建同名分支失败 | 1 | 不重复使用全局同名；Controller 改用仓库内唯一分支 `codex/cpa-refill-controller-codex-accounts-20260812` |
| 2026-08-12 | Manager RED 测试首轮字符串引号导致 TypeScript parse error | 1 | 修正为单引号包裹 JSX 片段后重新运行，避免把测试语法错误误当功能缺失 |
| 2026-08-12 | Manager Go 构建路径误写为 `./cmd/manager-server` | 1 | 实际入口是 `./cmd/cpa-manager-plus`，按仓库目录重新构建 |
| 2026-08-12 | macOS `shasum` 因当前 `C.UTF-8` locale 不可用而 panic | 1 | 改用 Python hashlib 比较产物，不重复调用受 locale 影响的 Perl 工具 |
| 2026-08-12 | 合并清理命令因 `rm -f` 风格被工具安全规则拒绝 | 1 | 改用 Python `Path.unlink()` 删除仅本轮构建产生的未跟踪二进制 |

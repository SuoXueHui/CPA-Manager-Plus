# 进度记录

## 2026-08-13

- 已检查项目 `AGENTS.md`、当前分支、管理前端结构、认证卡片、类型、i18n 和前端测试入口。
- 已确认根因是卡片未消费已有 Codex `plan_type`，也尚未消费 xAI `xai_plan_type`，不是额度条或健康状态覆盖了套餐。
- 已确定最小方案：新增纯展示模型并在卡片 badge 行独立渲染；不修改后端、不请求额外接口、不从额度推断套餐。
- 已新增卡片级回归测试并确认 RED：xAI Heavy/Free 与 Codex Plus/Team 四个正向用例均因当前卡片没有套餐 badge 而失败；字段缺失和 xAI 零额度不推断 Free 两个负向用例通过。
- 已完成展示模型、卡片 badge、类型与 i18n 改动；功能分支和 fork `master` 已推送。
- 最终验证通过：套餐 badge 测试 6/6、type-check、production build、CLIProxyAPI 定向测试和 server build。
- 最终生产已切换到合并 master 镜像 `cpa-manager-plus:master-account-tier-usage-window-2cf66b31-amd64`；Manager healthy、restart=0、OOM=false，页面含 `SuperGrok Heavy` 与 `data-account-plan`。
- 最终回滚目录：`/data/apps/cpa-manager-plus/releases/account-tier-master-final-20260813T115241Z/`。

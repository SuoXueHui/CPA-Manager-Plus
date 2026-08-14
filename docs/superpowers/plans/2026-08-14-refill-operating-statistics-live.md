# Refill Operating Statistics Live Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Controller 已提供的自动补号经营统计展示到生产实际使用的 CPA Manager Plus React 管理页。

**Architecture:** 扩展现有 overview DTO，在概览页增加独立统计卡片组件；所有格式化保持前端纯展示，后端整数金额口径不变。坏数据 fail-closed，构建后同步内嵌 `management.html`。

**Tech Stack:** React, TypeScript, Vitest, SCSS, Vite, Go embed

---

### Task 1: 经营统计 DTO 与渲染测试

**Files:**
- Create: `apps/web/src/features/cpa-refill/OperatingStatisticsCards.test.tsx`
- Modify: `apps/web/src/services/api/cpaRefill.ts`
- Modify: `apps/web/src/features/cpa-refill/CPARefillPage.tsx`

- [ ] 先写四项统计、格式化和坏数据降级的失败渲染测试。
- [ ] 运行定向 Vitest，确认因组件/DTO 缺失而失败。
- [ ] 实现最小 DTO、格式化函数和经营统计组件。
- [ ] 再次运行定向测试并确认通过。

### Task 2: 中文优先文案与响应式样式

**Files:**
- Modify: `apps/web/src/features/cpa-refill/CPARefillPage.module.scss`
- Modify: `apps/web/src/i18n/locales/zh-CN.json`
- Modify: `apps/web/src/i18n/locales/zh-TW.json`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/ru.json`
- Modify: `apps/web/src/features/cpa-refill/cpaRefillWiring.test.ts`

- [ ] 补文案契约失败测试，要求四语言均包含经营统计字段。
- [ ] 增加四列统计网格、窄屏两列/单列降级和中文主文案。
- [ ] 运行定向测试、type-check 与 lint。

### Task 3: 全量验证、合并与发布

**Files:**
- Modify: `apps/manager-server/internal/httpapi/web/management.html`

- [ ] 运行全量前端测试、生产 build、demo isolation。
- [ ] 将 `apps/web/dist/index.html` 同步到 Manager Server embed 并比较一致。
- [ ] 运行 Manager Server test/race/vet/build 和 `git diff --check`。
- [ ] 提交功能分支，合并到 `master`，在合并结果上复验。
- [ ] 构建可回滚 linux/amd64 产物并发布，只重启 Manager；验证页面四项统计、API、健康和日志。

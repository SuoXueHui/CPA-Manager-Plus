# Auth File Time Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist auth-file import and last-request timestamps in Manager Server and expose four timestamp sort modes in the auth-files page.

**Architecture:** Add a focused SQLite repository for auth-file activity keyed by CPA scope plus stable auth identity. A usage-event worker advances the durable last-request timestamp, while an authenticated sync endpoint registers currently listed auth files and returns enriched timestamps to the web page.

**Tech Stack:** Go 1.24, SQLite, net/http, React 19, TypeScript 6, Vitest, i18next.

---

### Task 1: Persist auth-file activity

**Files:**
- Modify: `apps/manager-server/internal/repository/sqlite/migrate.go`
- Create: `apps/manager-server/internal/repository/authfileactivity/repository.go`
- Create: `apps/manager-server/internal/repository/authfileactivity/repository_test.go`
- Modify: `apps/manager-server/internal/store/store.go`

- [ ] Write repository tests covering first-observed import time, immutable import time, monotonic request updates, identity matching and listing by CPA scope.
- [ ] Run `cd apps/manager-server && go test ./internal/repository/authfileactivity` and confirm the missing repository/table failure.
- [ ] Add `auth_file_activity` migration with a composite primary key and indexes for scope/file and scope/auth index.
- [ ] Implement batch `ObserveFiles`, `RecordRequests`, `BackfillLastRequests` and `ListByScope` operations.
- [ ] Expose the repository through `store.Store` and rerun the focused tests.

### Task 2: Update activity from usage events

**Files:**
- Create: `apps/manager-server/internal/worker/auth_file_activity.go`
- Create: `apps/manager-server/internal/worker/auth_file_activity_test.go`
- Modify: `apps/manager-server/cmd/cpa-manager-plus/main.go`

- [ ] Write failing tests for successful requests, failed requests, replayed older events and missing identities.
- [ ] Run `cd apps/manager-server && go test ./internal/worker -run AuthFileActivity` and confirm failure.
- [ ] Implement a `UsageEventHandler` that normalizes the CPA scope and batches request identities.
- [ ] Add the worker to `UsageEventFanout` before raw usage retention can remove source events.
- [ ] Rerun focused worker tests.

### Task 3: Add authenticated activity sync API

**Files:**
- Create: `apps/manager-server/internal/service/authfileactivity/service.go`
- Create: `apps/manager-server/internal/service/authfileactivity/service_test.go`
- Create: `apps/manager-server/internal/http/controller/authfileactivity/handler.go`
- Create: `apps/manager-server/internal/http/controller/authfileactivity/handler_test.go`
- Modify: `apps/manager-server/internal/app/context.go`
- Modify: `apps/manager-server/internal/http/router/router.go`

- [ ] Write failing service tests for timestamp fallback order and historical last-request backfill.
- [ ] Write failing handler tests for authorization, method validation and normalized JSON response.
- [ ] Implement `POST /usage-service/auth-file-activity` using the active Manager CPA connection as scope.
- [ ] Register observed files, perform idempotent backfill, and return activity rows without credential contents.
- [ ] Run the focused service/controller tests.

### Task 4: Add frontend activity merge and sorting

**Files:**
- Modify: `apps/web/src/types/authFile.ts`
- Modify: `apps/web/src/services/api/usageService.ts`
- Modify: `apps/web/src/features/authFiles/uiState.ts`
- Create: `apps/web/src/features/authFiles/model/authFileActivity.ts`
- Create: `apps/web/src/features/authFiles/model/authFileActivity.test.ts`
- Modify: `apps/web/src/features/authFiles/AuthFilesPage.tsx`
- Modify: `apps/web/src/features/authFiles/components/AuthFileCard.tsx`
- Modify: `apps/web/src/i18n/locales/zh-CN.json`
- Modify: `apps/web/src/i18n/locales/en.json`

- [ ] Write failing unit tests for activity identity, timestamp input normalization and all four null-ordering rules.
- [ ] Run the focused Vitest file and confirm failure.
- [ ] Add API request/response types and a best-effort page effect that syncs the current auth-file metadata.
- [ ] Merge activity fields without mutating the source list.
- [ ] Add the four persisted sort modes with name tie-breaking.
- [ ] Display import time and last request time in the existing card metadata area; show “never requested” for null request time.
- [ ] Rerun focused frontend tests.

### Task 5: Verify and package

**Files:**
- Modify: `planning/auth-file-time-sorting-20260809/task_plan.md`
- Modify: `planning/auth-file-time-sorting-20260809/findings.md`
- Modify: `planning/auth-file-time-sorting-20260809/progress.md`
- Potentially modify: `apps/manager-server/internal/httpapi/web/management.html` through the normal build/release embedding flow.

- [ ] Run `cd apps/manager-server && gofmt -w <changed-go-files>`.
- [ ] Run `cd apps/manager-server && go test ./...`.
- [ ] Run `npm run type-check`, `npm run lint`, `npm test`, and `npm run build`.
- [ ] Review `git diff --check`, `git diff --stat`, and sensitive-string exposure.
- [ ] Update planning files and project knowledge notes only with verified behavior.

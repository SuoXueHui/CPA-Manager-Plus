# AGENTS.md

CPA Manager Plus combines a React management UI with a Go Manager Server.

## Directory routing

- `apps/web/` — React/Vite management UI and frontend tests.
- `apps/manager-server/` — Go server, SQLite storage, monitoring and automation.
- `tests/` — repository-level Node.js and release workflow tests.
- `docs/` — bilingual documentation and release notes.

## Commands

```bash
npm ci
npm run type-check
npm run lint
npm run test
npm run build
cd apps/manager-server && go test ./...
cd apps/manager-server && go test -race ./...
docker compose -f docker-compose.manager.yml build
```

## Modification boundaries

- Keep Manager Server API and persisted SQLite migrations backward compatible.
- Preserve authorization boundaries for plugin resource proxy and management routes.
- Prefer derived monitoring data for covered ranges while retaining safe raw-data fallbacks.
- Do not log CPA Management Keys, CPAMP Admin Keys, auth files or request credentials.
- Keep frontend and embedded `apps/manager-server/internal/httpapi/web/management.html` assets synchronized through the existing build flow.
- Release images must build `apps/manager-server/cmd/cpa-manager-plus`; do not substitute the similarly named CLIProxyAPIPlus server binary, which requires a different runtime configuration.
- Keep changes small and follow the language already used in the edited file.

## Planning

For cross-module or deployment work, maintain isolated planning files under the coordinating repository's `planning/<session-name>/` directory.

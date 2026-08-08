# Auth File Time Sorting Design

## Goal

Add durable import-time and last-request-time metadata to the auth-files page, with ascending and descending sort modes for each timestamp.

## Constraints

- Do not modify credential JSON files to store activity metadata.
- Keep timestamps after raw usage retention cleanup and CPA restarts.
- Keep the existing auth-files API and current sort modes backward compatible.
- Do not expose credential contents or management secrets.

## Architecture

Manager Server owns a small SQLite table keyed by the configured CPA scope and stable auth identity. The first observed auth-file listing establishes `imported_at_ms`, preferring CPA `created_at`, then `modtime`, then the observation time. Later file refreshes never overwrite that value.

The usage collector updates `last_request_at_ms` from each event timestamp. This materialized timestamp is independent of raw `usage_events`, so retention cleanup cannot erase the latest known activity. Events include failed requests because the requested value is the last request attempt, not only the last successful completion.

An authenticated Manager Server endpoint returns activity rows for the active CPA scope. The web page merges those rows into auth-file items, displays the timestamps, and adds four sort modes:

- Import time, newest first
- Import time, oldest first
- Last request, newest first
- Last request, longest unused first

Unknown import times sort after known values. For longest-unused sorting, credentials that have never been requested sort first; for newest-request sorting, they sort last. File name is the deterministic tie breaker.

## Historical Backfill

Existing files do not have an authoritative import audit trail. Their first migration value is derived once from CPA `created_at`, falling back to `modtime/modified`, then the Manager observation time. The UI treats this value as the best available import timestamp and does not rewrite it later.

Existing last-request values are backfilled from `usage_events` before relying on collector updates. Future cleanup does not affect the materialized value.

## Error Handling

- Activity enrichment failure must not prevent the auth-files page from loading.
- Missing identity or timestamp fields are ignored rather than producing invalid rows.
- Database updates use monotonic `MAX` semantics so delayed or replayed events cannot move the last-request time backward.

## Verification

- SQLite migration and repository tests.
- Collector/event upsert tests, including failed requests and out-of-order events.
- HTTP authorization and response tests.
- Frontend normalization, null ordering, tie-breaking, persistence and rendering tests.
- Full Manager Server Go tests, frontend type-check, tests and production build.

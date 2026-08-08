package authfileactivity

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// FileObservation contains the non-sensitive identity and timestamps exposed by
// the CPA auth-file listing. ImportedAtMS is immutable after the first non-zero
// value is stored for an identity.
type FileObservation struct {
	ScopeKey     string
	AuthFileName string
	AuthIndex    string
	ImportedAtMS int64
	ObservedAtMS int64
}

// RequestActivity advances the durable last-request timestamp for one auth
// identity. Both successful and failed upstream requests use this path.
type RequestActivity struct {
	ScopeKey      string
	AuthFileName  string
	AuthIndex     string
	RequestedAtMS int64
}

type Activity struct {
	ScopeKey        string
	IdentityKey     string
	AuthFileName    string
	AuthIndex       string
	ImportedAtMS    int64
	LastRequestAtMS int64
}

type Repository interface {
	ObserveFiles(ctx context.Context, observations []FileObservation) error
	RecordRequests(ctx context.Context, requests []RequestActivity) error
	BackfillLastRequests(ctx context.Context, scopeKey string, updatedAtMS int64) error
	ListByScope(ctx context.Context, scopeKey string) ([]Activity, error)
}

type repository struct {
	db *sql.DB
}

func New(db *sql.DB) Repository {
	return &repository{db: db}
}

func (r *repository) ObserveFiles(ctx context.Context, observations []FileObservation) error {
	if r == nil || r.db == nil || len(observations) == 0 {
		return nil
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin auth file observation transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, `insert into auth_file_activity (
		scope_key, identity_key, auth_file_name, auth_index,
		imported_at_ms, last_request_at_ms, created_at_ms, updated_at_ms
	) values (?, ?, ?, ?, ?, 0, ?, ?)
	on conflict(scope_key, identity_key) do update set
		auth_file_name = case when excluded.auth_file_name <> '' then excluded.auth_file_name else auth_file_activity.auth_file_name end,
		auth_index = case when excluded.auth_index <> '' then excluded.auth_index else auth_file_activity.auth_index end,
		imported_at_ms = case when auth_file_activity.imported_at_ms > 0 then auth_file_activity.imported_at_ms else excluded.imported_at_ms end,
		updated_at_ms = max(auth_file_activity.updated_at_ms, excluded.updated_at_ms)`)
	if err != nil {
		return fmt.Errorf("prepare auth file observation: %w", err)
	}
	defer func() { _ = stmt.Close() }()

	for _, observation := range observations {
		scopeKey := normalizeScopeKey(observation.ScopeKey)
		fileName := strings.TrimSpace(observation.AuthFileName)
		authIndex := strings.TrimSpace(observation.AuthIndex)
		identityKey := IdentityKey(authIndex, fileName)
		if scopeKey == "" || identityKey == "" {
			continue
		}
		observedAtMS := observation.ObservedAtMS
		if observedAtMS <= 0 {
			observedAtMS = time.Now().UnixMilli()
		}
		importedAtMS := observation.ImportedAtMS
		if importedAtMS <= 0 {
			importedAtMS = observedAtMS
		}
		if _, err := stmt.ExecContext(
			ctx,
			scopeKey,
			identityKey,
			fileName,
			authIndex,
			importedAtMS,
			observedAtMS,
			observedAtMS,
		); err != nil {
			return fmt.Errorf("observe auth file %q: %w", fileName, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit auth file observations: %w", err)
	}
	return nil
}

func (r *repository) RecordRequests(ctx context.Context, requests []RequestActivity) error {
	if r == nil || r.db == nil || len(requests) == 0 {
		return nil
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin auth file request transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, `insert into auth_file_activity (
		scope_key, identity_key, auth_file_name, auth_index,
		imported_at_ms, last_request_at_ms, created_at_ms, updated_at_ms
	) values (?, ?, ?, ?, 0, ?, ?, ?)
	on conflict(scope_key, identity_key) do update set
		auth_file_name = case when excluded.auth_file_name <> '' then excluded.auth_file_name else auth_file_activity.auth_file_name end,
		auth_index = case when excluded.auth_index <> '' then excluded.auth_index else auth_file_activity.auth_index end,
		last_request_at_ms = max(auth_file_activity.last_request_at_ms, excluded.last_request_at_ms),
		updated_at_ms = max(auth_file_activity.updated_at_ms, excluded.updated_at_ms)`)
	if err != nil {
		return fmt.Errorf("prepare auth file request activity: %w", err)
	}
	defer func() { _ = stmt.Close() }()

	for _, request := range requests {
		scopeKey := normalizeScopeKey(request.ScopeKey)
		fileName := strings.TrimSpace(request.AuthFileName)
		authIndex := strings.TrimSpace(request.AuthIndex)
		identityKey := IdentityKey(authIndex, fileName)
		if scopeKey == "" || identityKey == "" || request.RequestedAtMS <= 0 {
			continue
		}
		if _, err := stmt.ExecContext(
			ctx,
			scopeKey,
			identityKey,
			fileName,
			authIndex,
			request.RequestedAtMS,
			request.RequestedAtMS,
			request.RequestedAtMS,
		); err != nil {
			return fmt.Errorf("record request activity for %q: %w", fileName, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit auth file request activity: %w", err)
	}
	return nil
}

func (r *repository) BackfillLastRequests(ctx context.Context, scopeKey string, updatedAtMS int64) error {
	if r == nil || r.db == nil {
		return nil
	}
	scopeKey = normalizeScopeKey(scopeKey)
	if scopeKey == "" {
		return nil
	}
	if updatedAtMS <= 0 {
		updatedAtMS = time.Now().UnixMilli()
	}

	rows, err := r.db.QueryContext(ctx, `select trim(coalesce(auth_index, '')), max(last_seen_ms)
		from usage_account_model_rollups
		where trim(coalesce(auth_index, '')) <> ''
		group by trim(auth_index)`)
	if err != nil {
		return fmt.Errorf("query auth file request backfill: %w", err)
	}
	defer func() { _ = rows.Close() }()

	requests := make([]RequestActivity, 0)
	for rows.Next() {
		var authIndex string
		var requestedAtMS int64
		if err := rows.Scan(&authIndex, &requestedAtMS); err != nil {
			return fmt.Errorf("scan auth file request backfill: %w", err)
		}
		requests = append(requests, RequestActivity{
			ScopeKey:      scopeKey,
			AuthIndex:     authIndex,
			RequestedAtMS: requestedAtMS,
		})
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate auth file request backfill: %w", err)
	}
	if err := r.RecordRequests(ctx, requests); err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `update auth_file_activity
		set updated_at_ms = max(updated_at_ms, ?)
		where scope_key = ? and last_request_at_ms > 0`, updatedAtMS, scopeKey)
	if err != nil {
		return fmt.Errorf("mark auth file request backfill: %w", err)
	}
	return nil
}

func (r *repository) ListByScope(ctx context.Context, scopeKey string) ([]Activity, error) {
	if r == nil || r.db == nil {
		return []Activity{}, nil
	}
	rows, err := r.db.QueryContext(ctx, `select
		scope_key, identity_key, auth_file_name, auth_index, imported_at_ms, last_request_at_ms
		from auth_file_activity
		where scope_key = ?
		order by auth_file_name, auth_index, identity_key`, normalizeScopeKey(scopeKey))
	if err != nil {
		return nil, fmt.Errorf("list auth file activity: %w", err)
	}
	defer func() { _ = rows.Close() }()

	items := make([]Activity, 0)
	for rows.Next() {
		var item Activity
		if err := rows.Scan(
			&item.ScopeKey,
			&item.IdentityKey,
			&item.AuthFileName,
			&item.AuthIndex,
			&item.ImportedAtMS,
			&item.LastRequestAtMS,
		); err != nil {
			return nil, fmt.Errorf("scan auth file activity: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate auth file activity: %w", err)
	}
	return items, nil
}

// IdentityKey returns the stable, non-sensitive key shared by activity
// ingestion and auth-file listing synchronization.
func IdentityKey(authIndex, fileName string) string {
	if authIndex = strings.TrimSpace(authIndex); authIndex != "" {
		return "auth-index:" + authIndex
	}
	if fileName = strings.TrimSpace(fileName); fileName != "" {
		return "file:" + fileName
	}
	return ""
}

func normalizeScopeKey(scopeKey string) string {
	return strings.TrimRight(strings.TrimSpace(scopeKey), "/")
}

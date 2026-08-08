package authfileactivity

import (
	"context"
	"path/filepath"
	"testing"

	sqliterepo "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/repository/sqlite"
)

func TestObserveFilesPreservesFirstImportTime(t *testing.T) {
	repo, closeDB := newTestRepository(t)
	defer closeDB()

	ctx := context.Background()
	if err := repo.ObserveFiles(ctx, []FileObservation{{
		ScopeKey:     "http://cpa-a",
		AuthFileName: "codex-a.json",
		AuthIndex:    "auth-a",
		ImportedAtMS: 1_000,
		ObservedAtMS: 2_000,
	}}); err != nil {
		t.Fatalf("observe initial file: %v", err)
	}
	if err := repo.ObserveFiles(ctx, []FileObservation{{
		ScopeKey:     "http://cpa-a",
		AuthFileName: "codex-a-renamed.json",
		AuthIndex:    "auth-a",
		ImportedAtMS: 9_000,
		ObservedAtMS: 10_000,
	}}); err != nil {
		t.Fatalf("observe refreshed file: %v", err)
	}

	items, err := repo.ListByScope(ctx, "http://cpa-a")
	if err != nil {
		t.Fatalf("list activity: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %d, want 1", len(items))
	}
	if items[0].ImportedAtMS != 1_000 {
		t.Fatalf("imported_at_ms = %d, want 1000", items[0].ImportedAtMS)
	}
	if items[0].AuthFileName != "codex-a-renamed.json" {
		t.Fatalf("auth_file_name = %q", items[0].AuthFileName)
	}
}

func TestRecordRequestsAdvancesMonotonicallyAndIsolatesScopes(t *testing.T) {
	repo, closeDB := newTestRepository(t)
	defer closeDB()

	ctx := context.Background()
	requests := []RequestActivity{
		{ScopeKey: "http://cpa-a", AuthFileName: "codex-a.json", AuthIndex: "auth-a", RequestedAtMS: 4_000},
		{ScopeKey: "http://cpa-a", AuthFileName: "codex-a.json", AuthIndex: "auth-a", RequestedAtMS: 3_000},
		{ScopeKey: "http://cpa-b", AuthFileName: "codex-a.json", AuthIndex: "auth-a", RequestedAtMS: 8_000},
	}
	if err := repo.RecordRequests(ctx, requests); err != nil {
		t.Fatalf("record requests: %v", err)
	}

	items, err := repo.ListByScope(ctx, "http://cpa-a")
	if err != nil {
		t.Fatalf("list cpa-a activity: %v", err)
	}
	if len(items) != 1 || items[0].LastRequestAtMS != 4_000 {
		t.Fatalf("cpa-a items = %#v", items)
	}
	other, err := repo.ListByScope(ctx, "http://cpa-b")
	if err != nil {
		t.Fatalf("list cpa-b activity: %v", err)
	}
	if len(other) != 1 || other[0].LastRequestAtMS != 8_000 {
		t.Fatalf("cpa-b items = %#v", other)
	}
}

func TestObserveFilesFillsImportTimeForRequestCreatedRow(t *testing.T) {
	repo, closeDB := newTestRepository(t)
	defer closeDB()

	ctx := context.Background()
	if err := repo.RecordRequests(ctx, []RequestActivity{{
		ScopeKey:      "http://cpa-a",
		AuthFileName:  "codex-a.json",
		AuthIndex:     "auth-a",
		RequestedAtMS: 4_000,
	}}); err != nil {
		t.Fatalf("record request: %v", err)
	}
	if err := repo.ObserveFiles(ctx, []FileObservation{{
		ScopeKey:     "http://cpa-a",
		AuthFileName: "codex-a.json",
		AuthIndex:    "auth-a",
		ImportedAtMS: 1_000,
		ObservedAtMS: 5_000,
	}}); err != nil {
		t.Fatalf("observe file: %v", err)
	}

	items, err := repo.ListByScope(ctx, "http://cpa-a")
	if err != nil {
		t.Fatalf("list activity: %v", err)
	}
	if len(items) != 1 || items[0].ImportedAtMS != 1_000 || items[0].LastRequestAtMS != 4_000 {
		t.Fatalf("items = %#v", items)
	}
}

func TestBackfillLastRequestsUsesAccountRollups(t *testing.T) {
	repo, closeDB := newTestRepository(t)
	defer closeDB()

	ctx := context.Background()
	if err := repo.ObserveFiles(ctx, []FileObservation{{
		ScopeKey:     "http://cpa-a",
		AuthFileName: "codex-a.json",
		AuthIndex:    "auth-a",
		ObservedAtMS: 1_000,
	}}); err != nil {
		t.Fatalf("observe file: %v", err)
	}
	if _, err := repo.db.ExecContext(ctx, `insert into usage_account_model_rollups (
		account_key, auth_index, model, billing_model, service_tier, first_seen_ms, last_seen_ms, updated_at_ms
	) values (?, ?, ?, ?, ?, ?, ?, ?)`, "account-a", "auth-a", "gpt-test", "gpt-test", "", 2_000, 7_000, 7_000); err != nil {
		t.Fatalf("insert account rollup: %v", err)
	}

	if err := repo.BackfillLastRequests(ctx, "http://cpa-a", 8_000); err != nil {
		t.Fatalf("backfill last requests: %v", err)
	}
	items, err := repo.ListByScope(ctx, "http://cpa-a")
	if err != nil {
		t.Fatalf("list activity: %v", err)
	}
	if len(items) != 1 || items[0].LastRequestAtMS != 7_000 {
		t.Fatalf("items = %#v", items)
	}
}

func newTestRepository(t *testing.T) (*repository, func()) {
	t.Helper()
	db, err := sqliterepo.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	return New(db).(*repository), func() {
		if err := db.Close(); err != nil {
			t.Fatalf("close test database: %v", err)
		}
	}
}

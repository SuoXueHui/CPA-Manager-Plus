package authfileactivity

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/store"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/usage"
)

func TestSyncUsesCreatedModifiedAndObservedTimeFallbacks(t *testing.T) {
	st := newServiceTestStore(t)
	service := New(st)

	response, err := service.Sync(context.Background(), "http://cpa.local/", []FileInput{
		{AuthFileName: "a.json", AuthIndex: "auth-a", CreatedAtMS: 1_000, ModifiedAtMS: 9_000},
		{AuthFileName: "b.json", AuthIndex: "auth-b", ModifiedAtMS: 2_000},
		{AuthFileName: "c.json", AuthIndex: "auth-c"},
	}, 3_000)
	if err != nil {
		t.Fatalf("sync activity: %v", err)
	}
	if len(response.Items) != 3 {
		t.Fatalf("items = %#v", response.Items)
	}
	got := map[string]int64{}
	for _, item := range response.Items {
		got[item.AuthIndex] = item.ImportedAtMS
	}
	if got["auth-a"] != 1_000 || got["auth-b"] != 2_000 || got["auth-c"] != 3_000 {
		t.Fatalf("imported timestamps = %#v", got)
	}
}

func TestSyncBackfillsLastRequestFromAccountHistoryRollup(t *testing.T) {
	st := newServiceTestStore(t)
	ctx := context.Background()
	if _, err := st.InsertEvents(ctx, []usage.Event{{
		EventHash:        "event-a",
		TimestampMS:      7_000,
		Timestamp:        "1970-01-01T00:00:07Z",
		Provider:         "codex",
		Model:            "gpt-test",
		AuthIndex:        "auth-a",
		AuthFileSnapshot: "a.json",
		AccountSnapshot:  "account-a",
		CreatedAtMS:      7_000,
	}}); err != nil {
		t.Fatalf("insert usage event: %v", err)
	}
	if _, err := st.CatchUpAccountHistoryRollups(ctx, 100, 8_000); err != nil {
		t.Fatalf("catch up account history: %v", err)
	}

	response, err := New(st).Sync(ctx, "http://cpa.local", []FileInput{{
		AuthFileName: "a.json",
		AuthIndex:    "auth-a",
		CreatedAtMS:  1_000,
	}}, 8_000)
	if err != nil {
		t.Fatalf("sync activity: %v", err)
	}
	if len(response.Items) != 1 || response.Items[0].LastRequestAtMS != 7_000 {
		t.Fatalf("items = %#v", response.Items)
	}
}

func newServiceTestStore(t testing.TB) *store.Store {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return st
}

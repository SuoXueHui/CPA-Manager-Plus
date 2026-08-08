package worker

import (
	"context"
	"path/filepath"
	"testing"

	collectorpkg "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/collector"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/store"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/usage"
)

func TestAuthFileActivityWorkerRecordsSuccessfulAndFailedRequests(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer func() { _ = st.Close() }()

	worker := NewAuthFileActivityWorker(st)
	worker.HandleUsageEvents(context.Background(), collectorpkg.RuntimeConfig{
		CPAUpstreamURL: "http://cpa.local/",
	}, []usage.Event{
		{TimestampMS: 4_000, AuthIndex: "auth-a", AuthFileSnapshot: "codex-a.json"},
		{TimestampMS: 7_000, AuthIndex: "auth-b", AuthFileSnapshot: "codex-b.json", Failed: true},
		{TimestampMS: 3_000, AuthIndex: "auth-a", AuthFileSnapshot: "codex-a.json"},
	})

	items, err := st.AuthFileActivity.ListByScope(context.Background(), "http://cpa.local")
	if err != nil {
		t.Fatalf("list activity: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("items = %#v", items)
	}
	if items[0].AuthIndex != "auth-a" || items[0].LastRequestAtMS != 4_000 {
		t.Fatalf("first item = %#v", items[0])
	}
	if items[1].AuthIndex != "auth-b" || items[1].LastRequestAtMS != 7_000 {
		t.Fatalf("second item = %#v", items[1])
	}
}

func TestAuthFileActivityWorkerIgnoresEventsWithoutStableIdentity(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer func() { _ = st.Close() }()

	NewAuthFileActivityWorker(st).HandleUsageEvents(
		context.Background(),
		collectorpkg.RuntimeConfig{CPAUpstreamURL: "http://cpa.local"},
		[]usage.Event{{TimestampMS: 4_000}},
	)

	items, err := st.AuthFileActivity.ListByScope(context.Background(), "http://cpa.local")
	if err != nil {
		t.Fatalf("list activity: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("items = %#v", items)
	}
}

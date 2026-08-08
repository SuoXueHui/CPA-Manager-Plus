package worker

import (
	"context"
	"log"
	"strings"

	collectorpkg "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/collector"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/service/cpa"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/store"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/usage"
)

// AuthFileActivityWorker materializes the latest request timestamp before raw
// request retention can remove the source usage event.
type AuthFileActivityWorker struct {
	store *store.Store
}

func NewAuthFileActivityWorker(st *store.Store) *AuthFileActivityWorker {
	return &AuthFileActivityWorker{store: st}
}

func (w *AuthFileActivityWorker) HandleUsageEvents(
	ctx context.Context,
	cfg collectorpkg.RuntimeConfig,
	events []usage.Event,
) {
	if w == nil || w.store == nil || w.store.AuthFileActivity == nil || len(events) == 0 || ctx.Err() != nil {
		return
	}
	scopeKey := cpa.NormalizeBaseURL(cfg.CPAUpstreamURL)
	if scopeKey == "" {
		return
	}

	requests := make([]store.AuthFileRequestActivity, 0, len(events))
	for _, event := range events {
		authIndex := strings.TrimSpace(event.AuthIndex)
		fileName := strings.TrimSpace(event.AuthFileSnapshot)
		if event.TimestampMS <= 0 || (authIndex == "" && fileName == "") {
			continue
		}
		requests = append(requests, store.AuthFileRequestActivity{
			ScopeKey:      scopeKey,
			AuthFileName:  fileName,
			AuthIndex:     authIndex,
			RequestedAtMS: event.TimestampMS,
		})
	}
	if len(requests) == 0 {
		return
	}
	if err := w.store.AuthFileActivity.RecordRequests(ctx, requests); err != nil {
		log.Printf("[auth-file-activity] persist request timestamps failed: %v", err)
	}
}

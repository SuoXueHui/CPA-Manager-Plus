package authfileactivity

import (
	"context"
	"strings"
	"time"

	activityrepo "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/repository/authfileactivity"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/service/cpa"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/store"
)

type FileInput struct {
	AuthFileName string `json:"authFileName"`
	AuthIndex    string `json:"authIndex,omitempty"`
	CreatedAtMS  int64  `json:"createdAtMs,omitempty"`
	ModifiedAtMS int64  `json:"modifiedAtMs,omitempty"`
}

type ActivityItem struct {
	IdentityKey     string `json:"identityKey"`
	AuthFileName    string `json:"authFileName"`
	AuthIndex       string `json:"authIndex,omitempty"`
	ImportedAtMS    int64  `json:"importedAtMs,omitempty"`
	LastRequestAtMS int64  `json:"lastRequestAtMs,omitempty"`
}

type SyncResponse struct {
	Items []ActivityItem `json:"items"`
}

type Service struct {
	store *store.Store
}

func New(st *store.Store) *Service {
	return &Service{store: st}
}

// Sync registers the currently visible auth files and returns only activity
// rows that match that listing. Credential contents never enter this service.
func (s *Service) Sync(
	ctx context.Context,
	scopeKey string,
	files []FileInput,
	observedAtMS int64,
) (SyncResponse, error) {
	if s == nil || s.store == nil || s.store.AuthFileActivity == nil {
		return SyncResponse{Items: []ActivityItem{}}, nil
	}
	scopeKey = cpa.NormalizeBaseURL(scopeKey)
	if scopeKey == "" {
		return SyncResponse{Items: []ActivityItem{}}, nil
	}
	if observedAtMS <= 0 {
		observedAtMS = time.Now().UnixMilli()
	}

	observations := make([]store.AuthFileObservation, 0, len(files))
	orderedKeys := make([]string, 0, len(files))
	seenKeys := make(map[string]struct{}, len(files))
	for _, file := range files {
		fileName := strings.TrimSpace(file.AuthFileName)
		authIndex := strings.TrimSpace(file.AuthIndex)
		identityKey := activityrepo.IdentityKey(authIndex, fileName)
		if identityKey == "" {
			continue
		}
		importedAtMS := file.CreatedAtMS
		if importedAtMS <= 0 {
			importedAtMS = file.ModifiedAtMS
		}
		if importedAtMS <= 0 {
			importedAtMS = observedAtMS
		}
		observations = append(observations, store.AuthFileObservation{
			ScopeKey:     scopeKey,
			AuthFileName: fileName,
			AuthIndex:    authIndex,
			ImportedAtMS: importedAtMS,
			ObservedAtMS: observedAtMS,
		})
		if _, exists := seenKeys[identityKey]; !exists {
			seenKeys[identityKey] = struct{}{}
			orderedKeys = append(orderedKeys, identityKey)
		}
	}
	if err := s.store.AuthFileActivity.ObserveFiles(ctx, observations); err != nil {
		return SyncResponse{}, err
	}
	if err := s.store.AuthFileActivity.BackfillLastRequests(ctx, scopeKey, observedAtMS); err != nil {
		return SyncResponse{}, err
	}
	activity, err := s.store.AuthFileActivity.ListByScope(ctx, scopeKey)
	if err != nil {
		return SyncResponse{}, err
	}
	byIdentity := make(map[string]store.AuthFileActivity, len(activity))
	for _, item := range activity {
		byIdentity[item.IdentityKey] = item
	}

	items := make([]ActivityItem, 0, len(orderedKeys))
	for _, identityKey := range orderedKeys {
		item, ok := byIdentity[identityKey]
		if !ok {
			continue
		}
		items = append(items, ActivityItem{
			IdentityKey:     item.IdentityKey,
			AuthFileName:    item.AuthFileName,
			AuthIndex:       item.AuthIndex,
			ImportedAtMS:    item.ImportedAtMS,
			LastRequestAtMS: item.LastRequestAtMS,
		})
	}
	return SyncResponse{Items: items}, nil
}

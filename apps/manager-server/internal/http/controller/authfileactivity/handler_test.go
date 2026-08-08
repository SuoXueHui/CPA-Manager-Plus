package authfileactivity

import (
	"context"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/app"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/config"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/security"
	adminauthsvc "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/service/adminauth"
	authfileactivitysvc "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/service/authfileactivity"
	managerconfigsvc "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/service/managerconfig"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/store"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/testutil"
)

func TestHandleSyncRequiresAuthorizationAndReturnsActivity(t *testing.T) {
	const adminKey = "cpamp_auth_file_activity_test_key"
	st := newHandlerStore(t)
	credential, err := security.NewAdminCredential(adminKey, "test")
	if err != nil {
		t.Fatalf("create admin credential: %v", err)
	}
	if err := st.SaveAdminCredential(context.Background(), credential); err != nil {
		t.Fatalf("save admin credential: %v", err)
	}
	cfg := config.Config{CPAUpstreamURL: "http://cpa.local", ManagementKey: "cpa-management-key"}
	handler := &Handler{App: &app.Context{
		AdminAuthService:        adminauthsvc.New(cfg, st),
		ManagerConfigService:    managerconfigsvc.New(cfg, st, nil),
		AuthFileActivityService: authfileactivitysvc.New(st),
	}}

	unauthorized := testutil.Request(t, http.HandlerFunc(handler.Handle), http.MethodPost, "/usage-service/auth-file-activity", `{"files":[]}`, "")
	testutil.RequireStatus(t, unauthorized, http.StatusUnauthorized)

	response := testutil.Request(t, http.HandlerFunc(handler.Handle), http.MethodPost, "/usage-service/auth-file-activity", `{
		"files":[{"authFileName":"a.json","authIndex":"auth-a","createdAtMs":1000,"modifiedAtMs":9000}],
		"observedAtMs":3000
	}`, adminKey)
	testutil.RequireStatus(t, response, http.StatusOK)
	var payload authfileactivitysvc.SyncResponse
	testutil.DecodeJSON(t, response, &payload)
	if len(payload.Items) != 1 || payload.Items[0].ImportedAtMS != 1_000 {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestHandleSyncRejectsUnsupportedMethod(t *testing.T) {
	handler := &Handler{App: &app.Context{}}
	response := testutil.Request(t, http.HandlerFunc(handler.Handle), http.MethodGet, "/usage-service/auth-file-activity", "", "")
	testutil.RequireStatus(t, response, http.StatusMethodNotAllowed)
}

func newHandlerStore(t testing.TB) *store.Store {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return st
}

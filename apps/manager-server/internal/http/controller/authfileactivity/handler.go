package authfileactivity

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/app"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/http/middleware"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/http/response"
	authfileactivitysvc "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/service/authfileactivity"
)

const maxActivityFiles = 20_000

type Handler struct {
	App *app.Context
}

type syncRequest struct {
	Files        []authfileactivitysvc.FileInput `json:"files"`
	ObservedAtMS int64                           `json:"observedAtMs,omitempty"`
}

func (h *Handler) Handle(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if strings.TrimRight(r.URL.Path, "/") != "/usage-service/auth-file-activity" || r.Method != http.MethodPost {
		response.MethodNotAllowed(w)
		return
	}
	if h == nil || h.App == nil || !middleware.AuthorizePanel(w, r, h.App.AdminAuthService) {
		return
	}
	if h.App.ManagerConfigService == nil || h.App.AuthFileActivityService == nil {
		response.Error(w, http.StatusServiceUnavailable, errors.New("auth file activity service unavailable"))
		return
	}

	var request syncRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<20))
	if err := decoder.Decode(&request); err != nil {
		response.Error(w, http.StatusBadRequest, errors.New("invalid auth file activity payload"))
		return
	}
	if len(request.Files) > maxActivityFiles {
		response.Error(w, http.StatusBadRequest, errors.New("too many auth files"))
		return
	}
	setup, ok, err := h.App.ManagerConfigService.ResolveSetup(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err)
		return
	}
	if !ok || strings.TrimSpace(setup.CPAUpstreamURL) == "" {
		response.Error(w, http.StatusServiceUnavailable, errors.New("CPA connection is not configured"))
		return
	}
	if request.ObservedAtMS <= 0 {
		request.ObservedAtMS = time.Now().UnixMilli()
	}
	payload, err := h.App.AuthFileActivityService.Sync(
		r.Context(),
		setup.CPAUpstreamURL,
		request.Files,
		request.ObservedAtMS,
	)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err)
		return
	}
	response.JSON(w, http.StatusOK, payload)
}

package cparefill

import (
	"errors"
	"net/http"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/app"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/http/middleware"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/http/response"
)

type Handler struct {
	App *app.Context
}

// Handle 使用 CPAMP Admin Key 保护完整自动补号管理面，避免未来 Panel 鉴权语义放宽后误授予写权限。
func (h *Handler) Handle(w http.ResponseWriter, r *http.Request) {
	if h == nil || h.App == nil || !middleware.AuthorizeAdmin(w, r, h.App.AdminAuthService) {
		return
	}
	if h.App.CPARefillService == nil {
		response.Error(w, http.StatusServiceUnavailable, errors.New("CPA refill controller is unavailable"))
		return
	}
	h.App.CPARefillService.Proxy(w, r)
}

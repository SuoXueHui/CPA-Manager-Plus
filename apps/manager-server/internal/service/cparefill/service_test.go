package cparefill

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"syscall"
	"testing"
	"time"
)

func writeTokenFile(t *testing.T, name, token string, mode os.FileMode) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(token), mode); err != nil {
		t.Fatalf("write token: %v", err)
	}
	if err := os.Chmod(path, mode); err != nil {
		t.Fatalf("chmod token: %v", err)
	}
	return path
}

func newTestService(t *testing.T, controllerURL string) *Service {
	t.Helper()
	readToken := writeTokenFile(t, "read.token", "controller-read\n", 0o600)
	writeToken := writeTokenFile(t, "write.token", "controller-write\n", 0o600)
	return NewWithOptions(Config{
		ControllerURL:  controllerURL,
		ReadTokenFile:  readToken,
		WriteTokenFile: writeToken,
	}, Options{
		ReadTimeout:  200 * time.Millisecond,
		WriteTimeout: 300 * time.Millisecond,
		Now: func() time.Time {
			return time.Date(2026, 8, 11, 10, 0, 0, 0, time.UTC)
		},
		RequestID: func() string { return "manager-request-1" },
	})
}

func TestProxyForwardsOnlyWhitelistedReadRequestWithReadToken(t *testing.T) {
	var gotPath, gotQuery, gotAuthorization, gotCookie, gotAudit string
	controller := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.EscapedPath()
		gotQuery = r.URL.RawQuery
		gotAuthorization = r.Header.Get("Authorization")
		gotCookie = r.Header.Get("Cookie")
		gotAudit = r.Header.Get("X-Refill-Actor-ID")
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", "3")
		w.Header().Set("X-Request-ID", "controller-request")
		w.Header().Set("Set-Cookie", "controller=secret")
		_, _ = w.Write([]byte(`{"items":[]}`))
	}))
	defer controller.Close()

	service := newTestService(t, controller.URL)
	req := httptest.NewRequest(http.MethodGet, "/v0/management/cpa-refill/accounts/42/events?status=active&limit=50", nil)
	req.Header.Set("Authorization", "Bearer browser-admin-key")
	req.Header.Set("Cookie", "browser=session")
	req.Header.Set("X-Refill-Actor-ID", "browser-controlled")
	recorder := httptest.NewRecorder()

	service.Proxy(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", recorder.Code, recorder.Body.String())
	}
	if gotPath != "/internal/v1/management/accounts/42/events" || gotQuery != "status=active&limit=50" {
		t.Fatalf("controller target = %q?%s", gotPath, gotQuery)
	}
	if gotAuthorization != "Bearer controller-read" {
		t.Fatalf("Authorization = %q", gotAuthorization)
	}
	if gotCookie != "" || gotAudit != "" {
		t.Fatalf("browser headers leaked cookie=%q audit=%q", gotCookie, gotAudit)
	}
	if recorder.Header().Get("Retry-After") != "3" || recorder.Header().Get("X-Request-ID") != "controller-request" {
		t.Fatalf("safe response headers missing: %v", recorder.Header())
	}
	if recorder.Header().Get("Set-Cookie") != "" || recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("unsafe response headers: %v", recorder.Header())
	}
}

func TestProxyWriteUsesWriteTokenAndManagerGeneratedAuditHeaders(t *testing.T) {
	var gotAuthorization, gotActor, gotRequestID, gotStepUp, gotIdempotency string
	controller := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuthorization = r.Header.Get("Authorization")
		gotActor = r.Header.Get("X-Refill-Actor-ID")
		gotRequestID = r.Header.Get("X-Refill-Request-ID")
		gotStepUp = r.Header.Get("X-Refill-Step-Up-At")
		gotIdempotency = r.Header.Get("Idempotency-Key")
		w.WriteHeader(http.StatusAccepted)
	}))
	defer controller.Close()

	service := newTestService(t, controller.URL)
	req := httptest.NewRequest(http.MethodPost, "/v0/management/cpa-refill/actions/manual-refill", strings.NewReader(`{"quantity":1,"reason":"canary"}`))
	req.Header.Set("Authorization", "Bearer browser-admin-key")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "manual-refill-1")
	req.Header.Set("X-Refill-Actor-ID", "attacker")
	req.Header.Set("X-Refill-Step-Up-At", "2000-01-01T00:00:00Z")
	recorder := httptest.NewRecorder()

	service.Proxy(recorder, req)

	if recorder.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body=%s", recorder.Code, recorder.Body.String())
	}
	if gotAuthorization != "Bearer controller-write" || gotActor != "cpamp:admin" || gotRequestID != "manager-request-1" {
		t.Fatalf("write headers auth=%q actor=%q request=%q", gotAuthorization, gotActor, gotRequestID)
	}
	if gotStepUp != "2026-08-11T10:00:00Z" || gotIdempotency != "manual-refill-1" {
		t.Fatalf("write audit stepUp=%q idempotency=%q", gotStepUp, gotIdempotency)
	}
}

func TestProxyRejectsUnknownRoutesAndInvalidIDs(t *testing.T) {
	var hits atomic.Int32
	controller := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer controller.Close()
	service := newTestService(t, controller.URL)

	for _, target := range []string{
		"/v0/management/cpa-refill/unknown",
		"/v0/management/cpa-refill/accounts/not-a-number",
		"/v0/management/cpa-refill/accounts/42/unknown",
	} {
		recorder := httptest.NewRecorder()
		service.Proxy(recorder, httptest.NewRequest(http.MethodGet, target, nil))
		if recorder.Code != http.StatusNotFound {
			t.Fatalf("target %q status=%d body=%s", target, recorder.Code, recorder.Body.String())
		}
	}
	if hits.Load() != 0 {
		t.Fatalf("unknown route reached controller: %d", hits.Load())
	}
}

func TestProxyRequiresDistinctOwnerOnlyRegularTokenFiles(t *testing.T) {
	controller := httptest.NewServer(http.NotFoundHandler())
	defer controller.Close()

	t.Run("shared path", func(t *testing.T) {
		path := writeTokenFile(t, "shared.token", "secret", 0o600)
		service := New(Config{ControllerURL: controller.URL, ReadTokenFile: path, WriteTokenFile: path})
		recorder := httptest.NewRecorder()
		service.Proxy(recorder, httptest.NewRequest(http.MethodGet, "/v0/management/cpa-refill/overview", nil))
		if recorder.Code != http.StatusServiceUnavailable {
			t.Fatalf("status = %d", recorder.Code)
		}
	})

	t.Run("group readable", func(t *testing.T) {
		readPath := writeTokenFile(t, "read.token", "secret", 0o640)
		writePath := writeTokenFile(t, "write.token", "secret", 0o600)
		service := New(Config{ControllerURL: controller.URL, ReadTokenFile: readPath, WriteTokenFile: writePath})
		recorder := httptest.NewRecorder()
		service.Proxy(recorder, httptest.NewRequest(http.MethodGet, "/v0/management/cpa-refill/overview", nil))
		if recorder.Code != http.StatusServiceUnavailable || strings.Contains(recorder.Body.String(), readPath) {
			t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
		}
	})

	t.Run("symlink", func(t *testing.T) {
		target := writeTokenFile(t, "target.token", "secret", 0o600)
		link := filepath.Join(t.TempDir(), "read.token")
		if err := os.Symlink(target, link); err != nil {
			t.Skipf("symlink unavailable: %v", err)
		}
		writePath := writeTokenFile(t, "write.token", "secret", 0o600)
		service := New(Config{ControllerURL: controller.URL, ReadTokenFile: link, WriteTokenFile: writePath})
		recorder := httptest.NewRecorder()
		service.Proxy(recorder, httptest.NewRequest(http.MethodGet, "/v0/management/cpa-refill/overview", nil))
		if recorder.Code != http.StatusServiceUnavailable {
			t.Fatalf("status = %d", recorder.Code)
		}
	})

	t.Run("directory", func(t *testing.T) {
		writePath := writeTokenFile(t, "write.token", "write-secret", 0o600)
		service := New(Config{ControllerURL: controller.URL, ReadTokenFile: t.TempDir(), WriteTokenFile: writePath})
		recorder := httptest.NewRecorder()
		service.Proxy(recorder, httptest.NewRequest(http.MethodGet, "/v0/management/cpa-refill/overview", nil))
		if recorder.Code != http.StatusServiceUnavailable {
			t.Fatalf("status = %d", recorder.Code)
		}
	})

	t.Run("fifo", func(t *testing.T) {
		readPath := filepath.Join(t.TempDir(), "read.token")
		if err := syscall.Mkfifo(readPath, 0o600); err != nil {
			t.Skipf("fifo unavailable: %v", err)
		}
		writePath := writeTokenFile(t, "write.token", "write-secret", 0o600)
		service := New(Config{ControllerURL: controller.URL, ReadTokenFile: readPath, WriteTokenFile: writePath})
		recorder := httptest.NewRecorder()
		service.Proxy(recorder, httptest.NewRequest(http.MethodGet, "/v0/management/cpa-refill/overview", nil))
		if recorder.Code != http.StatusServiceUnavailable {
			t.Fatalf("status = %d", recorder.Code)
		}
	})

	t.Run("empty", func(t *testing.T) {
		readPath := writeTokenFile(t, "read.token", "", 0o600)
		writePath := writeTokenFile(t, "write.token", "write-secret", 0o600)
		service := New(Config{ControllerURL: controller.URL, ReadTokenFile: readPath, WriteTokenFile: writePath})
		recorder := httptest.NewRecorder()
		service.Proxy(recorder, httptest.NewRequest(http.MethodGet, "/v0/management/cpa-refill/overview", nil))
		if recorder.Code != http.StatusServiceUnavailable {
			t.Fatalf("status = %d", recorder.Code)
		}
	})

	t.Run("oversized", func(t *testing.T) {
		readPath := writeTokenFile(t, "read.token", strings.Repeat("x", int(maxTokenBytes)+1), 0o600)
		writePath := writeTokenFile(t, "write.token", "write-secret", 0o600)
		service := New(Config{ControllerURL: controller.URL, ReadTokenFile: readPath, WriteTokenFile: writePath})
		recorder := httptest.NewRecorder()
		service.Proxy(recorder, httptest.NewRequest(http.MethodGet, "/v0/management/cpa-refill/overview", nil))
		if recorder.Code != http.StatusServiceUnavailable {
			t.Fatalf("status = %d", recorder.Code)
		}
	})
}

func TestProxyRejectsAliasedOrDuplicateControllerTokens(t *testing.T) {
	var hits atomic.Int32
	controller := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer controller.Close()

	tests := []struct {
		name       string
		tokenPaths func(t *testing.T) (string, string)
	}{
		{
			name: "different paths referencing the same inode",
			tokenPaths: func(t *testing.T) (string, string) {
				t.Helper()
				directory := t.TempDir()
				readPath := filepath.Join(directory, "read.token")
				writePath := filepath.Join(directory, "write.token")
				if err := os.WriteFile(readPath, []byte("controller-token"), 0o600); err != nil {
					t.Fatalf("write read token: %v", err)
				}
				if err := os.Link(readPath, writePath); err != nil {
					t.Skipf("hard link unavailable: %v", err)
				}
				return readPath, writePath
			},
		},
		{
			name: "different files containing the same token",
			tokenPaths: func(t *testing.T) (string, string) {
				t.Helper()
				return writeTokenFile(t, "read.token", "controller-token\n", 0o600),
					writeTokenFile(t, "write.token", "controller-token\n", 0o600)
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			readPath, writePath := test.tokenPaths(t)
			service := New(Config{ControllerURL: controller.URL, ReadTokenFile: readPath, WriteTokenFile: writePath})
			recorder := httptest.NewRecorder()

			service.Proxy(recorder, httptest.NewRequest(http.MethodGet, "/v0/management/cpa-refill/overview", nil))

			if recorder.Code != http.StatusServiceUnavailable {
				t.Fatalf("status = %d, body=%s", recorder.Code, recorder.Body.String())
			}
		})
	}

	if hits.Load() != 0 {
		t.Fatalf("unsafe token configuration reached controller: %d", hits.Load())
	}
}

func TestProxyEnforcesRequestAndResponseLimits(t *testing.T) {
	var hits atomic.Int32
	controller := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits.Add(1)
		_, _ = w.Write(bytes.Repeat([]byte("x"), 2*1024*1024+1))
	}))
	defer controller.Close()
	service := newTestService(t, controller.URL)

	largeRequest := httptest.NewRecorder()
	service.Proxy(largeRequest, httptest.NewRequest(http.MethodPost, "/v0/management/cpa-refill/actions/pause", bytes.NewReader(bytes.Repeat([]byte("x"), 64*1024+1))))
	if largeRequest.Code != http.StatusRequestEntityTooLarge || hits.Load() != 0 {
		t.Fatalf("large request status=%d hits=%d", largeRequest.Code, hits.Load())
	}

	largeResponse := httptest.NewRecorder()
	service.Proxy(largeResponse, httptest.NewRequest(http.MethodGet, "/v0/management/cpa-refill/overview", nil))
	if largeResponse.Code != http.StatusBadGateway || hits.Load() != 1 {
		t.Fatalf("large response status=%d hits=%d bodyBytes=%d", largeResponse.Code, hits.Load(), largeResponse.Body.Len())
	}
}

func TestProxyDoesNotFollowRedirects(t *testing.T) {
	var redirectedHits atomic.Int32
	redirectTarget := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		redirectedHits.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer redirectTarget.Close()
	controller := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, redirectTarget.URL, http.StatusFound)
	}))
	defer controller.Close()

	recorder := httptest.NewRecorder()
	newTestService(t, controller.URL).Proxy(recorder, httptest.NewRequest(http.MethodGet, "/v0/management/cpa-refill/overview", nil))
	if recorder.Code != http.StatusFound || redirectedHits.Load() != 0 || recorder.Header().Get("Location") != "" {
		t.Fatalf("redirect status=%d hits=%d headers=%v", recorder.Code, redirectedHits.Load(), recorder.Header())
	}
}

func TestProxyUsesSeparateReadAndWriteTimeouts(t *testing.T) {
	controller := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(60 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer controller.Close()
	readToken := writeTokenFile(t, "read.token", "read", 0o600)
	writeToken := writeTokenFile(t, "write.token", "write", 0o600)
	service := NewWithOptions(Config{ControllerURL: controller.URL, ReadTokenFile: readToken, WriteTokenFile: writeToken}, Options{
		ReadTimeout: 20 * time.Millisecond, WriteTimeout: 120 * time.Millisecond,
		Now: func() time.Time { return time.Now().UTC() }, RequestID: func() string { return "request" },
	})

	readRecorder := httptest.NewRecorder()
	service.Proxy(readRecorder, httptest.NewRequest(http.MethodGet, "/v0/management/cpa-refill/overview", nil))
	if readRecorder.Code != http.StatusGatewayTimeout {
		t.Fatalf("read status = %d, body=%s", readRecorder.Code, readRecorder.Body.String())
	}

	writeRecorder := httptest.NewRecorder()
	service.Proxy(writeRecorder, httptest.NewRequest(http.MethodPost, "/v0/management/cpa-refill/actions/pause", strings.NewReader(`{"reason":"test"}`)))
	if writeRecorder.Code != http.StatusOK {
		t.Fatalf("write status = %d, body=%s", writeRecorder.Code, writeRecorder.Body.String())
	}
}

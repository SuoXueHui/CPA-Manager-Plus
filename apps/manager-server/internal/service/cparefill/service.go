package cparefill

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	maxRequestBytes  int64 = 64 * 1024
	maxResponseBytes int64 = 2 * 1024 * 1024
	maxTokenBytes    int64 = 8 * 1024
	readTimeout            = 5 * time.Second
	writeTimeout           = 10 * time.Second
)

// Config 只保存 Controller 固定地址和 token 文件路径，token 明文本身不进入 Manager 配置对象。
type Config struct {
	ControllerURL  string
	ReadTokenFile  string
	WriteTokenFile string
}

// Options 允许测试缩短超时并固定审计时间；生产环境始终使用安全默认值。
type Options struct {
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	Now          func() time.Time
	RequestID    func() string
}

type Service struct {
	config       Config
	client       *http.Client
	readTimeout  time.Duration
	writeTimeout time.Duration
	now          func() time.Time
	requestID    func() string
}

type proxyRoute struct {
	upstreamPath string
	write        bool
}

type tokenFile struct {
	value string
	info  os.FileInfo
}

type controllerTokens struct {
	read  string
	write string
}

var fixedRoutes = map[string]proxyRoute{
	http.MethodGet + " /v0/management/cpa-refill/overview":               {upstreamPath: "/internal/v1/management/overview"},
	http.MethodGet + " /v0/management/cpa-refill/accounts":               {upstreamPath: "/internal/v1/management/accounts"},
	http.MethodGet + " /v0/management/cpa-refill/decisions":              {upstreamPath: "/internal/v1/management/decisions"},
	http.MethodGet + " /v0/management/cpa-refill/orders":                 {upstreamPath: "/internal/v1/management/orders"},
	http.MethodGet + " /v0/management/cpa-refill/recoveries":             {upstreamPath: "/internal/v1/management/recoveries"},
	http.MethodGet + " /v0/management/cpa-refill/imports":                {upstreamPath: "/internal/v1/management/imports"},
	http.MethodGet + " /v0/management/cpa-refill/events":                 {upstreamPath: "/internal/v1/management/events"},
	http.MethodGet + " /v0/management/cpa-refill/policy":                 {upstreamPath: "/internal/v1/management/policy"},
	http.MethodPut + " /v0/management/cpa-refill/policy":                 {upstreamPath: "/internal/v1/management/policy", write: true},
	http.MethodPost + " /v0/management/cpa-refill/actions/pause":         {upstreamPath: "/internal/v1/management/actions/pause", write: true},
	http.MethodPost + " /v0/management/cpa-refill/actions/resume":        {upstreamPath: "/internal/v1/management/actions/resume", write: true},
	http.MethodPost + " /v0/management/cpa-refill/actions/recalculate":   {upstreamPath: "/internal/v1/management/actions/recalculate", write: true},
	http.MethodPost + " /v0/management/cpa-refill/actions/reset-circuit": {upstreamPath: "/internal/v1/management/actions/reset-circuit", write: true},
	http.MethodPost + " /v0/management/cpa-refill/actions/manual-refill": {upstreamPath: "/internal/v1/management/actions/manual-refill", write: true},
}

func New(cfg Config) *Service {
	return NewWithOptions(cfg, Options{})
}

func NewWithOptions(cfg Config, options Options) *Service {
	readBudget := options.ReadTimeout
	if readBudget <= 0 {
		readBudget = readTimeout
	}
	writeBudget := options.WriteTimeout
	if writeBudget <= 0 {
		writeBudget = writeTimeout
	}
	now := options.Now
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	requestID := options.RequestID
	if requestID == nil {
		requestID = newRequestID
	}
	return &Service{
		config:       cfg,
		client:       newHTTPClient(writeBudget),
		readTimeout:  readBudget,
		writeTimeout: writeBudget,
		now:          now,
		requestID:    requestID,
	}
}

// Proxy 只接受显式列出的管理路由；浏览器 Admin Key 和 Cookie 不会进入新建的 Controller 请求。
func (s *Service) Proxy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	route, ok := resolveRoute(r.Method, r.URL.Path)
	if !ok {
		writeError(w, http.StatusNotFound, "cpa_refill_route_not_found")
		return
	}
	if s == nil {
		writeError(w, http.StatusServiceUnavailable, "cpa_refill_controller_unavailable")
		return
	}
	targetURL, err := buildControllerURL(s.config.ControllerURL, route.upstreamPath, r.URL.RawQuery)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "cpa_refill_controller_unavailable")
		return
	}
	tokens, err := readControllerTokens(s.config.ReadTokenFile, s.config.WriteTokenFile)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "cpa_refill_controller_unavailable")
		return
	}
	token := tokens.read
	if route.write {
		token = tokens.write
	}
	body, err := readRequestBody(w, r)
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "cpa_refill_request_too_large")
		return
	}
	budget := s.readTimeout
	if route.write {
		budget = s.writeTimeout
	}
	ctx, cancel := context.WithTimeout(r.Context(), budget)
	defer cancel()
	upstreamRequest, err := http.NewRequestWithContext(ctx, r.Method, targetURL, bytes.NewReader(body))
	if err != nil {
		writeError(w, http.StatusBadGateway, "cpa_refill_proxy_failed")
		return
	}
	s.setRequestHeaders(upstreamRequest, r, token, route.write)

	upstreamResponse, err := s.client.Do(upstreamRequest)
	if err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) || errors.Is(err, context.DeadlineExceeded) {
			writeError(w, http.StatusGatewayTimeout, "cpa_refill_controller_timeout")
			return
		}
		writeError(w, http.StatusBadGateway, "cpa_refill_controller_unavailable")
		return
	}
	defer upstreamResponse.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(upstreamResponse.Body, maxResponseBytes+1))
	if err != nil {
		writeError(w, http.StatusBadGateway, "cpa_refill_invalid_response")
		return
	}
	if int64(len(responseBody)) > maxResponseBytes {
		writeError(w, http.StatusBadGateway, "cpa_refill_response_too_large")
		return
	}
	copyResponseHeaders(w.Header(), upstreamResponse.Header)
	w.WriteHeader(upstreamResponse.StatusCode)
	_, _ = w.Write(responseBody)
}

func resolveRoute(method, path string) (proxyRoute, bool) {
	if route, ok := fixedRoutes[method+" "+path]; ok {
		return route, true
	}
	if method != http.MethodGet {
		return proxyRoute{}, false
	}
	parts := strings.Split(strings.TrimPrefix(path, "/v0/management/cpa-refill/"), "/")
	if len(parts) < 2 || (parts[0] != "accounts" && parts[0] != "orders") {
		return proxyRoute{}, false
	}
	id, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || id <= 0 || strconv.FormatInt(id, 10) != parts[1] {
		return proxyRoute{}, false
	}
	if len(parts) == 2 {
		return proxyRoute{upstreamPath: "/internal/v1/management/" + parts[0] + "/" + parts[1]}, true
	}
	if len(parts) == 3 && parts[0] == "accounts" && parts[2] == "events" {
		return proxyRoute{upstreamPath: "/internal/v1/management/accounts/" + parts[1] + "/events"}, true
	}
	return proxyRoute{}, false
}

func buildControllerURL(rawBase, upstreamPath, rawQuery string) (string, error) {
	base, err := url.Parse(strings.TrimSpace(rawBase))
	if err != nil || base == nil || (base.Scheme != "http" && base.Scheme != "https") ||
		base.Host == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" ||
		(base.Path != "" && base.Path != "/") || base.RawPath != "" || base.Opaque != "" {
		return "", errors.New("invalid controller URL")
	}
	base.Path = upstreamPath
	base.RawQuery = rawQuery
	return base.String(), nil
}

// readControllerTokens 每次请求都同时校验读写 token，避免轮换后两者退化为同一凭据而扩大写权限。
func readControllerTokens(readPath, writePath string) (controllerTokens, error) {
	readToken, err := openTokenFile(readPath)
	if err != nil {
		return controllerTokens{}, err
	}
	writeToken, err := openTokenFile(writePath)
	if err != nil {
		return controllerTokens{}, err
	}
	// 路径文本不同并不代表凭据隔离：hardlink 可能仍指向同一 inode，内容也可能被误配成相同 token。
	if os.SameFile(readToken.info, writeToken.info) ||
		subtle.ConstantTimeCompare([]byte(readToken.value), []byte(writeToken.value)) == 1 {
		return controllerTokens{}, errors.New("read and write tokens must be distinct")
	}
	return controllerTokens{read: readToken.value, write: writeToken.value}, nil
}

// openTokenFile 通过 O_NOFOLLOW 打开后仅基于同一 fd 做 fstat 和有界读取，消除 Lstat/ReadFile 换档竞态。
func openTokenFile(path string) (tokenFile, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return tokenFile{}, errors.New("empty token path")
	}
	// O_NONBLOCK 避免攻击者把路径替换成 FIFO 后阻塞服务；普通文件读取不受影响。
	file, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK|syscall.O_NOCTTY, 0)
	if err != nil {
		return tokenFile{}, errors.New("token open failed")
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 || info.Size() <= 0 || info.Size() > maxTokenBytes {
		return tokenFile{}, errors.New("unsafe token file")
	}
	data, err := io.ReadAll(io.LimitReader(file, maxTokenBytes+1))
	if err != nil {
		return tokenFile{}, errors.New("token read failed")
	}
	token := strings.TrimSpace(string(data))
	if len(data) > int(maxTokenBytes) || token == "" || len(token) > int(maxTokenBytes) || strings.ContainsAny(token, "\r\n\x00") {
		return tokenFile{}, errors.New("invalid token")
	}
	return tokenFile{value: token, info: info}, nil
}

func readRequestBody(w http.ResponseWriter, r *http.Request) ([]byte, error) {
	if r.ContentLength > maxRequestBytes {
		return nil, errors.New("request body too large")
	}
	if r.Body == nil {
		return nil, nil
	}
	reader := http.MaxBytesReader(w, r.Body, maxRequestBytes)
	defer reader.Close()
	return io.ReadAll(reader)
}

func (s *Service) setRequestHeaders(target, source *http.Request, token string, write bool) {
	target.Header.Set("Authorization", "Bearer "+token)
	if accept := safeHeader(source.Header.Get("Accept")); accept != "" {
		target.Header.Set("Accept", accept)
	} else {
		target.Header.Set("Accept", "application/json")
	}
	if contentType := safeHeader(source.Header.Get("Content-Type")); contentType != "" {
		target.Header.Set("Content-Type", contentType)
	}
	if !write {
		return
	}
	requestID := s.requestID()
	idempotencyKey := safeHeader(source.Header.Get("Idempotency-Key"))
	if idempotencyKey == "" {
		idempotencyKey = requestID
	}
	target.Header.Set("Idempotency-Key", idempotencyKey)
	// Actor 与 step-up 时间只能由已完成 Admin Key 校验的 Manager 生成，禁止信任浏览器同名头。
	target.Header.Set("X-Refill-Actor-ID", "cpamp:admin")
	target.Header.Set("X-Refill-Request-ID", requestID)
	target.Header.Set("X-Refill-Step-Up-At", s.now().UTC().Format(time.RFC3339))
}

func safeHeader(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 128 || strings.ContainsAny(value, "\r\n\x00") {
		return ""
	}
	return value
}

func copyResponseHeaders(target, source http.Header) {
	target.Set("Cache-Control", "no-store")
	for _, name := range []string{"Content-Type", "Retry-After", "X-Request-ID"} {
		if value := safeHeader(source.Get(name)); value != "" {
			target.Set(name, value)
		}
	}
	if target.Get("Content-Type") == "" {
		target.Set("Content-Type", "application/json; charset=utf-8")
	}
}

func newHTTPClient(responseHeaderTimeout time.Duration) *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			Proxy:                 nil,
			DialContext:           (&net.Dialer{Timeout: time.Second, KeepAlive: 30 * time.Second}).DialContext,
			ForceAttemptHTTP2:     true,
			MaxIdleConns:          4,
			MaxIdleConnsPerHost:   2,
			MaxConnsPerHost:       4,
			IdleConnTimeout:       30 * time.Second,
			TLSHandshakeTimeout:   2 * time.Second,
			ResponseHeaderTimeout: responseHeaderTimeout,
			ExpectContinueTimeout: time.Second,
		},
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func newRequestID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err == nil {
		return hex.EncodeToString(value[:])
	}
	return strconv.FormatInt(time.Now().UTC().UnixNano(), 10)
}

func writeError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code})
}

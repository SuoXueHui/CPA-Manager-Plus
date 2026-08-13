package httpqueue

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var ErrUnsupported = errors.New("http usage queue is unsupported")

type StatusError struct {
	StatusCode int
	Status     string
	Body       string
}

func (e *StatusError) Error() string {
	if e.Body == "" {
		return "usage queue request failed: " + e.Status
	}
	return "usage queue request failed: " + e.Status + ": " + e.Body
}

type Client struct {
	BaseURL       string
	ManagementKey string
	HTTPClient    *http.Client
}

type ClaimItem struct {
	DeliveryID string `json:"delivery_id"`
	Payload    string `json:"-"`
}

type ClaimResult struct {
	LeaseID string      `json:"lease_id"`
	Items   []ClaimItem `json:"items"`
}

type claimResponse struct {
	LeaseID string `json:"lease_id"`
	Items   []struct {
		DeliveryID string          `json:"delivery_id"`
		Payload    json.RawMessage `json:"payload"`
	} `json:"items"`
}

func New(baseURL string, managementKey string) *Client {
	return &Client{
		BaseURL:       strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		ManagementKey: strings.TrimSpace(managementKey),
		HTTPClient:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) Pop(ctx context.Context, count int) ([]string, error) {
	if count <= 0 {
		count = 1
	}
	endpoint, err := c.endpoint(count)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	if c.ManagementKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.ManagementKey)
	}

	client := c.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 1024))
		if isUnsupportedStatus(res.StatusCode) {
			return nil, fmt.Errorf("%w: %s", ErrUnsupported, res.Status)
		}
		return nil, &StatusError{
			StatusCode: res.StatusCode,
			Status:     res.Status,
			Body:       strings.TrimSpace(string(body)),
		}
	}

	var entries []json.RawMessage
	decoder := json.NewDecoder(res.Body)
	if err := decoder.Decode(&entries); err != nil {
		return nil, err
	}

	items := make([]string, 0, len(entries))
	for _, entry := range entries {
		trimmed := bytes.TrimSpace(entry)
		if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
			continue
		}
		if trimmed[0] == '"' {
			var text string
			if err := json.Unmarshal(trimmed, &text); err != nil {
				return nil, err
			}
			if strings.TrimSpace(text) != "" {
				items = append(items, text)
			}
			continue
		}
		if trimmed[0] != '{' {
			return nil, fmt.Errorf("unexpected usage queue item %s", string(trimmed))
		}
		items = append(items, string(trimmed))
	}
	return items, nil
}

func (c *Client) Claim(ctx context.Context, count int, leaseSeconds int) (ClaimResult, error) {
	if count <= 0 {
		count = 1
	}
	if leaseSeconds <= 0 {
		leaseSeconds = 30
	}
	var response claimResponse
	if err := c.postJSON(ctx, "/v0/management/usage-queue/claim", map[string]int{
		"count":         count,
		"lease_seconds": leaseSeconds,
	}, &response); err != nil {
		return ClaimResult{}, err
	}
	result := ClaimResult{LeaseID: response.LeaseID, Items: make([]ClaimItem, 0, len(response.Items))}
	for _, item := range response.Items {
		payload := strings.TrimSpace(string(item.Payload))
		if payload == "" {
			payload = "null"
		}
		result.Items = append(result.Items, ClaimItem{DeliveryID: item.DeliveryID, Payload: payload})
	}
	return result, nil
}

// Ack confirms only deliveries whose local SQLite transaction already committed.
func (c *Client) Ack(ctx context.Context, leaseID string, deliveryIDs []string) (int, error) {
	var response struct {
		Acked int `json:"acked"`
	}
	err := c.postJSON(ctx, "/v0/management/usage-queue/ack", struct {
		LeaseID     string   `json:"lease_id"`
		DeliveryIDs []string `json:"delivery_ids"`
	}{LeaseID: leaseID, DeliveryIDs: deliveryIDs}, &response)
	return response.Acked, err
}

func (c *Client) postJSON(ctx context.Context, path string, requestBody any, responseBody any) error {
	base := strings.TrimRight(strings.TrimSpace(c.BaseURL), "/")
	if base == "" {
		return errors.New("upstream URL is empty")
	}
	if !strings.Contains(base, "://") {
		base = "http://" + base
	}
	parsed, err := url.Parse(base + path)
	if err != nil {
		return err
	}
	body, err := json.Marshal(requestBody)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, parsed.String(), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.ManagementKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.ManagementKey)
	}
	client := c.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		response, _ := io.ReadAll(io.LimitReader(res.Body, 1024))
		if isUnsupportedStatus(res.StatusCode) {
			return fmt.Errorf("%w: %s", ErrUnsupported, res.Status)
		}
		return &StatusError{StatusCode: res.StatusCode, Status: res.Status, Body: strings.TrimSpace(string(response))}
	}
	if responseBody == nil {
		return nil
	}
	return json.NewDecoder(res.Body).Decode(responseBody)
}

func (c *Client) endpoint(count int) (string, error) {
	base := strings.TrimRight(strings.TrimSpace(c.BaseURL), "/")
	if base == "" {
		return "", errors.New("upstream URL is empty")
	}
	if !strings.Contains(base, "://") {
		base = "http://" + base
	}
	parsed, err := url.Parse(base + "/v0/management/usage-queue")
	if err != nil {
		return "", err
	}
	query := parsed.Query()
	query.Set("count", strconv.Itoa(count))
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

func isUnsupportedStatus(status int) bool {
	return status == http.StatusNotFound ||
		status == http.StatusMethodNotAllowed ||
		status == http.StatusNotImplemented
}

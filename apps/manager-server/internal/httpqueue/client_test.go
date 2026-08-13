package httpqueue

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestClientPopReadsUsageQueue(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v0/management/usage-queue" {
			t.Fatalf("path = %q", r.URL.Path)
		}
		if r.URL.Query().Get("count") != "25" {
			t.Fatalf("count = %q", r.URL.Query().Get("count"))
		}
		if r.Header.Get("Authorization") != "Bearer management-key" {
			t.Fatalf("authorization = %q", r.Header.Get("Authorization"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[
			{"timestamp":"2026-05-06T00:00:00Z","model":"gpt-test"},
			"{\"timestamp\":\"2026-05-06T00:00:01Z\",\"model\":\"gpt-string\"}",
			null
		]`))
	}))
	t.Cleanup(upstream.Close)

	items, err := New(upstream.URL, "management-key").Pop(context.Background(), 25)
	if err != nil {
		t.Fatalf("pop: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("items len = %d, want 2: %#v", len(items), items)
	}
	if !strings.Contains(items[0], `"model":"gpt-test"`) {
		t.Fatalf("object item = %s", items[0])
	}
	if !strings.Contains(items[1], `"model":"gpt-string"`) {
		t.Fatalf("string item = %s", items[1])
	}
}

func TestClientPopClassifiesUnsupportedEndpoint(t *testing.T) {
	upstream := httptest.NewServer(http.NotFoundHandler())
	t.Cleanup(upstream.Close)

	_, err := New(upstream.URL, "management-key").Pop(context.Background(), 10)
	if !errors.Is(err, ErrUnsupported) {
		t.Fatalf("err = %v, want ErrUnsupported", err)
	}
}

func TestClientPopKeepsAuthErrorsDistinct(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "bad key", http.StatusUnauthorized)
	}))
	t.Cleanup(upstream.Close)

	_, err := New(upstream.URL, "management-key").Pop(context.Background(), 10)
	var statusErr *StatusError
	if !errors.As(err, &statusErr) {
		t.Fatalf("err = %T %v, want StatusError", err, err)
	}
	if statusErr.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d", statusErr.StatusCode)
	}
	if errors.Is(err, ErrUnsupported) {
		t.Fatalf("auth error must not be classified as unsupported")
	}
}

func TestClientClaimAndAckUsageQueue(t *testing.T) {
	var acked bool
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer management-key" {
			t.Fatalf("authorization = %q", r.Header.Get("Authorization"))
		}
		switch r.URL.Path {
		case "/v0/management/usage-queue/claim":
			if r.Method != http.MethodPost {
				t.Fatalf("claim method = %q", r.Method)
			}
			var request map[string]int
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Fatalf("decode claim request: %v", err)
			}
			if request["count"] != 25 || request["lease_seconds"] != 120 {
				t.Fatalf("claim request = %#v", request)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"lease_id":"lease-1","items":[{"delivery_id":"delivery-1","payload":{"timestamp":"2026-05-06T00:00:00Z","model":"gpt-test"}}]}`))
		case "/v0/management/usage-queue/ack":
			if r.Method != http.MethodPost {
				t.Fatalf("ack method = %q", r.Method)
			}
			var request struct {
				LeaseID     string   `json:"lease_id"`
				DeliveryIDs []string `json:"delivery_ids"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Fatalf("decode ack request: %v", err)
			}
			if request.LeaseID != "lease-1" || len(request.DeliveryIDs) != 1 || request.DeliveryIDs[0] != "delivery-1" {
				t.Fatalf("ack request = %#v", request)
			}
			acked = true
			_, _ = w.Write([]byte(`{"acked":1}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(upstream.Close)

	client := New(upstream.URL, "management-key")
	claim, err := client.Claim(context.Background(), 25, 120)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	if claim.LeaseID != "lease-1" || len(claim.Items) != 1 {
		t.Fatalf("claim = %#v", claim)
	}
	if claim.Items[0].DeliveryID != "delivery-1" || !strings.Contains(claim.Items[0].Payload, `"model":"gpt-test"`) {
		t.Fatalf("claim item = %#v", claim.Items[0])
	}
	count, err := client.Ack(context.Background(), claim.LeaseID, []string{claim.Items[0].DeliveryID})
	if err != nil {
		t.Fatalf("ack: %v", err)
	}
	if count != 1 || !acked {
		t.Fatalf("acked count = %d, called = %v", count, acked)
	}
}

func TestClientClaimClassifiesUnsupportedEndpoint(t *testing.T) {
	for _, status := range []int{http.StatusNotFound, http.StatusMethodNotAllowed, http.StatusNotImplemented} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				http.Error(w, "unsupported", status)
			}))
			t.Cleanup(upstream.Close)

			_, err := New(upstream.URL, "management-key").Claim(context.Background(), 10, 30)
			if !errors.Is(err, ErrUnsupported) {
				t.Fatalf("err = %v, want ErrUnsupported", err)
			}
		})
	}
}

func TestClientClaimRetainsNullPayloadForDeadLetter(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"lease_id":"lease-1","items":[{"delivery_id":"poison-1","payload":null}]}`))
	}))
	t.Cleanup(upstream.Close)

	claim, err := New(upstream.URL, "management-key").Claim(context.Background(), 10, 30)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	if len(claim.Items) != 1 || claim.Items[0].DeliveryID != "poison-1" || claim.Items[0].Payload != "null" {
		t.Fatalf("claim = %#v", claim)
	}
}

package usageevent

import (
	"path/filepath"
	"strings"
	"testing"

	sqliterepo "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/repository/sqlite"
)

func TestAccountModelStatsQueryConstrainsUsageEventsBeforePricing(t *testing.T) {
	db, err := sqliterepo.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	query := pricingBandedUsageEventsCTEWithBaseFilter("timestamp_ms >= ? and timestamp_ms < ?") + `
select count(*)
from banded_usage_events
where timestamp_ms >= ? and timestamp_ms < ? and failed = 0`
	rows, err := db.Query(`explain query plan `+query, int64(1_000), int64(2_000), int64(1_000), int64(2_000))
	if err != nil {
		t.Fatalf("explain account stats query: %v", err)
	}
	defer rows.Close()

	usesTimestampIndex := false
	fullUsageScan := false
	for rows.Next() {
		var id, parent, notUsed int
		var detail string
		if err := rows.Scan(&id, &parent, &notUsed, &detail); err != nil {
			t.Fatalf("scan query plan: %v", err)
		}
		usesTimestampIndex = usesTimestampIndex || strings.Contains(detail, "USING INDEX idx_usage_events_timestamp")
		fullUsageScan = fullUsageScan || strings.Contains(detail, "SCAN usage_events")
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("query plan rows: %v", err)
	}
	if !usesTimestampIndex || fullUsageScan {
		t.Fatalf("account stats query did not constrain usage_events with the timestamp index")
	}
}

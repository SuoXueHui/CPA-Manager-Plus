import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import layoutSource from '@/components/layout/MainLayout.tsx?raw';
import routesSource from '@/router/MainRoutes.tsx?raw';
import pageSource from './CPARefillPage.tsx?raw';
import { CPA_REFILL_OVERVIEW_POLL_MS, shouldPollCPARefillOverview } from './polling';

describe('CPA refill console wiring', () => {
  it('registers a dedicated route and left navigation item', () => {
    expect(routesSource).toContain("path: '/cpa-refill'");
    expect(routesSource).toContain('<CPARefillPage />');
    expect(routesSource).toContain('feature="managerService"');
    expect(layoutSource).toContain("path: '/cpa-refill'");
    expect(layoutSource).toContain("label: t('nav.cpa_refill')");
    expect(layoutSource).toContain('featureAvailability.managerServiceAvailable');
    expect(layoutSource).toContain('!demoMode');
    expect(routesSource).toContain("feature === 'managerService' && __DEMO_SITE__ && isDemoMode()");
  });

  it('provides account details, filters and bounded overview polling', () => {
    expect(pageSource).toContain('accountDetail');
    expect(pageSource).toContain('accountEvents');
    expect(pageSource).toContain('filtersByResource');
    expect(pageSource).toContain('import_status');
    expect(pageSource).toContain('provider:');
    expect(pageSource).toContain('level:');
    expect(pageSource).toContain('from:');
    expect(pageSource).toContain('to:');
    expect(pageSource).toContain('eventHasMore');
    expect(pageSource).toContain('pendingWriteKeysRef');
    expect(CPA_REFILL_OVERVIEW_POLL_MS).toBe(15_000);
    expect(shouldPollCPARefillOverview('visible')).toBe(true);
    expect(shouldPollCPARefillOverview('hidden')).toBe(false);
  });

  it('renders Codex account identity, bounded usage and lifecycle fields', () => {
    expect(pageSource).toContain("accounts: ['email', 'status', 'usage_windows', 'imported_at', 'expires_at', 'last_request_at']");
    expect(pageSource).not.toContain("accounts: ['email', 'status', 'total_tokens', 'cost_micro_usd'");
    expect(pageSource).not.toContain("accounts: ['id', 'masked_email'");
    expect(pageSource).toContain("const formatCompactCount");
    expect(pageSource).toContain("const formatMicroUSD");
    expect(pageSource).toContain("function UsageWindowCell");
    expect(pageSource).toContain("styles.usageWindowCell");
    expect(pageSource).toContain("cpa_refill.usage_windows_local_hint");
    expect(pageSource).toContain("CPARefillUsageWindows");
    expect(pageSource).toContain("key === 'status'");
    expect(pageSource).toContain("key === 'source'");
    expect(pageSource).toContain("key === 'import_status'");
    expect(pageSource).toContain("resource === 'orders' || resource === 'recoveries'");
    expect(pageSource).toContain("search_account_placeholder");
    expect(pageSource).toContain('value="codex"');
    expect(pageSource).toContain('grouped: resource === \'accounts\' ? true : undefined');
    expect(pageSource).toContain('credential_count');
    expect(pageSource).toContain('credential_ids');
    expect(pageSource).toContain('merged');
    expect(pageSource).toContain('cpa_refill.account_merge_hint');
  });

  it('keeps local usage window formatting bounded and resilient', () => {
    expect(pageSource).toContain("if (!value || typeof value !== 'object') return null");
    expect(pageSource).toContain("Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())");
    expect(pageSource).toContain("if (!windows) return <span className={styles.usageWindowMissing}>—</span>");
    expect(pageSource).toContain("maximumFractionDigits: 1");
    expect(pageSource).toContain("toFixed(2)");
    expect(pageSource).not.toContain('setInterval(() => setUsage');
  });

  it('uses the shared Select and Chinese decision presentation', () => {
    expect(pageSource).toContain("import { Select } from '@/components/ui/Select'");
    expect(pageSource).not.toContain('<select value={filters.status}');
    expect(pageSource).not.toContain('<select value={filters.import_status}');
    expect(pageSource).not.toContain('<select value={filters.level}');
    expect(pageSource).not.toContain('<select value={policy.desired_mode}');
    expect(pageSource).toContain("key === 'reason'");
    expect(pageSource).toContain("key === 'event_type'");
    expect(pageSource).toContain("if (key === 'amount') return formatFen(value)");
    expect(zhCN.cpa_refill.fields.current_capacity).toBe('当前容量');
    expect(zhCN.cpa_refill.fields.target_capacity).toBe('目标容量');
    expect(zhCN.cpa_refill.fields.deficit).toBe('容量缺口');
    expect(zhCN.cpa_refill.fields.expires_at).toBe('订阅到期时间');
    expect(zhCN.cpa_refill.values.reason.source_incomplete).toBeTruthy();
  });

  it('renders account details with the shared modal drawer and resilient long-field layout', () => {
    expect(pageSource).toContain("import { Drawer } from '@/components/ui/Drawer'");
    expect(pageSource).toContain('<Drawer');
    expect(pageSource).toContain('open={Boolean(selectedDetail) || detailLoading}');
    expect(pageSource).toContain("setDetailKind(detailResource)");
    expect(pageSource).toContain("detailKind === 'orders'");
    expect(pageSource).toContain('className={styles.detailDrawer}');
    expect(pageSource).toContain('className={styles.detailList}');
    expect(pageSource).toContain('className={styles.detailRow}');
    expect(pageSource).not.toContain('<aside className={styles.detailPanel}');
  });

  it('ships navigation and page labels in every supported locale', () => {
    for (const locale of [en, ru, zhCN, zhTW]) {
      expect(locale.nav.cpa_refill).toBeTruthy();
      expect(locale.cpa_refill.title).toBeTruthy();
      expect(locale.cpa_refill.tabs.accounts).toBeTruthy();
      expect(locale.cpa_refill.account_detail).toBeTruthy();
      expect(locale.cpa_refill.fields.email).toBeTruthy();
      expect(locale.cpa_refill.fields.total_tokens).toBeTruthy();
      expect(locale.cpa_refill.fields.cost_micro_usd).toBeTruthy();
      expect(locale.cpa_refill.fields.usage_windows).toBeTruthy();
      expect(locale.cpa_refill.usage_windows_local_label).toBeTruthy();
      expect(locale.cpa_refill.usage_windows_local_hint).toBeTruthy();
      expect(locale.cpa_refill.usage_requests).toBeTruthy();
      expect(locale.cpa_refill.usage_account_cost).toBeTruthy();
      expect(locale.cpa_refill.usage_remaining).toBeTruthy();
      expect(locale.cpa_refill.usage_remaining_time).toBeTruthy();
      expect(locale.cpa_refill.usage_statistics_range).toBeTruthy();
      expect(locale.cpa_refill.account_merge_title).toBeTruthy();
      expect(locale.cpa_refill.account_merge_hint).toBeTruthy();
      expect(locale.cpa_refill.account_merged_badge).toBeTruthy();
      expect(locale.cpa_refill.account_merged_detail_hint).toBeTruthy();
      expect(locale.cpa_refill.fields.imported_at).toBeTruthy();
      expect(locale.cpa_refill.fields.expires_at).toBeTruthy();
      expect(locale.cpa_refill.values.status.active).toBeTruthy();
    }
  });
});

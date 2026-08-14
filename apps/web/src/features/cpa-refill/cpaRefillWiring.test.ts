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

  it('shows Controller operating statistics on the production overview page', () => {
    expect(pageSource).toContain('<OperatingStatisticsCards statistics={overview?.statistics} />');
    expect(pageSource).toContain("cpa_refill.today_purchase_cost");
    expect(pageSource).toContain("cpa_refill.supplier_available_balance");
    expect(pageSource).toContain("cpa_refill.total_tokens_consumed");
    expect(pageSource).toContain("cpa_refill.total_account_usage_cost");
    for (const locale of [en, ru, zhCN, zhTW]) {
      expect(locale.cpa_refill.operating_statistics).toBeTruthy();
      expect(locale.cpa_refill.today_purchase_cost).toBeTruthy();
      expect(locale.cpa_refill.supplier_available_balance).toBeTruthy();
      expect(locale.cpa_refill.total_tokens_consumed).toBeTruthy();
      expect(locale.cpa_refill.total_account_usage_cost).toBeTruthy();
      expect(locale.cpa_refill.statistics_unavailable).toBeTruthy();
    }
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
    expect(pageSource).toContain("quotaValue={item.quota_windows}");
    expect(pageSource).toContain('role="progressbar"');
    expect(pageSource).toContain('aria-valuenow={usedPercent}');
    expect(pageSource).toContain("key === 'status'");
    expect(pageSource).toContain("key === 'source'");
    expect(pageSource).toContain("key === 'import_status'");
    expect(pageSource).toContain("resource === 'orders' || resource === 'recoveries'");
    expect(pageSource).toContain("search_account_placeholder");
    expect(pageSource).toContain('value="codex"');
    expect(pageSource).toContain("grouped: resource === 'accounts' ? true : undefined");
    expect(pageSource).toContain('CredentialCostBreakdown');
    expect(pageSource).toContain('credential_cost_title');
    expect(pageSource).toContain('AccountIdentityCell');
    expect(pageSource).toContain('AccountStatusCell');
    expect(pageSource).toContain('account_merge_hint');
    expect(pageSource).toContain('credential_count');
    expect(pageSource).toContain('account_merged_detail_hint');
  });

  it('keeps local usage window formatting bounded and resilient', () => {
    expect(pageSource).toContain("if (!value || typeof value !== 'object') return null");
    expect(pageSource).toContain("Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())");
    expect(pageSource).toContain("if (!windows) return <span className={styles.usageWindowMissing}>—</span>");
    expect(pageSource).toContain("maximumFractionDigits: 1");
    expect(pageSource).toContain("toFixed(2)");
    expect(pageSource).not.toContain('setInterval(() => setUsage');
    expect(pageSource.match(/window\.setInterval/g)).toHaveLength(2);
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

  it('configures a minimum healthy account buffer with Chinese guidance', () => {
    expect(pageSource).toContain("'minimum_healthy_accounts'");
    expect(pageSource).toContain('minimum_healthy_accounts_hint');
    expect(zhCN.cpa_refill.fields.minimum_healthy_accounts).toBe('最低健康账号数');
    expect(zhCN.cpa_refill.minimum_healthy_accounts_hint).toContain('0');
    for (const locale of [en, ru, zhCN, zhTW]) {
      expect(locale.cpa_refill.fields.minimum_healthy_accounts).toBeTruthy();
      expect(locale.cpa_refill.minimum_healthy_accounts_hint).toBeTruthy();
    }
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
      expect(locale.cpa_refill.credential_cost_title).toBeTruthy();
      expect(locale.cpa_refill.credential_cost_hint).toBeTruthy();
      expect(locale.cpa_refill.credential_cost_missing).toBeTruthy();
      expect(locale.cpa_refill.fields.email).toBeTruthy();
      expect(locale.cpa_refill.fields.total_tokens).toBeTruthy();
      expect(locale.cpa_refill.fields.cost_micro_usd).toBeTruthy();
      expect(locale.cpa_refill.fields.usage_windows).toBeTruthy();
      expect(locale.cpa_refill.usage_windows_local_label).toBeTruthy();
      expect(locale.cpa_refill.usage_windows_local_hint).toBeTruthy();
      expect(locale.cpa_refill.usage_windows_summary_label).toBeTruthy();
      expect(locale.cpa_refill.usage_quota_official_hint).toBeTruthy();
      expect(locale.cpa_refill.usage_requests).toBeTruthy();
      expect(locale.cpa_refill.usage_account_cost).toBeTruthy();
      expect(locale.cpa_refill.usage_local_estimate_label).toBeTruthy();
      expect(locale.cpa_refill.usage_local_estimate_hint).toBeTruthy();
      expect(locale.cpa_refill.usage_used_label).toBeTruthy();
      expect(locale.cpa_refill.usage_quota_unavailable).toBeTruthy();
      expect(locale.cpa_refill.usage_quota_unprobed).toBeTruthy();
      expect(locale.cpa_refill.usage_quota_fetch_failed).toBeTruthy();
      expect(locale.cpa_refill.usage_quota_window_missing).toBeTruthy();
      expect(locale.cpa_refill.usage_quota_invalid).toBeTruthy();
      expect(locale.cpa_refill.usage_quota_stale).toBeTruthy();
      expect(locale.cpa_refill.usage_remaining_label).toBeTruthy();
      expect(locale.cpa_refill.usage_resets_in).toBeTruthy();
      expect(locale.cpa_refill.fields.imported_at).toBeTruthy();
      expect(locale.cpa_refill.fields.expires_at).toBeTruthy();
      expect(locale.cpa_refill.values.status.active).toBeTruthy();
    }
  });

  it('labels every account usage amount as a local estimate rather than an upstream bill', () => {
    const locales = [
      { locale: en, upstreamBill: /upstream bill|(?:OpenAI|ChatGPT).*bills?/i },
      { locale: ru, upstreamBill: /(?:OpenAI|ChatGPT).*(?:сч[её]т|сч[её]том)|(?:сч[её]т|сч[её]том).*(?:OpenAI|ChatGPT)/i },
      { locale: zhCN, upstreamBill: /上游账单|(?:OpenAI|ChatGPT).*账单/i },
      { locale: zhTW, upstreamBill: /上游帳單|(?:OpenAI|ChatGPT).*帳單/i },
    ];
    const disclosureKeys = [
      'operating_statistics_hint',
      'statistics_today_usage_hint',
      'account_merge_hint',
      'account_merged_detail_hint',
      'credential_cost_hint',
      'usage_local_estimate_hint',
    ] as const;
    for (const { locale, upstreamBill } of locales) {
      expect(locale.cpa_refill.usage_account_cost).toBe(locale.cpa_refill.usage_local_estimate_label);
      expect(locale.cpa_refill.total_account_usage_cost).toContain(locale.cpa_refill.usage_local_estimate_label);
      expect(locale.cpa_refill.credential_cost_title).toContain(locale.cpa_refill.usage_local_estimate_label);
      expect(locale.cpa_refill.fields.cost_micro_usd.toLowerCase()).toContain(
        locale.cpa_refill.usage_local_estimate_label.toLowerCase()
      );
      expect(locale.cpa_refill.credential_cost_hint.toLowerCase()).not.toContain('exact');
      expect(locale.cpa_refill.usage_account_cost.toLowerCase()).not.toContain('billed');
      for (const key of disclosureKeys) {
        expect(locale.cpa_refill[key]).toMatch(upstreamBill);
      }
    }
    expect(pageSource).toContain("title={t('cpa_refill.usage_local_estimate_hint')}");
  });
});

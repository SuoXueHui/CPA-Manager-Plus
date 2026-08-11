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

  it('ships navigation and page labels in every supported locale', () => {
    for (const locale of [en, ru, zhCN, zhTW]) {
      expect(locale.nav.cpa_refill).toBeTruthy();
      expect(locale.cpa_refill.title).toBeTruthy();
      expect(locale.cpa_refill.tabs.accounts).toBeTruthy();
      expect(locale.cpa_refill.account_detail).toBeTruthy();
    }
  });
});

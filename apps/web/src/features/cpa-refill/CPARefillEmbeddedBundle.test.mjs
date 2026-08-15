import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import zhCN from '../../i18n/locales/zh-CN.json';

const featureDir = path.dirname(fileURLToPath(import.meta.url));
const embeddedPanelPath = path.resolve(
  featureDir,
  '../../../../manager-server/internal/httpapi/web/management.html'
);

describe('CPA refill embedded management bundle', () => {
  it('ships the localized policy save guidance used by the source page', () => {
    const embeddedPanel = readFileSync(embeddedPanelPath, 'utf8');
    expect(embeddedPanel).toContain(zhCN.cpa_refill.policy_state_conflict);
    expect(embeddedPanel).toContain(zhCN.cpa_refill.policy_saved_pending);
    expect(embeddedPanel).toContain(zhCN.cpa_refill.policy_idempotency_conflict);
  });

  it('ships the current core overdraft status panel instead of a stale bundle', () => {
    const embeddedPanel = readFileSync(embeddedPanelPath, 'utf8');
    expect(embeddedPanel).toContain(zhCN.cpa_refill.core_overdraft_title);
    expect(embeddedPanel).toContain('core_overdraft_observed');
    expect(embeddedPanel).toContain('core_overdraft_process_success');
    expect(embeddedPanel).toContain('core_overdraft_canceled');
    expect(embeddedPanel).toContain('core_overdraft_other_failure');
    expect(embeddedPanel).toContain('core_overdraft_account_no_activity');
    expect(embeddedPanel).toContain('core_overdraft_account_minutes_ago');
    expect(embeddedPanel).toContain('account-retention-seconds');
  });
});

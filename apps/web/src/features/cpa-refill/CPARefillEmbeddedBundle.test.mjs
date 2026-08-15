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
  it('ships the localized policy conflict guidance used by the source page', () => {
    const embeddedPanel = readFileSync(embeddedPanelPath, 'utf8');
    expect(embeddedPanel).toContain(zhCN.cpa_refill.policy_state_conflict);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const featureDir = path.dirname(fileURLToPath(import.meta.url));
const stylesheet = readFileSync(path.join(featureDir, 'CPARefillPage.module.scss'), 'utf8');

describe('CPA refill usage window styles', () => {
  it('uses defined theme surfaces and readable window badge tokens', () => {
    expect(stylesheet).not.toContain('--surface-color');
    expect(stylesheet).toContain(
      '.fiveHourBadge { background: var(--count-badge-bg); color: var(--text-primary);'
    );
    expect(stylesheet).toContain(
      '.sevenDayBadge { background: var(--success-badge-bg); color: var(--text-primary);'
    );
  });
});

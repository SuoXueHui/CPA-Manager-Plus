import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { CredentialCostBreakdown, UsageWindowCell } from './CPARefillPage';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { range?: string }) =>
        options?.range ? `${key}:${options.range}` : key,
    }),
  };
});

vi.mock('@/components/quota', () => ({
  QuotaInfoTooltip: ({ ariaLabel }: { ariaLabel: string }) => (
    <span data-testid="usage-window-info" aria-label={ariaLabel} tabIndex={0} />
  ),
}));

describe('UsageWindowCell', () => {
  it('renders local statistics and official quota progress for both windows', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <UsageWindowCell
          value={{
            five_hour: {
              requests: 97,
              tokens: 1_900_000,
              cost_micro_usd: 7_420_000,
              window_start: '2026-08-13T07:00:00Z',
              window_end: '2026-08-13T12:00:00Z',
            },
            seven_day: {
              requests: 221,
              tokens: 22_500_000,
              cost_micro_usd: 22_660_000,
              window_start: '2026-08-06T12:00:00Z',
              window_end: '2026-08-13T12:00:00Z',
            },
          }}
          quotaValue={{
            source: 'chatgpt_wham',
            status: 'fresh',
            error_code: '',
            plan_type: 'pro',
            fetched_at: '2026-08-13T12:00:00Z',
            five_hour: {
              used_milli_percent: 16000,
              remaining_milli_percent: 84000,
              window_seconds: 18000,
              reset_at: '2099-08-13T16:00:00Z',
            },
            seven_day: {
              used_milli_percent: 28500,
              remaining_milli_percent: 71500,
              window_seconds: 604800,
              reset_at: '2099-08-20T11:00:00Z',
            },
          }}
        />
      );
    });

    const output = JSON.stringify(renderer.toJSON());
    const panel = renderer.root.findByProps({ 'data-testid': 'usage-window-panel' });
    expect(panel.findAllByProps({ 'data-testid': 'usage-window-row' })).toHaveLength(2);
    const visibleText = renderer.root
      .findAll((node) => node.type === 'span' || node.type === 'strong' || node.type === 'small')
      .map((node) => node.children.filter((child) => typeof child === 'string').join(''))
      .join('|');
    expect(visibleText).toContain('97 req');
    expect(output).toContain('1.9M');
    expect(output).toContain('A $7.42');
    expect(visibleText).toContain('221 req');
    expect(output).toContain('22.5M');
    expect(output).toContain('A $22.66');
    const localEstimates = renderer.root.findAllByProps({ 'data-testid': 'usage-local-estimate' });
    expect(localEstimates).toHaveLength(2);
    for (const estimate of localEstimates) {
      expect(estimate.props.title).toBe('cpa_refill.usage_local_estimate_hint');
      expect(estimate.findByType('small').children.join('')).toBe('cpa_refill.usage_local_estimate_label');
    }
    expect(renderer.root.findByProps({ 'data-testid': 'usage-window-info' }).props).toEqual(
      expect.objectContaining({
        'aria-label': 'cpa_refill.usage_windows_local_hint',
        tabIndex: 0,
      })
    );

    // 本地统计与官方配额分开取数；进度条只使用 quotaValue 的真实百分比。
    const windowRows = renderer.root.findAll(
      (node) =>
        typeof node.props['aria-label'] === 'string' &&
        node.props['aria-label'].includes('cpa_refill.usage_statistics_range')
    );
    expect(windowRows).toHaveLength(2);
    for (const row of windowRows) {
      expect(row.props['aria-label']).toContain('cpa_refill.usage_statistics_range');
      expect(row.props['aria-label']).not.toContain('—');
      expect(row.props.title).toBe(row.props['aria-label']);
      expect(row.props.role).toBe('group');
    }
    const tracks = renderer.root.findAllByProps({ role: 'progressbar' });
    expect(tracks).toHaveLength(2);
    expect(tracks[0].props['aria-valuenow']).toBe(16);
    expect(tracks[1].props['aria-valuenow']).toBe(28.5);
    expect(output).toContain('16%');
    expect(output).toContain('84%');
    expect(output).toContain('28.5%');
    expect(output).toContain('71.5%');
    expect(output).toContain('cpa_refill.usage_resets_in');
  });

  it('renders a dash when a usage window contains invalid values', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <UsageWindowCell
          value={{
            five_hour: {
              requests: Number.NaN,
              tokens: 100,
              cost_micro_usd: 200,
              window_start: 'invalid',
              window_end: '2026-08-13T12:00:00Z',
            },
            seven_day: {
              requests: 1,
              tokens: 100,
              cost_micro_usd: 200,
              window_start: '2026-08-06T12:00:00Z',
              window_end: '2026-08-13T12:00:00Z',
            },
          }}
        />
      );
    });

    expect(JSON.stringify(renderer.toJSON())).toContain('—');
    expect(renderer.root.findAll((node) => node.props.role === 'group')).toHaveLength(0);
  });

  it('keeps local statistics but does not draw fake progress when quota is unavailable', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <UsageWindowCell
          value={{
            five_hour: { requests: 3, tokens: 89000, cost_micro_usd: 20000, window_start: '2026-08-13T07:00:00Z', window_end: '2026-08-13T12:00:00Z' },
            seven_day: { requests: 3, tokens: 89000, cost_micro_usd: 20000, window_start: '2026-08-06T12:00:00Z', window_end: '2026-08-13T12:00:00Z' },
          }}
          quotaValue={null}
        />
      );
    });
    const output = JSON.stringify(renderer.toJSON());
    expect(output).toContain('3 req');
    expect(output).toContain('A $0.02');
    expect(output).toContain('cpa_refill.usage_quota_unprobed');
    expect(renderer.root.findAllByProps({ role: 'progressbar' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ 'data-quota-state': 'unprobed' })).toHaveLength(2);
  });

  it('distinguishes a failed quota probe from an account that has never been probed', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <UsageWindowCell
          value={{
            five_hour: { requests: 3, tokens: 89000, cost_micro_usd: 20000, window_start: '2026-08-13T07:00:00Z', window_end: '2026-08-13T12:00:00Z' },
            seven_day: { requests: 3, tokens: 89000, cost_micro_usd: 20000, window_start: '2026-08-06T12:00:00Z', window_end: '2026-08-13T12:00:00Z' },
          }}
          quotaValue={{
            source: 'chatgpt_wham', status: 'stale', error_code: 'quota_fetch_failed', plan_type: '', fetched_at: null,
            five_hour: null,
            seven_day: null,
          }}
        />
      );
    });

    expect(JSON.stringify(renderer.toJSON())).toContain('cpa_refill.usage_quota_fetch_failed');
    expect(renderer.root.findAllByProps({ 'data-quota-state': 'failed' })).toHaveLength(2);
    expect(renderer.root.findAllByProps({ role: 'progressbar' })).toHaveLength(0);
  });

  it('marks stale quota snapshots instead of presenting them as current', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <UsageWindowCell
          value={{
            five_hour: { requests: 1, tokens: 100, cost_micro_usd: 1000, window_start: '2026-08-13T07:00:00Z', window_end: '2026-08-13T12:00:00Z' },
            seven_day: { requests: 1, tokens: 100, cost_micro_usd: 1000, window_start: '2026-08-06T12:00:00Z', window_end: '2026-08-13T12:00:00Z' },
          }}
          quotaValue={{
            source: 'chatgpt_wham', status: 'stale', error_code: '', plan_type: 'pro', fetched_at: '2026-08-13T10:00:00Z',
            five_hour: { used_milli_percent: 16000, remaining_milli_percent: 84000, window_seconds: 18000, reset_at: '2099-08-13T16:00:00Z' },
            seven_day: null,
          }}
        />
      );
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('cpa_refill.usage_quota_stale');
    expect(JSON.stringify(renderer.toJSON())).toContain('cpa_refill.usage_quota_window_missing');
    expect(renderer.root.findAllByProps({ role: 'progressbar' })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ 'data-quota-state': 'stale' })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ 'data-quota-state': 'missing' })).toHaveLength(1);
  });

  it('marks warning and critical official quota thresholds without changing local metrics', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <UsageWindowCell
          value={{
            five_hour: { requests: 8, tokens: 800, cost_micro_usd: 8000, window_start: '2026-08-13T07:00:00Z', window_end: '2026-08-13T12:00:00Z' },
            seven_day: { requests: 10, tokens: 1000, cost_micro_usd: 10000, window_start: '2026-08-06T12:00:00Z', window_end: '2026-08-13T12:00:00Z' },
          }}
          quotaValue={{
            source: 'chatgpt_wham', status: 'fresh', error_code: '', plan_type: 'pro', fetched_at: '2026-08-13T12:00:00Z',
            five_hour: { used_milli_percent: 80000, remaining_milli_percent: 20000, window_seconds: 18000, reset_at: null },
            seven_day: { used_milli_percent: 100000, remaining_milli_percent: 0, window_seconds: 604800, reset_at: null },
          }}
        />
      );
    });

    expect(renderer.root.findAllByProps({ 'data-quota-severity': 'warning' })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ 'data-quota-severity': 'critical' })).toHaveLength(1);
    expect(JSON.stringify(renderer.toJSON())).toContain('8 req');
    expect(JSON.stringify(renderer.toJSON())).toContain('10 req');
  });

  it('fails closed for invalid quota data and clamps over-limit progress width', () => {
    const usage = {
      five_hour: { requests: 1, tokens: 100, cost_micro_usd: 1000, window_start: '2026-08-13T07:00:00Z', window_end: '2026-08-13T12:00:00Z' },
      seven_day: { requests: 1, tokens: 100, cost_micro_usd: 1000, window_start: '2026-08-06T12:00:00Z', window_end: '2026-08-13T12:00:00Z' },
    };
    let invalidRenderer!: ReactTestRenderer;
    act(() => {
      invalidRenderer = create(
        <UsageWindowCell
          value={usage}
          quotaValue={{
            source: 'chatgpt_wham', status: 'fresh', error_code: '', plan_type: 'pro', fetched_at: '2026-08-13T12:00:00Z',
            five_hour: { used_milli_percent: Number.NaN, remaining_milli_percent: 0, window_seconds: 18000, reset_at: null },
            seven_day: null,
          }}
        />
      );
    });
    expect(invalidRenderer.root.findAllByProps({ role: 'progressbar' })).toHaveLength(0);
    expect(JSON.stringify(invalidRenderer.toJSON())).toContain('cpa_refill.usage_quota_unprobed');

    let overLimitRenderer!: ReactTestRenderer;
    act(() => {
      overLimitRenderer = create(
        <UsageWindowCell
          value={usage}
          quotaValue={{
            source: 'chatgpt_wham', status: 'fresh', error_code: '', plan_type: 'pro', fetched_at: '2026-08-13T12:00:00Z',
            five_hour: { used_milli_percent: 123400, remaining_milli_percent: 0, window_seconds: 18000, reset_at: null },
            seven_day: null,
          }}
        />
      );
    });
    const progress = overLimitRenderer.root.findByProps({ role: 'progressbar' });
    expect(progress.props['aria-valuenow']).toBe(123.4);
    expect(progress.findByType('span').props.style.width).toBe('100%');
    expect(overLimitRenderer.root.findAllByProps({ 'data-quota-severity': 'critical' })).toHaveLength(1);
    const text = overLimitRenderer.root
      .findAll((node) => node.type === 'span' || node.type === 'small')
      .map((node) => node.children.filter((child) => typeof child === 'string').join(''))
      .join('|');
    expect(text).toContain('123.4%');
    expect(text).toContain('0%');
  });

  it('shows each merged credential request, token and exact cost without replacing the group total', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <CredentialCostBreakdown
          value={[
            {
              id: 42,
              status: 'active',
              cpa_auth_id: 'auth-42',
              usage_windows: {
                five_hour: { requests: 4, tokens: 400, cost_micro_usd: 51_245_000, window_start: '2026-08-13T07:00:00Z', window_end: '2026-08-13T12:00:00Z' },
                seven_day: { requests: 9, tokens: 900, cost_micro_usd: 52_345_678, window_start: '2026-08-06T12:00:00Z', window_end: '2026-08-13T12:00:00Z' },
              },
            },
            {
              id: 41,
              cpa_auth_id: 'auth-41',
              usage_windows: {
                five_hour: { requests: 6, tokens: 600, cost_micro_usd: 51_245_000, window_start: '2026-08-13T07:00:00Z', window_end: '2026-08-13T12:00:00Z' },
                seven_day: { requests: 11, tokens: 1100, cost_micro_usd: 50_144_322, window_start: '2026-08-06T12:00:00Z', window_end: '2026-08-13T12:00:00Z' },
              },
            },
          ]}
        />
      );
    });

    const output = JSON.stringify(renderer.toJSON());
    const visibleText = renderer.root
      .findAll((node) => node.type === 'strong' || node.type === 'span' || node.type === 'small')
      .map((node) => node.children.filter((child) => typeof child === 'string').join(''))
      .join('|');
    expect(visibleText).toContain('#42');
    expect(visibleText).toContain('#41');
    expect(visibleText).toContain('auth-42');
    expect(visibleText).toContain('auth-41');
    expect(visibleText).toContain('4 req');
    expect(visibleText).toContain('6 req');
    expect(visibleText).toContain('9 req');
    expect(visibleText).toContain('11 req');
    expect(visibleText).toContain('400 Token');
    expect(visibleText).toContain('600 Token');
    expect(visibleText).toContain('900 Token');
    expect(visibleText).toContain('1,100 Token');
    expect(visibleText.match(/\$51\.245000/g)).toHaveLength(2);
    expect(visibleText).toContain('$52.345678');
    expect(visibleText).toContain('$50.144322');
    expect(output).not.toContain('undefined');
  });
});

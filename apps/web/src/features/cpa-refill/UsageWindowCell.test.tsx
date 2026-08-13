import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { UsageWindowCell } from './CPARefillPage';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@/components/quota', () => ({
  QuotaInfoTooltip: ({ ariaLabel }: { ariaLabel: string }) => (
    <span data-testid="usage-window-info" aria-label={ariaLabel} tabIndex={0} />
  ),
}));

describe('UsageWindowCell', () => {
  it('renders request, token and micro USD values for both local windows', () => {
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
        />
      );
    });

    const output = JSON.stringify(renderer.toJSON());
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
    expect(renderer.root.findByProps({ 'data-testid': 'usage-window-info' }).props).toEqual(
      expect.objectContaining({
        'aria-label': 'cpa_refill.usage_windows_local_hint',
        tabIndex: 0,
      })
    );

    // 本地滚动窗口只能表达统计范围，不能伪装成官方配额进度或 reset 倒计时。
    const windowRows = renderer.root.findAll(
      (node) =>
        typeof node.props['aria-label'] === 'string' &&
        node.props['aria-label'].includes('cpa_refill.usage_statistics_range')
    );
    expect(windowRows).toHaveLength(2);
    for (const row of windowRows) {
      expect(row.props['aria-label']).toContain('cpa_refill.usage_statistics_range');
      expect(row.props.title).toContain('cpa_refill.usage_statistics_range');
    }
    const tracks = renderer.root.findAll(
      (node) => node.type === 'i' && node.findAll((child) => child.type === 'span').length === 1
    );
    expect(tracks).toHaveLength(2);
    expect(String(tracks[0].props.className)).toContain('fiveHourTrack');
    expect(String(tracks[1].props.className)).toContain('sevenDayTrack');
    expect(visibleText).toContain('cpa_refill.usage_rolling_window');
    expect(renderer.root.findAllByProps({ role: 'progressbar' })).toHaveLength(0);
    expect(output).not.toContain('%');
    expect(output).not.toContain('usage_remaining_time');
  });
});

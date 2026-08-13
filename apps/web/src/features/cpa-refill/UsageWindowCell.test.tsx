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
  it('renders an explicit remaining-time progress bar instead of a decorative line', () => {
    const now = Date.now();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <UsageWindowCell
          value={{
            five_hour: {
              requests: 27,
              tokens: 1_057_000,
              cost_micro_usd: 2_620_000,
              window_start: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
              window_end: new Date(now + 60 * 60 * 1000).toISOString(),
            },
            seven_day: {
              requests: 49,
              tokens: 1_466_000,
              cost_micro_usd: 2_560_000,
              window_start: new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(),
              window_end: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
            },
          }}
        />
      );
    });

    const progressBars = renderer.root.findAllByProps({ role: 'progressbar' });
    expect(progressBars).toHaveLength(2);
    expect(progressBars[0].props).toEqual(expect.objectContaining({
      'aria-valuenow': 20,
      'aria-valuemin': 0,
      'aria-valuemax': 100,
    }));
    expect(progressBars[1].props).toEqual(expect.objectContaining({
      'aria-valuenow': 14,
      'aria-valuemin': 0,
      'aria-valuemax': 100,
    }));
    const output = JSON.stringify(renderer.toJSON());
    expect(output).toContain('cpa_refill.usage_remaining');
    expect(output).toContain('cpa_refill.usage_remaining_time');
    expect(output).toContain('cpa_refill.usage_statistics_range');
  });

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
  });
});

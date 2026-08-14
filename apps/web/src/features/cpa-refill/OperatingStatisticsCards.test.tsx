import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { OperatingStatisticsCards } from './CPARefillPage';

const translations: Record<string, string> = {
  'cpa_refill.operating_statistics': '经营统计',
  'cpa_refill.operating_statistics_hint': '采购、余额与 Codex 用量汇总。',
  'cpa_refill.today_purchase_cost': '今日采购花费',
  'cpa_refill.supplier_available_balance': '供应商可用余额',
  'cpa_refill.total_tokens_consumed': '总消耗 Token',
  'cpa_refill.total_account_usage_cost': '账号用量总金额',
  'cpa_refill.statistics_unavailable': '数据暂不可用',
  'cpa_refill.statistics_today_purchase_hint': '按最终实扣金额统计',
};

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        if (key === 'cpa_refill.statistics_balance_hint') {
          return `总余额 ${options?.balance} · 冻结 ${options?.held}`;
        }
        if (key === 'cpa_refill.statistics_today_tokens_hint') {
          return `今日 ${options?.tokens}`;
        }
        if (key === 'cpa_refill.statistics_today_usage_hint') {
          return `今日 ${options?.amount}`;
        }
        return translations[key] || key;
      },
    }),
  };
});

describe('OperatingStatisticsCards', () => {
  it('renders the four operating metrics with explicit currency and Token units', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <OperatingStatisticsCards
          statistics={{
            today_purchase_fen: 1234,
            supplier_balance_fen: 49_642,
            supplier_held_fen: 1_400,
            supplier_available_fen: 48_242,
            total_tokens: 6_392_136_189,
            total_usage_micro_usd: 7_682_135_871,
            today_tokens: 4_000_237_246,
            today_usage_micro_usd: 4_683_088_161,
          }}
        />
      );
    });

    const output = JSON.stringify(renderer.toJSON());
    for (const label of ['经营统计', '今日采购花费', '供应商可用余额', '总消耗 Token', '账号用量总金额']) {
      expect(output).toContain(label);
    }
    expect(output).toContain('¥12.34');
    expect(output).toContain('¥482.42');
    expect(output).toContain('¥496.42');
    expect(output).toContain('¥14.00');
    expect(output).toContain(new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(6_392_136_189));
    expect(output).toContain('$7,682.14');
    expect(output).toContain('$4,683.09');
  });

  it('fails closed instead of formatting missing or invalid statistics as zero', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <OperatingStatisticsCards
          statistics={{
            today_purchase_fen: 12.5,
            supplier_balance_fen: -1,
            supplier_held_fen: -1,
            supplier_available_fen: -1,
            total_tokens: Number.MAX_SAFE_INTEGER + 1,
            total_usage_micro_usd: -1,
            today_tokens: -1,
            today_usage_micro_usd: -1,
          }}
        />
      );
    });

    const output = JSON.stringify(renderer.toJSON());
    expect(output).toContain('数据暂不可用');
    expect(output).not.toContain('¥0.13');
    expect(output).not.toContain('¥0.00');
    expect(output).not.toContain('$0.00');
  });
});

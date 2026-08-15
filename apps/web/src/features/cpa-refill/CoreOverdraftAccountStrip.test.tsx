import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { CoreOverdraftAccountStrip } from './CPARefillPage';

const translations: Record<string, string> = {
  'cpa_refill.core_overdraft_account_no_activity': '暂无核心记录',
  'cpa_refill.core_overdraft_account_injected': '注入',
  'cpa_refill.core_overdraft_account_observed': '观察',
  'cpa_refill.core_overdraft_account_success': '成功',
  'cpa_refill.core_overdraft_account_usage_limit': '429',
  'cpa_refill.core_overdraft_account_hard_stop': '硬停止',
  'cpa_refill.core_overdraft_account_canceled': '取消',
  'cpa_refill.core_overdraft_account_other_failure': '其他失败',
  'cpa_refill.core_overdraft_account_now': '刚刚',
};

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        if (key === 'cpa_refill.core_overdraft_account_label') return `CORE ${options?.hours}h`;
        if (key === 'cpa_refill.core_overdraft_account_count') return `${options?.label} ${options?.count}`;
        if (key === 'cpa_refill.core_overdraft_account_minutes_ago') return `${options?.minutes} 分钟前`;
        if (key === 'cpa_refill.core_overdraft_account_hint') return `最近 ${options?.hours} 小时内存统计`;
        return translations[key] || key;
      },
    }),
  };
});

const emptyOutcomes = {
  success: 0,
  'usage-limit': 0,
  'hard-stop': 0,
  canceled: 0,
  'other-failure': 0,
};

const runtimeStatus = {
  'started-at': '2026-08-15T10:00:00Z',
  evaluated: 20,
  skipped: {},
  observed: 2,
  injected: 7,
  outcomes: emptyOutcomes,
  'account-retention-seconds': 21_600,
  accounts: [
    {
      'auth-id': 'auth-a',
      'first-seen-at': '2026-08-15T10:00:00Z',
      'last-seen-at': '2026-08-15T11:48:00Z',
      observed: { requests: 2, outcomes: { ...emptyOutcomes, success: 1 } },
      injected: { requests: 3, outcomes: { ...emptyOutcomes, success: 2, 'usage-limit': 1 } },
    },
    {
      'auth-id': 'auth-b',
      'first-seen-at': '2026-08-15T11:00:00Z',
      'last-seen-at': '2026-08-15T11:50:00Z',
      observed: { requests: 0, outcomes: emptyOutcomes },
      injected: { requests: 4, outcomes: { ...emptyOutcomes, success: 3, 'hard-stop': 1 } },
    },
  ],
};

describe('CoreOverdraftAccountStrip', () => {
  it('aggregates merged credential activity while keeping observe and inject semantics separate', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <CoreOverdraftAccountStrip
          account={{
            id: 42,
            email: 'merged@example.com',
            status: 'active',
            cpa_auth_id: 'auth-a',
            credentials: [
              { id: 1, cpa_auth_id: 'auth-a' },
              { id: 2, cpa_auth_id: 'auth-b' },
            ],
          }}
          status={runtimeStatus}
          nowMS={new Date('2026-08-15T12:00:00Z').getTime()}
        />
      );
    });

    const output = JSON.stringify(renderer.toJSON());
    expect(output).toContain('CORE 6h');
    expect(output).toContain('注入 7');
    expect(output).toContain('成功 5');
    expect(output).toContain('429 1');
    expect(output).toContain('硬停止 1');
    expect(output).toContain('观察 2');
    expect(output).toContain('成功 1');
    expect(output).toContain('10 分钟前');
    expect(output).not.toContain('观察 7');

    const injectedRow = renderer.root.findByProps({ 'data-action': 'injected' });
    const observedRow = renderer.root.findByProps({ 'data-action': 'observed' });
    const injectedOutcomes = injectedRow.findAllByType('span').map((node) => node.children.join(''));
    const observedOutcomes = observedRow.findAllByType('span').map((node) => node.children.join(''));
    expect(injectedOutcomes).toContain('成功 5');
    expect(injectedOutcomes).not.toContain('成功 1');
    expect(observedOutcomes).toContain('成功 1');
    expect(observedOutcomes).not.toContain('成功 5');
  });

  it('shows a quiet no-activity state only when the new account contract is available', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <CoreOverdraftAccountStrip
          account={{ id: 7, email: 'idle@example.com', status: 'active', cpa_auth_id: 'auth-idle' }}
          status={{ ...runtimeStatus, accounts: [] }}
          nowMS={new Date('2026-08-15T12:00:00Z').getTime()}
        />
      );
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('暂无核心记录');

    act(() => {
      renderer.update(
        <CoreOverdraftAccountStrip
          account={{ id: 7, email: 'idle@example.com', status: 'active', cpa_auth_id: 'auth-idle' }}
          status={{ ...runtimeStatus, accounts: undefined, 'account-retention-seconds': undefined }}
          nowMS={new Date('2026-08-15T12:00:00Z').getTime()}
        />
      );
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it('fails closed for malformed account counters or rows without a CPA auth ID', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <CoreOverdraftAccountStrip
          account={{ id: 9, email: 'bad@example.com', status: 'active', cpa_auth_id: 'auth-a' }}
          status={{ ...runtimeStatus, accounts: [{ ...runtimeStatus.accounts[0], injected: { requests: -1, outcomes: emptyOutcomes } }] }}
          nowMS={new Date('2026-08-15T12:00:00Z').getTime()}
        />
      );
    });
    expect(renderer.toJSON()).toBeNull();

    act(() => {
      renderer.update(
        <CoreOverdraftAccountStrip
          account={{ id: 9, email: 'missing@example.com', status: 'active' }}
          status={runtimeStatus}
          nowMS={new Date('2026-08-15T12:00:00Z').getTime()}
        />
      );
    });
    expect(renderer.toJSON()).toBeNull();
  });
});

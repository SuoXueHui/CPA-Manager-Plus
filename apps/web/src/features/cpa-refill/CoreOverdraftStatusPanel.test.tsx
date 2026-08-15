import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { CoreOverdraftStatusPanel } from './CPARefillPage';

const translations: Record<string, string> = {
  'cpa_refill.core_overdraft_title': 'CPA 核心额度透支实验',
  'cpa_refill.core_overdraft_global_hint': '全局进程指标，不是逐账号确认透支。',
  'cpa_refill.core_overdraft_status_inject': '注入运行中',
  'cpa_refill.core_overdraft_status_waiting': '已开启，等待注入样本',
  'cpa_refill.core_overdraft_status_observe': '观察模式',
  'cpa_refill.core_overdraft_status_disabled': '已关闭',
  'cpa_refill.core_overdraft_unavailable': '核心状态不可用',
  'cpa_refill.core_overdraft_evaluated': '评估',
  'cpa_refill.core_overdraft_injected': '实际注入',
  'cpa_refill.core_overdraft_observed': '观察样本',
  'cpa_refill.core_overdraft_success_response': '注入后成功响应',
  'cpa_refill.core_overdraft_observe_success_response': '观察样本成功响应',
  'cpa_refill.core_overdraft_usage_limit': '429',
  'cpa_refill.core_overdraft_hard_stop': '硬停止',
  'cpa_refill.core_overdraft_skipped': '查看跳过原因',
  'cpa_refill.core_overdraft_started_at': '统计起点',
  'cpa_refill.core_overdraft_oauth_only': '仅 OAuth',
  'cpa_refill.core_overdraft_all_auth': '全部认证类型',
};

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        if (key === 'cpa_refill.core_overdraft_canary') return `稳定会话灰度 ${options?.percent}%`;
        if (key === 'cpa_refill.core_overdraft_strength')
          return `S${options?.pairs} · ${options?.pairs} pair`;
        if (key === 'cpa_refill.core_overdraft_metric')
          return `${options?.label} ${options?.value}`;
        return translations[key] || key;
      },
    }),
  };
});

describe('CoreOverdraftStatusPanel', () => {
  it('renders inject configuration and process-local outcome counters without claiming a bypass', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <CoreOverdraftStatusPanel
          value={{
            config: {
              enabled: true,
              mode: 'inject',
              'canary-percent': 10,
              'pair-count': 1,
              'tail-policy': 'user-and-tool-output',
              'oauth-only': true,
              'max-body-bytes': 8_388_608,
            },
            status: {
              'started-at': '2026-08-15T10:00:00Z',
              evaluated: 169,
              observed: 0,
              injected: 9,
              skipped: { 'non-canary': 80, 'unsupported-tail': 80 },
              outcomes: {
                success: 7,
                'usage-limit': 1,
                'hard-stop': 0,
                canceled: 0,
                'other-failure': 1,
              },
            },
          }}
        />
      );
    });

    const output = JSON.stringify(renderer.toJSON());
    expect(output).toContain('CPA 核心额度透支实验');
    expect(output).toContain('注入运行中');
    expect(output).toContain('稳定会话灰度 10%');
    expect(output).toContain('S1 · 1 pair');
    expect(output).toContain('仅 OAuth');
    expect(output).toContain('评估 169');
    expect(output).toContain('实际注入 9');
    expect(output).toContain('注入后成功响应 7');
    expect(output).toContain('429 1');
    expect(output).toContain('全局进程指标，不是逐账号确认透支。');
    expect(output).not.toContain('透支成功');
  });

  it('fails closed when the core endpoint is unavailable or malformed', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<CoreOverdraftStatusPanel value={{ config: { enabled: true } }} />);
    });

    const output = JSON.stringify(renderer.toJSON());
    expect(output).toContain('核心状态不可用');
    expect(output).not.toContain('注入运行中');
    expect(output).not.toContain('评估 0');
  });

  it('does not label observe-mode outcomes as injected responses', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <CoreOverdraftStatusPanel
          value={{
            config: {
              enabled: true,
              mode: 'observe',
              'canary-percent': 10,
              'pair-count': 1,
              'tail-policy': 'user-and-tool-output',
              'oauth-only': true,
              'max-body-bytes': 8_388_608,
            },
            status: {
              'started-at': '2026-08-15T10:00:00Z',
              evaluated: 12,
              observed: 5,
              injected: 0,
              skipped: {},
              outcomes: {
                success: 4,
                'usage-limit': 1,
                'hard-stop': 0,
                canceled: 0,
                'other-failure': 0,
              },
            },
          }}
        />
      );
    });

    const output = JSON.stringify(renderer.toJSON());
    expect(output).toContain('观察样本成功响应 4');
    expect(output).toContain('观察样本 5');
    expect(output).not.toContain('实际注入 0');
    expect(output).not.toContain('注入后成功响应');
  });
});

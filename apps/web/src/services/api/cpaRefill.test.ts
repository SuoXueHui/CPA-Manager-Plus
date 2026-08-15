import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('./client', () => ({
  apiClient: mocks,
}));

import {
  cpaRefillApi,
  isCPARefillPolicyIdempotencyConflict,
  isCPARefillPolicyPendingActivation,
  isCPARefillPolicyStateConflict,
  type CPARefillOverview,
  type CPARefillPolicy,
} from './cpaRefill';

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.put.mockReset();
});

describe('cpaRefillApi', () => {
  it('recognizes policy state conflicts without exposing raw backend codes to the page', () => {
    expect(isCPARefillPolicyStateConflict(new Error('state_conflict'))).toBe(true);
    expect(isCPARefillPolicyStateConflict(new Error('backend_unavailable'))).toBe(false);
    expect(isCPARefillPolicyStateConflict('state_conflict')).toBe(false);
  });

  it('recognizes policy idempotency conflicts separately from version conflicts', () => {
    expect(isCPARefillPolicyIdempotencyConflict(new Error('idempotency_conflict'))).toBe(true);
    expect(isCPARefillPolicyIdempotencyConflict(new Error('state_conflict'))).toBe(false);
  });

  it('marks a saved active purchase policy as pending until activation gates are ready', () => {
    const policy = {
      desired_mode: 'active',
      purchase_enabled: true,
    } as CPARefillPolicy;
    expect(isCPARefillPolicyPendingActivation(policy, {
      activation: { ready: false, reason_code: 'unknown_pricing' },
    } as CPARefillOverview)).toBe(true);
    expect(isCPARefillPolicyPendingActivation(policy, {
      activation: { ready: true, reason_code: '' },
    } as CPARefillOverview)).toBe(false);
    expect(isCPARefillPolicyPendingActivation({ ...policy, purchase_enabled: false }, {
      activation: { ready: false, reason_code: 'usage_warmup' },
    } as CPARefillOverview)).toBe(false);
  });

  it('keeps the minimum healthy account count in the policy contract', () => {
    const policy: CPARefillPolicy = {
      desired_mode: 'active',
      purchase_enabled: true,
      recovery_enabled: true,
      window_minutes: 60,
      target_coverage_seconds: 1200,
      safety_factor_bps: 13000,
      unknown_capacity_ratio_bps: 5000,
      max_cycle_quantity: 20,
      minimum_healthy_accounts: 5,
      order_hard_cap: 20,
      min_order_gap_seconds: 30,
      inventory_probe_seconds: 3,
      policy_version: 20,
    };

    expect(policy.minimum_healthy_accounts).toBe(5);
  });

  it('keeps operating statistics in the overview contract with integer money units', () => {
    const overview: CPARefillOverview = {
      mode: 'active',
      status: 'healthy',
      available_accounts: 4,
      statistics: {
        today_purchase_fen: 1234,
        supplier_balance_fen: 49642,
        supplier_held_fen: 1400,
        supplier_available_fen: 48242,
        total_tokens: 2499225033,
        total_usage_micro_usd: 3126104500,
        today_tokens: 107326090,
        today_usage_micro_usd: 127056800,
      },
    };

    expect(overview.statistics?.today_purchase_fen).toBe(1234);
    expect(overview.statistics?.total_usage_micro_usd).toBe(3126104500);
  });

  it('keeps the controller whitelist path relative to the configured management API base', async () => {
    mocks.get.mockResolvedValue({ mode: 'degraded', status: 'degraded', available_accounts: 0 });

    await cpaRefillApi.overview();

    expect(mocks.get).toHaveBeenCalledWith('/cpa-refill/overview', { timeout: 5_000 });
  });

  it('loads filtered account pages and account details through the Manager whitelist', async () => {
    mocks.get.mockResolvedValueOnce({ items: [], page: { page_size: 50, has_more: false } });
    mocks.get.mockResolvedValueOnce({ id: 42 });
    mocks.get.mockResolvedValueOnce({ items: [], page: { page_size: 50, has_more: false } });

    await cpaRefillApi.list('accounts', {
      q: 'masked',
      status: 'active',
      source: 'supplier',
      import_status: 'imported',
      grouped: true,
      limit: 50,
      cursor: 'next-page',
    });
    await cpaRefillApi.accountDetail(42);
    await cpaRefillApi.accountEvents(42, { level: 'warning', limit: 50 });

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/cpa-refill/accounts', {
      params: {
        q: 'masked',
        status: 'active',
        source: 'supplier',
        import_status: 'imported',
        grouped: true,
        limit: 50,
        cursor: 'next-page',
      },
      timeout: 5_000,
    });
    expect(mocks.get).toHaveBeenNthCalledWith(
      2,
      '/cpa-refill/accounts/42',
      { timeout: 5_000 }
    );
    expect(mocks.get).toHaveBeenNthCalledWith(
      3,
      '/cpa-refill/accounts/42/events',
      { params: { level: 'warning', limit: 50 }, timeout: 5_000 }
    );
  });

  it('uses a bounded write timeout and idempotency key for manual refill', async () => {
    mocks.post.mockResolvedValue({ accepted: true, action: 'manual-refill' });

    await cpaRefillApi.action(
      'manual-refill',
      { quantity: 20, reason: 'operator_canary' },
      'refill-20260811-1'
    );

    expect(mocks.post).toHaveBeenCalledWith(
      '/cpa-refill/actions/manual-refill',
      { quantity: 20, reason: 'operator_canary' },
      { headers: { 'Idempotency-Key': 'refill-20260811-1' }, timeout: 10_000 }
    );
  });
});

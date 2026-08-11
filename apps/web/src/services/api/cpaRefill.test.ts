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

import { cpaRefillApi } from './cpaRefill';

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.put.mockReset();
});

describe('cpaRefillApi', () => {
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

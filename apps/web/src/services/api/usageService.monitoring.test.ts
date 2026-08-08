import { beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosMocks } = vi.hoisted(() => ({
  axiosMocks: {
    create: vi.fn(() => ({
      defaults: {},
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
    get: vi.fn(),
    post: vi.fn(),
    isAxiosError: vi.fn(() => false),
  },
}));

vi.mock('axios', () => ({
  default: axiosMocks,
}));

import { dashboardApi, monitoringAnalyticsApi, usageServiceApi } from './usageService';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
};

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  axiosMocks.get.mockReset();
  axiosMocks.post.mockReset();
  axiosMocks.isAxiosError.mockReset().mockReturnValue(false);
});

describe('monitoringAnalyticsApi request serialization', () => {
  it('serializes header snapshots behind an in-flight analytics request', async () => {
    const analyticsDeferred = createDeferred<{ data: { ok: boolean } }>();
    const headerDeferred = createDeferred<{ data: { ok: boolean } }>();

    axiosMocks.post.mockReturnValueOnce(analyticsDeferred.promise);
    axiosMocks.get.mockReturnValueOnce(headerDeferred.promise);

    const analyticsPromise = monitoringAnalyticsApi.getAnalytics(
      'http://manager.local/',
      'admin-key',
      { from_ms: 1, to_ms: 2, include: { summary: true } }
    );
    const headerPromise = monitoringAnalyticsApi.getHeaderSnapshots(
      'http://manager.local/',
      'admin-key',
      { days: 30, limit: 1000 }
    );

    await flushPromises();
    expect(axiosMocks.post).toHaveBeenCalledTimes(1);
    expect(axiosMocks.get).toHaveBeenCalledTimes(0);

    analyticsDeferred.resolve({ data: { ok: true } });
    await expect(analyticsPromise).resolves.toEqual({ ok: true });
    await flushPromises();

    expect(axiosMocks.get).toHaveBeenCalledTimes(1);
    headerDeferred.resolve({ data: { ok: true } });

    await expect(headerPromise).resolves.toEqual({ ok: true });
  });

  it('uses the extended report timeout for analytics requests only', async () => {
    axiosMocks.post.mockResolvedValueOnce({ data: { generated_at_ms: 1 } });
    axiosMocks.get.mockResolvedValueOnce({ data: { generated_at_ms: 1, items: [] } });

    await monitoringAnalyticsApi.getAnalytics('http://manager.local/', 'admin-key', {
      from_ms: 1,
      to_ms: 2,
      include: { account_stats: true },
    });
    await monitoringAnalyticsApi.getHeaderSnapshots('http://manager.local/', 'admin-key', {
      days: 30,
      limit: 1000,
    });

    expect(axiosMocks.post.mock.calls[0]?.[2]?.timeout).toBe(90_000);
    expect(axiosMocks.get.mock.calls[0]?.[1]?.timeout).toBe(30_000);
  });
});

describe('dashboardApi report timeout', () => {
  it('uses the extended report timeout for dashboard summary', async () => {
    axiosMocks.get.mockResolvedValueOnce({ data: { generated_at_ms: 1 } });

    await dashboardApi.getSummary('http://manager.local/', 'admin-key', {
      todayStartMs: 1,
      nowMs: 2,
      topModels: 5,
      recentFailures: 5,
    });

    expect(axiosMocks.get.mock.calls[0]?.[1]?.timeout).toBe(90_000);
  });
});

describe('usageServiceApi auth file activity', () => {
  it('posts non-sensitive auth file metadata to the manager service', async () => {
    axiosMocks.post.mockResolvedValueOnce({ data: { items: [] } });

    await usageServiceApi.syncAuthFileActivity('http://manager.local/', 'admin-key', {
      files: [{ authFileName: 'a.json', authIndex: 'auth-a', createdAtMs: 1_000 }],
      observedAtMs: 2_000,
    });

    expect(axiosMocks.post).toHaveBeenCalledWith(
      'http://manager.local/usage-service/auth-file-activity',
      {
        files: [{ authFileName: 'a.json', authIndex: 'auth-a', createdAtMs: 1_000 }],
        observedAtMs: 2_000,
      },
      expect.objectContaining({
        headers: { Authorization: 'Bearer admin-key' },
      })
    );
  });
});

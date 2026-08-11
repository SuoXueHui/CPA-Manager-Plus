import { apiClient } from './client';

const READ_TIMEOUT_MS = 5_000;
const WRITE_TIMEOUT_MS = 10_000;
// apiClient 的 baseURL 已包含 /v0/management，这里只保留 Manager 白名单的相对路径。
const BASE_PATH = '/cpa-refill';

export type CPARefillListResource =
  | 'accounts'
  | 'decisions'
  | 'orders'
  | 'recoveries'
  | 'imports'
  | 'events';

export type CPARefillAction =
  | 'pause'
  | 'resume'
  | 'recalculate'
  | 'reset-circuit'
  | 'manual-refill';

export interface CPARefillOverview {
  mode: string;
  status: string;
  available_accounts: number;
  capacity?: Record<string, unknown>;
  decision?: Record<string, unknown>;
  supplier?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  dependencies?: Array<Record<string, unknown>>;
  generated_at?: string;
}

export interface CPARefillListQuery {
  q?: string;
  status?: string;
  source?: string;
  provider?: string;
  import_status?: string;
  level?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface CPARefillListResponse {
  items: Array<Record<string, unknown>>;
  page: {
    page_size: number;
    has_more: boolean;
    next_cursor?: string;
  };
}

export interface CPARefillPolicy {
  desired_mode: string;
  purchase_enabled: boolean;
  recovery_enabled: boolean;
  window_minutes: number;
  target_coverage_seconds: number;
  safety_factor_bps: number;
  unknown_capacity_ratio_bps: number;
  max_cycle_quantity: number;
  order_hard_cap: number;
  min_order_gap_seconds: number;
  inventory_probe_seconds: number;
  policy_version: number;
}

const compactQuery = (query: CPARefillListQuery) =>
  Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );

export const cpaRefillApi = {
  overview: () =>
    apiClient.get<CPARefillOverview>(`${BASE_PATH}/overview`, { timeout: READ_TIMEOUT_MS }),

  list: (resource: CPARefillListResource, query: CPARefillListQuery = {}) =>
    apiClient.get<CPARefillListResponse>(`${BASE_PATH}/${resource}`, {
      params: compactQuery(query),
      timeout: READ_TIMEOUT_MS,
    }),

  accountDetail: (accountID: number) =>
    apiClient.get<Record<string, unknown>>(`${BASE_PATH}/accounts/${accountID}`, {
      timeout: READ_TIMEOUT_MS,
    }),

  accountEvents: (accountID: number, query: CPARefillListQuery = {}) =>
    apiClient.get<CPARefillListResponse>(`${BASE_PATH}/accounts/${accountID}/events`, {
      params: compactQuery(query),
      timeout: READ_TIMEOUT_MS,
    }),

  orderDetail: (orderID: number) =>
    apiClient.get<Record<string, unknown>>(`${BASE_PATH}/orders/${orderID}`, {
      timeout: READ_TIMEOUT_MS,
    }),

  policy: async () => {
    const response = await apiClient.get<{ policy: CPARefillPolicy }>(`${BASE_PATH}/policy`, {
      timeout: READ_TIMEOUT_MS,
    });
    return response.policy;
  },

  updatePolicy: async (policy: CPARefillPolicy, idempotencyKey: string) => {
    const response = await apiClient.put<{ policy: CPARefillPolicy }>(
      `${BASE_PATH}/policy`,
      policy,
      { headers: { 'Idempotency-Key': idempotencyKey }, timeout: WRITE_TIMEOUT_MS }
    );
    return response.policy;
  },

  action: (
    action: CPARefillAction,
    payload: { quantity?: number; reason: string },
    idempotencyKey: string
  ) =>
    apiClient.post<{ accepted: boolean; action: string }>(
      `${BASE_PATH}/actions/${action}`,
      payload,
      { headers: { 'Idempotency-Key': idempotencyKey }, timeout: WRITE_TIMEOUT_MS }
    ),
};

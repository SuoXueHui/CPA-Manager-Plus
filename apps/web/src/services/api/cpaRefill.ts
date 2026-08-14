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

// 经营统计保持 Controller 的整数单位：采购/余额为人民币分，用量金额为 micro USD。
export interface CPARefillStatistics {
  today_purchase_fen: number;
  supplier_balance_fen: number;
  supplier_held_fen: number;
  supplier_available_fen: number;
  total_tokens: number;
  total_usage_micro_usd: number;
  today_tokens: number;
  today_usage_micro_usd: number;
}

export interface CPARefillOverview {
  mode: string;
  status: string;
  available_accounts: number;
  capacity?: Record<string, unknown>;
  decision?: Record<string, unknown>;
  supplier?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  statistics?: CPARefillStatistics;
  dependencies?: Array<Record<string, unknown>>;
  generated_at?: string;
}

// Controller 基于账号小时桶聚合的本地窗口；金额单位保持 micro USD，避免前后端浮点误差。
export interface CPARefillUsageWindow {
  requests: number;
  tokens: number;
  cost_micro_usd: number;
  window_start: string;
  window_end: string;
}

export interface CPARefillUsageWindows {
  five_hour: CPARefillUsageWindow;
  seven_day: CPARefillUsageWindow;
}

// ChatGPT 官方 quota 使用千分之一百分点，避免 JSON 浮点在跨服务传递时产生歧义。
export interface CPARefillQuotaWindow {
  used_milli_percent: number;
  remaining_milli_percent: number;
  window_seconds: number;
  reset_at: string | null;
}

// 官方 quota 与 Controller 本地 usage 分开建模，禁止前端用 Token 或金额推算配额。
export interface CPARefillQuotaWindows {
  source: string;
  status: string;
  error_code: string;
  plan_type: string;
  fetched_at: string;
  five_hour: CPARefillQuotaWindow | null;
  seven_day: CPARefillQuotaWindow | null;
}

// 账号列表使用显式 DTO，确保本地用量和官方配额结构不会退化成任意对象。
export interface CPARefillAccountListItem extends Record<string, unknown> {
  id: number;
  email: string;
  status: string;
  // grouped=true 时由 Controller 返回逻辑账号聚合信息；凭证仍保留为摘要，便于追溯成本来源。
  merged?: boolean;
  credential_count?: number;
  credential_ids?: number[];
  credentials?: Array<Record<string, unknown>>;
  usage_windows?: CPARefillUsageWindows;
  quota_windows?: CPARefillQuotaWindows | null;
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
  // 账号列表默认开启，必须在 Controller 分组后再分页，避免前端分页内合并造成漏算。
  grouped?: boolean;
}

export interface CPARefillListResponse<TItem extends Record<string, unknown> = Record<string, unknown>> {
  items: TItem[];
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

  list: <TItem extends Record<string, unknown> = Record<string, unknown>>(
    resource: CPARefillListResource,
    query: CPARefillListQuery = {}
  ) =>
    apiClient.get<CPARefillListResponse<TItem>>(`${BASE_PATH}/${resource}`, {
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

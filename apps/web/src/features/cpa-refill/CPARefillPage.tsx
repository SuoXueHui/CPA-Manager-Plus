import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Select } from '@/components/ui/Select';
import type { SelectOption } from '@/components/ui/Select';
import { QuotaInfoTooltip } from '@/components/quota';
import {
  cpaRefillApi,
  isCPARefillPolicyIdempotencyConflict,
  isCPARefillPolicyPendingActivation,
  isCPARefillPolicyStateConflict,
  type CPARefillAction,
  type CPARefillAccountListItem,
  type CPARefillCredentialSummary,
  type CPARefillListQuery,
  type CPARefillListResource,
  type CPARefillOverview,
  type CPARefillPolicy,
  type CPARefillQuotaWindow,
  type CPARefillQuotaWindows,
  type CPARefillStatistics,
  type CPARefillUsageWindow,
  type CPARefillUsageWindows,
  type CPACoreOverdraftConfig,
  type CPACoreOverdraftRuntimeStatus,
  type CPACoreOverdraftStatusResponse,
} from '@/services/api/cpaRefill';
import { useNotificationStore } from '@/stores';
import { CPA_REFILL_OVERVIEW_POLL_MS, shouldPollCPARefillOverview } from './polling';
import styles from './CPARefillPage.module.scss';

type Tab = 'overview' | CPARefillListResource | 'policy';

type ListFilters = {
  q: string;
  status: string;
  source: string;
  import_status: string;
  provider: string;
  level: string;
  from: string;
  to: string;
};

const listResources: CPARefillListResource[] = [
  'accounts',
  'decisions',
  'orders',
  'recoveries',
  'imports',
  'events',
];

const emptyFilters = (): ListFilters => ({
  q: '', status: '', source: '', import_status: '', provider: '', level: '', from: '', to: '',
});

const initialFiltersByResource = () =>
  Object.fromEntries(listResources.map((resource) => [resource, emptyFilters()])) as Record<
    CPARefillListResource,
    ListFilters
  >;

const statusOptions: Partial<Record<CPARefillListResource, string[]>> = {
  accounts: ['delivered', 'import_pending', 'importing', 'active', 'cooldown', 'unavailable', 'disabled', 'recovery_pending', 'recovery_importing', 'import_failed', 'retired'],
  decisions: ['observed', 'no_action', 'blocked', 'planned', 'executing', 'succeeded', 'partial', 'failed', 'cancelled'],
  orders: ['intent_created', 'creating', 'waiting_inventory', 'ready', 'taking', 'taken', 'importing', 'import_retry', 'create_uncertain', 'take_uncertain', 'manual_review', 'succeeded', 'partial', 'cancelled', 'failed', 'paused'],
  recoveries: ['observed', 'claimable', 'claiming', 'claimed', 'importing', 'import_retry', 'succeeded', 'refunded', 'claim_uncertain', 'import_failed', 'manual_review'],
  imports: ['running', 'result_uncertain', 'retry_wait', 'succeeded', 'duplicate', 'failed'],
};

const importStatusOptions = [
  'not_required', 'pending', 'running', 'result_uncertain', 'retry_wait', 'succeeded', 'duplicate', 'failed',
];

const eventLevelOptions = ['info', 'warning', 'error'];

const isListResource = (tab: Tab): tab is CPARefillListResource =>
  listResources.includes(tab as CPARefillListResource);

const toRFC3339 = (value: string) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const tabs: Tab[] = [
  'overview',
  'accounts',
  'decisions',
  'orders',
  'recoveries',
  'imports',
  'events',
  'policy',
];

const columns: Record<CPARefillListResource, string[]> = {
  accounts: ['email', 'status', 'usage_windows', 'imported_at', 'expires_at', 'last_request_at'],
  decisions: ['id', 'status', 'current_capacity', 'target_capacity', 'deficit', 'planned_quantity', 'reason', 'created_at'],
  orders: ['id', 'provider', 'status', 'requested_quantity', 'delivered_quantity', 'amount', 'error_code', 'created_at'],
  recoveries: ['id', 'recovery_id', 'account_id', 'provider', 'status', 'attempt_count', 'updated_at'],
  imports: ['id', 'account_id', 'cpa_auth_id', 'status', 'error_code', 'created_at'],
  events: ['id', 'created_at', 'level', 'entity', 'event_type'],
};

const numberValue = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0;

const stringValue = (value: unknown) =>
  value === undefined || value === null || value === '' ? '—' : String(value);

// 窗口单元格使用紧凑数字，优先保证 50 行账号列表的可扫描性。
const formatCompactCount = (value: unknown) =>
  new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(numberValue(value));

// 详情中的累计 Token 仍使用完整千分位，便于管理员精确核对。
const formatTokenCount = (value: unknown) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(numberValue(value));

// Controller 金额以 micro USD 返回；管理页转换为美元但保留六位精度，避免小额被显示成 0。
const formatMicroUSD = (value: unknown) => `$${(numberValue(value) / 1_000_000).toFixed(6)}`;

// 窗口徽标保留两位美元精度，与 Sub2API 的高密度账号成本展示一致。
const formatCompactMicroUSD = (value: unknown) => `A $${(numberValue(value) / 1_000_000).toFixed(2)}`;

// 概览统计只接受非负有限整数；缺失或坏数据必须显示未知，不能静默变成 0。
const operatingNumber = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

const formatOperatingFen = (value: unknown) => {
  const amount = operatingNumber(value);
  return amount === null ? '—' : `¥${(amount / 100).toFixed(2)}`;
};

const formatOperatingTokens = (value: unknown) => {
  const tokens = operatingNumber(value);
  return tokens === null
    ? '—'
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(tokens);
};

const formatOperatingMicroUSD = (value: unknown) => {
  const amount = operatingNumber(value);
  return amount === null
    ? '—'
    : `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount / 1_000_000)}`;
};

// 列表统计必须完整且非负；坏数据宁可显示缺失，也不能伪装成 0 影响运营判断。
const isUsageWindow = (value: unknown): value is CPARefillUsageWindow => {
  if (!value || typeof value !== 'object') return false;
  const window = value as Partial<CPARefillUsageWindow>;
  const counters = [window.requests, window.tokens, window.cost_micro_usd];
  if (!counters.every((counter) => typeof counter === 'number' && Number.isFinite(counter) && counter >= 0)) {
    return false;
  }
  const start = typeof window.window_start === 'string' ? new Date(window.window_start) : null;
  const end = typeof window.window_end === 'string' ? new Date(window.window_end) : null;
  return Boolean(start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start < end);
};

const credentialIDs = (item: Record<string, unknown> | null | undefined): number[] => {
  if (!item || !Array.isArray(item.credential_ids)) return [];
  return item.credential_ids
    .map((value) => numberValue(value))
    .filter((value) => Number.isInteger(value) && value > 0);
};

const isMergedAccount = (item: Record<string, unknown> | null | undefined) =>
  Boolean(item?.merged === true || numberValue(item?.credential_count) > 1 || credentialIDs(item).length > 1);

const credentialSummaries = (value: unknown): CPARefillCredentialSummary[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((credential): credential is CPARefillCredentialSummary => {
    if (!credential || typeof credential !== 'object') return false;
    const id = numberValue((credential as Record<string, unknown>).id);
    return Number.isInteger(id) && id > 0;
  });
};

// 账号列表按逻辑账号展示；凭证数量与 ID 必须显式保留，避免管理员误以为金额被重复统计。
export function AccountIdentityCell({ item }: { item: Record<string, unknown> }) {
  const { t } = useTranslation();
  const merged = isMergedAccount(item);
  const count = Math.max(1, Math.trunc(numberValue(item.credential_count) || credentialIDs(item).length));
  return (
    <div className={styles.accountIdentityCell}>
      <strong title={stringValue(item.email)}>{stringValue(item.email)}</strong>
      <span className={merged ? styles.mergedAccountBadge : styles.singleAccountBadge}>
        {merged ? t('cpa_refill.account_merged_badge', { count }) : t('cpa_refill.account_single_badge')}
      </span>
    </div>
  );
}

// 状态摘要由 Controller 聚合后提供；没有摘要时回退到主凭证状态，兼容旧版本接口。
export function AccountStatusCell({ item }: { item: Record<string, unknown> }) {
  const { t } = useTranslation();
  const summary = item.status_summary || item.credential_status_summary;
  return (
    <div className={styles.accountStatusCell}>
      <span>{localizedValue('status', item.status, t)}</span>
      {summary ? <small>{String(summary)}</small> : null}
    </div>
  );
}

const asUsageWindows = (value: unknown): CPARefillUsageWindows | null => {
  if (!value || typeof value !== 'object') return null;
  const windows = value as Partial<CPARefillUsageWindows>;
  return isUsageWindow(windows.five_hour) && isUsageWindow(windows.seven_day)
    ? windows as CPARefillUsageWindows
    : null;
};

const formatUsageRange = (window: CPARefillUsageWindow) => {
  const start = new Date(window.window_start);
  const end = new Date(window.window_end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';
  const formatter = new Intl.DateTimeFormat(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
};

// quota 百分比保留一位有效小数；整数不补 .0，维持高密度表格的可扫描性。
const formatQuotaPercent = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(rounded);
};

const isQuotaWindow = (value: unknown): value is CPARefillQuotaWindow => {
  if (!value || typeof value !== 'object') return false;
  const window = value as Partial<CPARefillQuotaWindow>;
  if (
    ![window.used_milli_percent, window.remaining_milli_percent, window.window_seconds].every(
      (item) => typeof item === 'number' && Number.isFinite(item) && item >= 0
    ) || !window.window_seconds
  ) {
    return false;
  }
  // reset_at 是显式可空字段；缺字段也视为坏 DTO，防止悄悄退化成“未知”。
  if (!Object.prototype.hasOwnProperty.call(window, 'reset_at')) return false;
  if (window.reset_at !== null && (typeof window.reset_at !== 'string' || Number.isNaN(new Date(window.reset_at).getTime()))) return false;
  return true;
};

type QuotaWindowsParseResult =
  | { state: 'absent' | 'invalid'; quota: null }
  | { state: 'valid'; quota: CPARefillQuotaWindows };

// 缺失快照与坏 DTO 必须分开；否则接口兼容性或数据损坏会被误报成“尚未探测”。
const parseQuotaWindows = (value: unknown): QuotaWindowsParseResult => {
  if (value === null || value === undefined) return { state: 'absent', quota: null };
  if (typeof value !== 'object') return { state: 'invalid', quota: null };
  const quota = value as Partial<CPARefillQuotaWindows>;
  const fetchedAt = typeof quota.fetched_at === 'string' ? new Date(quota.fetched_at) : null;
  if (
    typeof quota.source !== 'string' || !quota.source ||
    (quota.status !== 'fresh' && quota.status !== 'stale') ||
    typeof quota.error_code !== 'string' ||
    typeof quota.plan_type !== 'string' ||
    (quota.fetched_at !== null && (!fetchedAt || Number.isNaN(fetchedAt.getTime())))
  ) {
    return { state: 'invalid', quota: null };
  }
  if (!Object.prototype.hasOwnProperty.call(quota, 'five_hour') || !Object.prototype.hasOwnProperty.call(quota, 'seven_day')) {
    return { state: 'invalid', quota: null };
  }
  if (quota.five_hour !== null && !isQuotaWindow(quota.five_hour)) return { state: 'invalid', quota: null };
  if (quota.seven_day !== null && !isQuotaWindow(quota.seven_day)) return { state: 'invalid', quota: null };

  const hasWindow = Boolean(quota.five_hour || quota.seven_day);
  const hasFailure = quota.error_code.trim() !== '';
  // fetched_at=null 只兼容“首次探测失败且尚无成功窗口”的 Controller 快照外壳。
  const isFirstFailureEnvelope = quota.status === 'stale' && hasFailure && !hasWindow && quota.fetched_at === null;
  if (quota.fetched_at === null && !isFirstFailureEnvelope) return { state: 'invalid', quota: null };
  if (hasWindow && !fetchedAt) return { state: 'invalid', quota: null };
  if (quota.status === 'fresh' && hasFailure) return { state: 'invalid', quota: null };
  return { state: 'valid', quota: quota as CPARefillQuotaWindows };
};

// 倒计时只接收页面共享时钟；组件自身不创建 interval，避免 50 行产生数百个定时器。
const formatQuotaCountdown = (resetAt: string | null, nowMS: number) => {
  if (!resetAt) return null;
  const resetMS = new Date(resetAt).getTime();
  if (!Number.isFinite(resetMS)) return null;
  const remainingMinutes = Math.max(0, Math.floor((resetMS - nowMS) / 60_000));
  const days = Math.floor(remainingMinutes / 1440);
  const hours = Math.floor((remainingMinutes % 1440) / 60);
  const minutes = remainingMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const useMinuteClock = () => {
  const [nowMS, setNowMS] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMS(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return nowMS;
};

const isCoreOverdraftCounter = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isCoreOverdraftConfig = (value: unknown): value is CPACoreOverdraftConfig => {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<CPACoreOverdraftConfig>;
  return (
    typeof config.enabled === 'boolean' &&
    (config.mode === 'observe' || config.mode === 'inject') &&
    isCoreOverdraftCounter(config['canary-percent']) &&
    config['canary-percent'] >= 1 &&
    config['canary-percent'] <= 100 &&
    (config['pair-count'] === 1 || config['pair-count'] === 2 || config['pair-count'] === 4) &&
    (config['tail-policy'] === 'user-only' || config['tail-policy'] === 'user-and-tool-output') &&
    typeof config['oauth-only'] === 'boolean' &&
    isCoreOverdraftCounter(config['max-body-bytes']) &&
    config['max-body-bytes'] > 0
  );
};

const isCoreOverdraftRuntimeStatus = (value: unknown): value is CPACoreOverdraftRuntimeStatus => {
  if (!value || typeof value !== 'object') return false;
  const status = value as Partial<CPACoreOverdraftRuntimeStatus>;
  const startedAt = typeof status['started-at'] === 'string' ? new Date(status['started-at']) : null;
  if (!startedAt || Number.isNaN(startedAt.getTime())) return false;
  if (
    !isCoreOverdraftCounter(status.evaluated) ||
    !isCoreOverdraftCounter(status.observed) ||
    !isCoreOverdraftCounter(status.injected) ||
    !status.skipped ||
    typeof status.skipped !== 'object' ||
    !Object.values(status.skipped).every(isCoreOverdraftCounter) ||
    !status.outcomes ||
    typeof status.outcomes !== 'object'
  ) {
    return false;
  }
  return [
    status.outcomes.success,
    status.outcomes['usage-limit'],
    status.outcomes['hard-stop'],
    status.outcomes.canceled,
    status.outcomes['other-failure'],
  ].every(isCoreOverdraftCounter);
};

const parseCoreOverdraftStatus = (value: unknown): CPACoreOverdraftStatusResponse | null => {
  if (!value || typeof value !== 'object') return null;
  const response = value as Partial<CPACoreOverdraftStatusResponse>;
  return isCoreOverdraftConfig(response.config) && isCoreOverdraftRuntimeStatus(response.status)
    ? response as CPACoreOverdraftStatusResponse
    : null;
};

// 面板只展示 CPA 进程级实验计数，不能把 success 解释成逐账号或突破额度的确认值。
export function CoreOverdraftStatusPanel({ value }: { value: unknown }) {
  const { t } = useTranslation();
  const parsed = parseCoreOverdraftStatus(value);
  if (!parsed) {
    return (
      <section className={`${styles.coreOverdraftPanel} ${styles.coreOverdraftUnavailable}`}>
        <div className={styles.coreOverdraftHeader}>
          <div>
            <span className={styles.coreOverdraftEyebrow}>CORE</span>
            <strong>{t('cpa_refill.core_overdraft_title')}</strong>
          </div>
          <span className={styles.coreOverdraftState}>{t('cpa_refill.core_overdraft_unavailable')}</span>
        </div>
        <p>{t('cpa_refill.core_overdraft_global_hint')}</p>
      </section>
    );
  }

  const { config, status } = parsed;
  const stateKey = !config.enabled
    ? 'disabled'
    : config.mode === 'observe'
      ? 'observe'
      : status.injected > 0
        ? 'inject'
        : 'waiting';
  const skipped = Object.entries(status.skipped)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1]);
  const startedAt = new Date(status['started-at']).toLocaleString();
  const metrics = [
    { key: 'evaluated', label: t('cpa_refill.core_overdraft_evaluated'), value: status.evaluated },
    { key: 'observed', label: t('cpa_refill.core_overdraft_observed'), value: status.observed },
    { key: 'injected', label: t('cpa_refill.core_overdraft_injected'), value: status.injected },
    {
      key: 'success',
      // 结果计数跨 observe/inject 热更新累计，不能按当前 mode 反推历史请求是否真的注入。
      label: t('cpa_refill.core_overdraft_process_success'),
      value: status.outcomes.success,
    },
    { key: 'usage-limit', label: t('cpa_refill.core_overdraft_usage_limit'), value: status.outcomes['usage-limit'] },
    { key: 'hard-stop', label: t('cpa_refill.core_overdraft_hard_stop'), value: status.outcomes['hard-stop'] },
    { key: 'canceled', label: t('cpa_refill.core_overdraft_canceled'), value: status.outcomes.canceled },
    { key: 'other-failure', label: t('cpa_refill.core_overdraft_other_failure'), value: status.outcomes['other-failure'] },
  ];

  return (
    <section className={styles.coreOverdraftPanel} data-mode={stateKey}>
      <div className={styles.coreOverdraftHeader}>
        <div>
          <span className={styles.coreOverdraftEyebrow}>CORE</span>
          <strong>{t('cpa_refill.core_overdraft_title')}</strong>
        </div>
        <span className={styles.coreOverdraftState}>
          {t(`cpa_refill.core_overdraft_status_${stateKey}`)}
        </span>
      </div>
      <div className={styles.coreOverdraftConfig}>
        <span>{t('cpa_refill.core_overdraft_canary', { percent: config['canary-percent'] })}</span>
        <span>{t('cpa_refill.core_overdraft_strength', { pairs: config['pair-count'] })}</span>
        <span>
          {t(config['oauth-only'] ? 'cpa_refill.core_overdraft_oauth_only' : 'cpa_refill.core_overdraft_all_auth')}
        </span>
      </div>
      <div className={styles.coreOverdraftMetrics}>
        {metrics.map((metric) => (
          <article key={metric.key} data-metric={metric.key} aria-label={t('cpa_refill.core_overdraft_metric', metric)}>
            <span>{metric.label}</span>
            <strong>{new Intl.NumberFormat().format(metric.value)}</strong>
          </article>
        ))}
      </div>
      <div className={styles.coreOverdraftFooter}>
        <div>
          <span>{t('cpa_refill.core_overdraft_started_at')}</span>
          <strong>{startedAt}</strong>
        </div>
        {skipped.length > 0 && (
          <details className={styles.coreOverdraftSkipped}>
            <summary>{t('cpa_refill.core_overdraft_skipped')}</summary>
            <div>
              {skipped.map(([reason, count]) => (
                <span key={reason}><code>{reason}</code><b>{new Intl.NumberFormat().format(count)}</b></span>
              ))}
            </div>
          </details>
        )}
      </div>
      <p>{t('cpa_refill.core_overdraft_global_hint')}</p>
    </section>
  );
}

// 生产管理页的经营统计区块与运行状态卡片分层展示，避免金额和队列指标混在一起。
export function OperatingStatisticsCards({ statistics }: { statistics?: CPARefillStatistics }) {
  const { t } = useTranslation();
  const values = statistics || ({} as Partial<CPARefillStatistics>);
  const cards = [
    {
      key: 'purchase',
      label: t('cpa_refill.today_purchase_cost'),
      value: formatOperatingFen(values.today_purchase_fen),
      meta: t('cpa_refill.statistics_today_purchase_hint'),
    },
    {
      key: 'balance',
      label: t('cpa_refill.supplier_available_balance'),
      value: formatOperatingFen(values.supplier_available_fen),
      meta: operatingNumber(values.supplier_balance_fen) === null || operatingNumber(values.supplier_held_fen) === null
        ? t('cpa_refill.statistics_unavailable')
        : t('cpa_refill.statistics_balance_hint', {
            balance: formatOperatingFen(values.supplier_balance_fen),
            held: formatOperatingFen(values.supplier_held_fen),
          }),
    },
    {
      key: 'tokens',
      label: t('cpa_refill.total_tokens_consumed'),
      value: formatOperatingTokens(values.total_tokens),
      meta: operatingNumber(values.today_tokens) === null
        ? t('cpa_refill.statistics_unavailable')
        : t('cpa_refill.statistics_today_tokens_hint', { tokens: formatOperatingTokens(values.today_tokens) }),
    },
    {
      key: 'usage',
      label: t('cpa_refill.total_account_usage_cost'),
      value: formatOperatingMicroUSD(values.total_usage_micro_usd),
      meta: operatingNumber(values.today_usage_micro_usd) === null
        ? t('cpa_refill.statistics_unavailable')
        : t('cpa_refill.statistics_today_usage_hint', { amount: formatOperatingMicroUSD(values.today_usage_micro_usd) }),
    },
  ];

  return (
    <section className={styles.statisticsSection} aria-labelledby="refill-operating-statistics-title">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="refill-operating-statistics-title">{t('cpa_refill.operating_statistics')}</h2>
          <p>{t('cpa_refill.operating_statistics_hint')}</p>
        </div>
      </div>
      <div className={styles.statisticsGrid}>
        {cards.map((card) => (
          <article key={card.key} className={styles.statisticsCard} data-statistic={card.key}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.value === '—' ? t('cpa_refill.statistics_unavailable') : card.meta}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

// 独立导出便于对实际渲染的请求数、Token、金额单位和可访问提示做回归测试。
export function UsageWindowCell({ value, quotaValue, nowMS = 0 }: { value: unknown; quotaValue?: unknown; nowMS?: number }) {
  const { t } = useTranslation();
  const windows = asUsageWindows(value);
  if (!windows) return <span className={styles.usageWindowMissing}>—</span>;
  const quotaResult = parseQuotaWindows(quotaValue);
  const quota = quotaResult.quota;
  const isStale = quota?.status === 'stale';
  const hasQuotaFailure = Boolean(quota?.error_code.trim());
  const rows: Array<{ key: keyof CPARefillUsageWindows; label: string; value: CPARefillUsageWindow }> = [
    { key: 'five_hour', label: '5h', value: windows.five_hour },
    { key: 'seven_day', label: '7d', value: windows.seven_day },
  ];
  return (
    <div className={styles.usageWindowCell} data-testid="usage-window-panel">
      <div className={styles.usageWindowHeader}>
        <span>{t('cpa_refill.usage_windows_summary_label')}</span>
        <QuotaInfoTooltip
          ariaLabel={t('cpa_refill.usage_windows_local_hint')}
          rows={[
            {
              key: 'local-window',
              label: t('cpa_refill.usage_windows_local_label'),
              value: t('cpa_refill.usage_windows_local_hint'),
            },
            {
              key: 'official-quota',
              label: t('cpa_refill.usage_quota_official_label'),
              value: t('cpa_refill.usage_quota_official_hint'),
            },
            {
              key: 'local-estimate',
              label: t('cpa_refill.usage_local_estimate_label'),
              value: t('cpa_refill.usage_local_estimate_hint'),
            },
          ]}
        />
      </div>
      <div className={styles.usageWindowRows}>
        {rows.map((row) => {
          const rangeLabel = t('cpa_refill.usage_statistics_range', { range: formatUsageRange(row.value) });
          const quotaWindow = quota?.[row.key] ?? null;
          const usedPercent = quotaWindow ? quotaWindow.used_milli_percent / 1000 : null;
          // 剩余值使用 Controller 显式 DTO；异常大于 100 的已用值仍保留，视觉宽度则钳制到 100%。
          const remainingPercent = quotaWindow ? Math.max(0, quotaWindow.remaining_milli_percent / 1000) : null;
          const progressWidth = usedPercent === null ? 0 : Math.max(0, Math.min(100, usedPercent));
          const countdown = quotaWindow ? formatQuotaCountdown(quotaWindow.reset_at, nowMS) : null;
          const severity = usedPercent === null ? 'normal' : usedPercent >= 100 ? 'critical' : usedPercent >= 80 ? 'warning' : 'normal';
          const severityClass = severity === 'critical'
            ? styles.usageQuotaCritical
            : severity === 'warning'
              ? styles.usageQuotaWarning
              : '';
          const quotaState = quotaWindow
            ? (isStale ? 'stale' : 'fresh')
            : quotaResult.state === 'absent'
              ? 'unprobed'
              : quotaResult.state === 'invalid'
                ? 'invalid'
              : hasQuotaFailure
                ? 'failed'
                : 'missing';
          const missingQuotaLabel = quotaResult.state === 'absent'
            ? t('cpa_refill.usage_quota_unprobed')
            : quotaResult.state === 'invalid'
              ? t('cpa_refill.usage_quota_invalid')
            : hasQuotaFailure
              ? t('cpa_refill.usage_quota_fetch_failed')
              : t('cpa_refill.usage_quota_window_missing');
          const quotaClassName = [styles.usageQuotaRow, severityClass, isStale && quotaWindow ? styles.usageQuotaStale : '']
            .filter(Boolean)
            .join(' ');
          return (
            <div
              className={styles.usageWindowRow}
              data-testid="usage-window-row"
              data-window-key={row.key}
              key={row.key}
              role="group"
              title={rangeLabel}
              aria-label={rangeLabel}
            >
              <strong className={row.key === 'five_hour' ? styles.fiveHourBadge : styles.sevenDayBadge}>{row.label}</strong>
              <div className={styles.usageWindowMetrics}>
                <span title={t('cpa_refill.usage_requests')}>{`${formatCompactCount(row.value.requests)} req`}</span>
                <span title={t('cpa_refill.usage_tokens')}>{formatCompactCount(row.value.tokens)}</span>
                <span
                  className={styles.usageLocalEstimate}
                  data-testid="usage-local-estimate"
                  title={t('cpa_refill.usage_local_estimate_hint')}
                >
                  <small>{t('cpa_refill.usage_local_estimate_label')}</small>
                  {formatCompactMicroUSD(row.value.cost_micro_usd)}
                </span>
              </div>
              <div
                className={quotaClassName}
                data-quota-state={quotaState}
                data-quota-severity={quotaWindow ? severity : undefined}
              >
                {quotaWindow && usedPercent !== null && remainingPercent !== null ? (
                  <>
                    <div className={styles.usageQuotaPrimary}>
                      <i
                        className={`${styles.usageWindowTrack} ${row.key === 'five_hour' ? styles.fiveHourTrack : styles.sevenDayTrack}`}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={usedPercent}
                        aria-label={t('cpa_refill.usage_quota_progress', { window: row.label })}
                      >
                        <span style={{ width: `${progressWidth}%` }} />
                      </i>
                      <span className={styles.usageQuotaUsed}>
                        {`${t('cpa_refill.usage_used_label')} ${formatQuotaPercent(usedPercent)}%`}
                      </span>
                      <small className={styles.usageQuotaRemaining}>
                        {`${t('cpa_refill.usage_remaining_label')} ${formatQuotaPercent(remainingPercent)}%`}
                      </small>
                    </div>
                    <div className={styles.usageQuotaMeta}>
                      <small className={styles.usageQuotaReset}>
                        {countdown
                          ? t('cpa_refill.usage_resets_in', { time: countdown })
                          : t('cpa_refill.usage_reset_unknown')}
                      </small>
                      {isStale && <small className={styles.usageQuotaStaleLabel}>{t('cpa_refill.usage_quota_stale')}</small>}
                      {hasQuotaFailure && (
                        <small className={styles.usageQuotaFailedLabel}>{t('cpa_refill.usage_quota_fetch_failed')}</small>
                      )}
                    </div>
                  </>
                ) : (
                  <small
                    className={[styles.usageQuotaUnavailable,
                      quotaState === 'failed'
                        ? styles.usageQuotaFailedLabel
                        : quotaState === 'missing' || quotaState === 'invalid'
                          ? styles.usageQuotaMissingLabel
                          : ''
                    ].filter(Boolean).join(' ')}
                  >
                    {missingQuotaLabel}
                  </small>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 合并行展示总额，详情再按凭证拆开显示 5h/7d 金额，避免管理员只能看到一个无法追溯的合计数。
export function CredentialCostBreakdown({ value }: { value: unknown }) {
  const { t } = useTranslation();
  const credentials = credentialSummaries(value);
  if (credentials.length < 2) return null;
  return (
    <section className={styles.credentialCostBreakdown}>
      <div className={styles.credentialCostHeader}>
        <strong>{t('cpa_refill.credential_cost_title')}</strong>
        <small>{t('cpa_refill.credential_cost_hint')}</small>
      </div>
      <div className={styles.credentialCostList}>
        {credentials.map((credential) => {
          const windows = asUsageWindows(credential.usage_windows);
          const status = credential.status ? localizedValue('status', credential.status, t) : '—';
          const windowRows = windows ? [
            { key: 'five_hour', label: '5h', value: windows.five_hour },
            { key: 'seven_day', label: '7d', value: windows.seven_day },
          ] : [];
          return (
            <article className={styles.credentialCostRow} key={credential.id}>
              <div className={styles.credentialCostIdentity}>
                <strong>#{credential.id}</strong>
                <span>{status}</span>
                <small title={stringValue(credential.cpa_auth_id)}>
                  {t('cpa_refill.fields.cpa_auth_id')}: {stringValue(credential.cpa_auth_id)}
                </small>
              </div>
              {windows ? (
                <div className={styles.credentialCostValues}>
                  {windowRows.map((row) => (
                    <div className={styles.credentialCostWindow} key={row.key}>
                      <b>{row.label}</b>
                      <div className={styles.credentialCostWindowMetrics}>
                        <span title={t('cpa_refill.usage_requests')}>{formatTokenCount(row.value.requests)} req</span>
                        <span title={t('cpa_refill.usage_tokens')}>{formatTokenCount(row.value.tokens)} Token</span>
                        <span title={t('cpa_refill.usage_local_estimate_hint')}>A {formatMicroUSD(row.value.cost_micro_usd)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <small className={styles.credentialCostMissing}>{t('cpa_refill.credential_cost_missing')}</small>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// 供应商订单金额以人民币分返回，与容量/账号的 micro USD 不是同一单位。
const formatFen = (value: unknown) => `¥${(numberValue(value) / 100).toFixed(2)}`;

// 容量字段与账号累计金额使用同一 micro USD 单位，避免决策页直接展示难读的大整数。
const moneyFields = new Set(['current_capacity', 'target_capacity', 'deficit']);

const localizedValue = (key: string, value: unknown, translate: (key: string, options?: Record<string, unknown>) => string) => {
  const text = String(value);
  if (key === 'status' || key === 'source' || key === 'import_status' || key === 'level' || key === 'provider' ||
      key === 'reason' || key === 'event_type' || key === 'entity' || key === 'error_code') {
    return translate(`cpa_refill.values.${key}.${text}`, { defaultValue: text });
  }
  return text;
};

const displayValue = (
  key: string,
  value: unknown,
  translate: (key: string, options?: Record<string, unknown>) => string
) => {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? translate('common.yes') : translate('common.no');
  if (typeof value === 'object') return JSON.stringify(value);
  if (key === 'total_tokens') return formatTokenCount(value);
  if (key === 'cost_micro_usd') return formatMicroUSD(value);
  if (moneyFields.has(key)) return formatMicroUSD(value);
  if (key === 'amount') return formatFen(value);
  if (key.endsWith('_at') || key === 'created_at' || key === 'updated_at') {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }
  return localizedValue(key, value, translate);
};

const translatedOptions = (
  values: string[],
  key: 'status' | 'import_status' | 'level',
  translate: (key: string, options?: Record<string, unknown>) => string
): SelectOption[] => values.map((value) => ({ value, label: localizedValue(key, value, translate) }));

const actionKey = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}`;
};

export function CPARefillPage() {
  const { t } = useTranslation();
  const quotaClockMS = useMinuteClock();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<CPARefillOverview | null>(null);
  const [coreOverdraftStatus, setCoreOverdraftStatus] = useState<CPACoreOverdraftStatusResponse | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [nextCursor, setNextCursor] = useState('');
  const [hasMore, setHasMore] = useState(false);
  // 每类记录保留独立筛选，避免账号状态切到订单后形成无效组合查询。
  const [filtersByResource, setFiltersByResource] = useState(initialFiltersByResource);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDetail, setSelectedDetail] = useState<Record<string, unknown> | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<Array<Record<string, unknown>>>([]);
  const [selectedAccountID, setSelectedAccountID] = useState(0);
  const [selectedAccountMeta, setSelectedAccountMeta] = useState<Record<string, unknown> | null>(null);
  const [eventNextCursor, setEventNextCursor] = useState('');
  const [eventHasMore, setEventHasMore] = useState(false);
  const [eventLoading, setEventLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailKind, setDetailKind] = useState<'accounts' | 'orders'>('accounts');
  const [policy, setPolicy] = useState<CPARefillPolicy | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [manualQuantity, setManualQuantity] = useState(1);
  const [actionLoading, setActionLoading] = useState('');
  const listRequestIDRef = useRef(0);
  const detailRequestIDRef = useRef(0);
  const coreOverdraftRequestIDRef = useRef(0);
  // 网络超时后保留相同意图的幂等键；只有明确成功才清除，避免人工重试重复采购。
  const pendingWriteKeysRef = useRef(new Map<string, string>());

  const filters = isListResource(activeTab) ? filtersByResource[activeTab] : emptyFilters();
  const activeStatusOptions = isListResource(activeTab) ? statusOptions[activeTab] : undefined;
  const statusSelectOptions = activeStatusOptions
    ? translatedOptions(activeStatusOptions, 'status', t)
    : [];
  const importSelectOptions = translatedOptions(importStatusOptions, 'import_status', t);
  const levelSelectOptions = translatedOptions(eventLevelOptions, 'level', t);
  const setActiveFilters = (next: ListFilters) => {
    if (!isListResource(activeTab)) return;
    setFiltersByResource((current) => ({ ...current, [activeTab]: next }));
  };

  const writeIntent = (scope: string, payload: unknown) => {
    const fingerprint = `${scope}:${JSON.stringify(payload)}`;
    const existing = pendingWriteKeysRef.current.get(fingerprint);
    if (existing) return { fingerprint, key: existing };
    const key = actionKey(scope);
    pendingWriteKeysRef.current.set(fingerprint, key);
    return { fingerprint, key };
  };

  const loadOverview = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const latestOverview = await cpaRefillApi.overview();
      setOverview(latestOverview);
      setError('');
      return latestOverview;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('cpa_refill.load_failed'));
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [t]);

  // 核心状态读取失败只降级当前面板，不污染自动补号 Controller 的页面错误状态。
  const loadCoreOverdraftStatus = useCallback(async () => {
    const requestID = ++coreOverdraftRequestIDRef.current;
    try {
      const nextStatus = await cpaRefillApi.coreOverdraftStatus();
      if (requestID !== coreOverdraftRequestIDRef.current) return;
      setCoreOverdraftStatus(nextStatus);
    } catch {
      if (requestID !== coreOverdraftRequestIDRef.current) return;
      setCoreOverdraftStatus(null);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
    void loadCoreOverdraftStatus();
    const timer = window.setInterval(() => {
      if (shouldPollCPARefillOverview(document.visibilityState)) {
        void loadOverview(true);
        void loadCoreOverdraftStatus();
      }
    }, CPA_REFILL_OVERVIEW_POLL_MS);
    const refreshVisiblePage = () => {
      if (shouldPollCPARefillOverview(document.visibilityState)) {
        void loadOverview(true);
        void loadCoreOverdraftStatus();
      }
    };
    document.addEventListener('visibilitychange', refreshVisiblePage);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshVisiblePage);
    };
  }, [loadCoreOverdraftStatus, loadOverview]);

  const loadList = useCallback(async (
    resource: CPARefillListResource,
    append = false,
    queryFilters = filtersByResource[resource]
  ) => {
    const requestID = ++listRequestIDRef.current;
    setListLoading(true);
    try {
      const query: CPARefillListQuery = {
        q: queryFilters.q.trim(),
        status: queryFilters.status,
        source: resource === 'accounts' ? queryFilters.source : undefined,
        import_status: resource === 'accounts' ? queryFilters.import_status : undefined,
        provider: resource === 'orders' || resource === 'recoveries' ? queryFilters.provider : undefined,
        level: resource === 'events' ? queryFilters.level : undefined,
        from: toRFC3339(queryFilters.from),
        to: toRFC3339(queryFilters.to),
        limit: 50,
        cursor: append ? nextCursor : undefined,
        // 分组必须在 Controller 分页前完成，前端只负责展示聚合结果。
        grouped: resource === 'accounts' ? true : undefined,
      };
      const response = resource === 'accounts'
        ? await cpaRefillApi.list<CPARefillAccountListItem>(resource, query)
        : await cpaRefillApi.list(resource, query);
      if (requestID !== listRequestIDRef.current) return;
      setItems((current) => (append ? [...current, ...response.items] : response.items));
      setNextCursor(response.page.next_cursor || '');
      setHasMore(response.page.has_more);
      setError('');
    } catch (loadError) {
      if (requestID !== listRequestIDRef.current) return;
      setError(loadError instanceof Error ? loadError.message : t('cpa_refill.load_failed'));
    } finally {
      if (requestID === listRequestIDRef.current) setListLoading(false);
    }
  }, [filtersByResource, nextCursor, t]);

  const loadPolicy = useCallback(async () => {
    setPolicyLoading(true);
    try {
      setPolicy(await cpaRefillApi.policy());
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('cpa_refill.load_failed'));
    } finally {
      setPolicyLoading(false);
    }
  }, [t]);

  useEffect(() => {
    detailRequestIDRef.current += 1;
    setSelectedDetail(null);
    setSelectedEvents([]);
    setSelectedAccountID(0);
    setSelectedAccountMeta(null);
    setEventNextCursor('');
    setEventHasMore(false);
    if (activeTab === 'overview') return;
    if (activeTab === 'policy') {
      void loadPolicy();
      return;
    }
    setItems([]);
    setNextCursor('');
    void loadList(activeTab, false);
    // 切换标签时按当前筛选重新查询；筛选本身由“查询”按钮显式触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const openDetail = async (item: Record<string, unknown>) => {
    const id = numberValue(item.id);
    if (!id || (activeTab !== 'accounts' && activeTab !== 'orders')) return;
    const detailResource = activeTab;
    setDetailKind(detailResource);
    setSelectedAccountMeta(detailResource === 'accounts' ? item : null);
    const requestID = ++detailRequestIDRef.current;
    setDetailLoading(true);
    try {
      if (detailResource === 'accounts') {
        const [detail, events] = await Promise.all([
          cpaRefillApi.accountDetail(id),
          cpaRefillApi.accountEvents(id, { limit: 50 }),
        ]);
        if (requestID !== detailRequestIDRef.current) return;
        setSelectedDetail(detail);
        setSelectedEvents(events.items);
        setSelectedAccountID(id);
        setEventNextCursor(events.page.next_cursor || '');
        setEventHasMore(events.page.has_more);
      } else {
        const detail = await cpaRefillApi.orderDetail(id);
        if (requestID !== detailRequestIDRef.current) return;
        setSelectedDetail(detail);
        setSelectedEvents([]);
      }
    } catch (loadError) {
      if (requestID !== detailRequestIDRef.current) return;
      showNotification(loadError instanceof Error ? loadError.message : t('cpa_refill.load_failed'), 'error');
    } finally {
      if (requestID === detailRequestIDRef.current) setDetailLoading(false);
    }
  };

  // 抽屉的所有关闭入口共用同一清理逻辑，避免请求回包后重新打开已关闭的详情。
  const closeDetail = () => {
    detailRequestIDRef.current += 1;
    setSelectedDetail(null);
    setSelectedEvents([]);
    setSelectedAccountID(0);
    setSelectedAccountMeta(null);
    setEventNextCursor('');
    setEventHasMore(false);
    setDetailLoading(false);
  };

  const loadMoreAccountEvents = async () => {
    if (!selectedAccountID || !eventNextCursor || eventLoading) return;
    setEventLoading(true);
    try {
      const response = await cpaRefillApi.accountEvents(selectedAccountID, {
        limit: 50,
        cursor: eventNextCursor,
      });
      setSelectedEvents((current) => [...current, ...response.items]);
      setEventNextCursor(response.page.next_cursor || '');
      setEventHasMore(response.page.has_more);
    } catch (loadError) {
      showNotification(loadError instanceof Error ? loadError.message : t('cpa_refill.load_failed'), 'error');
    } finally {
      setEventLoading(false);
    }
  };

  const executeAction = async (action: CPARefillAction) => {
    const quantity = action === 'manual-refill' ? manualQuantity : undefined;
    const payload = { quantity, reason: 'cpamp_operator_action' };
    if (!window.confirm(t(`cpa_refill.confirm_${action.replace('-', '_')}`))) return;
    const intent = writeIntent(action, payload);
    setActionLoading(action);
    try {
      await cpaRefillApi.action(action, payload, intent.key);
      pendingWriteKeysRef.current.delete(intent.fingerprint);
      showNotification(t('cpa_refill.action_accepted'), 'success');
      await Promise.all([loadOverview(true), activeTab === 'policy' ? loadPolicy() : Promise.resolve()]);
    } catch (actionError) {
      showNotification(actionError instanceof Error ? actionError.message : t('cpa_refill.action_failed'), 'error');
    } finally {
      setActionLoading('');
    }
  };

  const savePolicy = async () => {
    if (!policy || !window.confirm(t('cpa_refill.confirm_policy'))) return;
    const intent = writeIntent('policy', policy);
    setPolicyLoading(true);
    try {
      const savedPolicy = await cpaRefillApi.updatePolicy(policy, intent.key);
      setPolicy(savedPolicy);
      pendingWriteKeysRef.current.delete(intent.fingerprint);
      const latestOverview = await loadOverview(true);
      showNotification(
        isCPARefillPolicyPendingActivation(savedPolicy, latestOverview)
          ? t('cpa_refill.policy_saved_pending')
          : t('cpa_refill.policy_saved'),
        'success'
      );
    } catch (saveError) {
      if (isCPARefillPolicyStateConflict(saveError)) {
        // 真实冲突只表示 policy version 已变化；立即刷新，避免用户继续拿旧版本重复提交。
        await Promise.all([loadOverview(true), loadPolicy()]);
        showNotification(t('cpa_refill.policy_state_conflict'), 'error');
      } else if (isCPARefillPolicyIdempotencyConflict(saveError)) {
        // 冲突键无法通过原样重试恢复；清除后让下一次保存生成全新的幂等键。
        pendingWriteKeysRef.current.delete(intent.fingerprint);
        showNotification(t('cpa_refill.policy_idempotency_conflict'), 'error');
      } else {
        showNotification(saveError instanceof Error ? saveError.message : t('cpa_refill.action_failed'), 'error');
      }
    } finally {
      setPolicyLoading(false);
    }
  };

  const summaryCards = useMemo(() => {
    const capacity = overview?.capacity || {};
    const decision = overview?.decision || {};
    const supplier = overview?.supplier || {};
    const usage = overview?.usage || {};
    return [
      { label: t('cpa_refill.available_accounts'), value: overview?.available_accounts ?? 0, meta: overview?.mode || '—' },
      { label: t('cpa_refill.capacity_deficit'), value: displayValue('deficit', capacity.deficit, t), meta: `${t('cpa_refill.target')}: ${displayValue('target_capacity', capacity.target, t)}` },
      { label: t('cpa_refill.planned_quantity'), value: stringValue(decision.planned_quantity), meta: localizedValue('reason', decision.reason, t) },
      { label: t('cpa_refill.supplier_inventory'), value: stringValue(supplier.inventory), meta: stringValue(supplier.circuit_state) },
      { label: t('cpa_refill.queue_depth'), value: `${stringValue(usage.queue_depth)} / ${stringValue(usage.queue_capacity)}`, meta: stringValue(usage.gap_code) },
    ];
  }, [overview, t]);

  if (loading && !overview) {
    return <div className={styles.center}><LoadingSpinner size={28} /></div>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>{t('cpa_refill.eyebrow')}</div>
          <h1>{t('cpa_refill.title')}</h1>
          <p>{t('cpa_refill.subtitle')}</p>
        </div>
        <div className={styles.heroActions}>
          <span className={`${styles.statusBadge} ${overview?.status === 'healthy' ? styles.healthy : styles.degraded}`}>
            <span />{overview?.status ? localizedValue('status', overview.status, t) : t('cpa_refill.unavailable')}
          </span>
          <Button variant="secondary" size="sm" onClick={() => {
            void Promise.all([loadOverview(), loadCoreOverdraftStatus()]);
          }}>{t('cpa_refill.refresh')}</Button>
        </div>
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <nav className={styles.tabs} aria-label={t('cpa_refill.tabs_label')}>
        {tabs.map((tab) => (
          <button key={tab} type="button" className={activeTab === tab ? styles.activeTab : ''} onClick={() => setActiveTab(tab)}>
            {t(`cpa_refill.tabs.${tab}`)}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' && (
        <>
          <OperatingStatisticsCards statistics={overview?.statistics} />
          <section className={styles.summaryGrid}>
            {summaryCards.map((card) => (
              <article key={card.label} className={styles.summaryCard}>
                <span>{card.label}</span><strong>{card.value}</strong><small>{card.meta}</small>
              </article>
            ))}
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>{t('cpa_refill.dependencies')}</h2><p>{t('cpa_refill.dependencies_hint')}</p></div></div>
            <div className={styles.dependencyGrid}>
              {(overview?.dependencies || []).map((dependency, index) => (
                <article key={`${stringValue(dependency.name)}-${index}`}>
                  <div><strong>{stringValue(dependency.name)}</strong><span className={styles.miniBadge}>{localizedValue('status', dependency.status, t)}</span></div>
                  <p>{stringValue(dependency.message)}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {activeTab !== 'overview' && activeTab !== 'policy' && (
        <section className={styles.panel}>
          {activeTab === 'accounts' && (
            <>
              <div className={styles.accountMergeNotice} role="note">
                <strong>{t('cpa_refill.account_merge_title')}</strong>
                <span>{t('cpa_refill.account_merge_hint')}</span>
              </div>
              <CoreOverdraftStatusPanel value={coreOverdraftStatus} />
            </>
          )}
          <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); void loadList(activeTab, false); }}>
            <input value={filters.q} onChange={(event) => setActiveFilters({ ...filters, q: event.target.value })} placeholder={t(activeTab === 'accounts' ? 'cpa_refill.search_account_placeholder' : 'cpa_refill.search_placeholder')} />
            {statusOptions[activeTab] && <Select value={filters.status} options={statusSelectOptions} onChange={(status) => setActiveFilters({ ...filters, status })} placeholder={t('cpa_refill.status_placeholder')} triggerClassName={styles.filterSelectTrigger} />}
            {activeTab === 'accounts' && <input value={filters.source} onChange={(event) => setActiveFilters({ ...filters, source: event.target.value })} placeholder={t('cpa_refill.source_placeholder')} />}
            {activeTab === 'accounts' && <Select value={filters.import_status} options={importSelectOptions} onChange={(import_status) => setActiveFilters({ ...filters, import_status })} placeholder={t('cpa_refill.import_status_placeholder')} triggerClassName={styles.filterSelectTrigger} />}
            {activeTab === 'accounts' && <Select value="codex" options={[{ value: 'codex', label: 'Codex' }]} onChange={() => undefined} disabled ariaLabel={t('cpa_refill.account_type')} triggerClassName={styles.filterSelectTrigger} />}
            {(activeTab === 'orders' || activeTab === 'recoveries') && <input value={filters.provider} onChange={(event) => setActiveFilters({ ...filters, provider: event.target.value })} placeholder={t('cpa_refill.provider_placeholder')} />}
            {activeTab === 'events' && <Select value={filters.level} options={levelSelectOptions} onChange={(level) => setActiveFilters({ ...filters, level })} placeholder={t('cpa_refill.level_placeholder')} triggerClassName={styles.filterSelectTrigger} />}
            <input type="datetime-local" value={filters.from} onChange={(event) => setActiveFilters({ ...filters, from: event.target.value })} aria-label={t('cpa_refill.from_time')} />
            <input type="datetime-local" value={filters.to} onChange={(event) => setActiveFilters({ ...filters, to: event.target.value })} aria-label={t('cpa_refill.to_time')} />
            <Button type="submit" size="sm" loading={listLoading}>{t('cpa_refill.search')}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => {
              const resetFilters = emptyFilters();
              setActiveFilters(resetFilters);
              void loadList(activeTab, false, resetFilters);
            }}>{t('cpa_refill.reset')}</Button>
          </form>
          <div className={styles.tableWrap}>
            <table><thead><tr>{columns[activeTab].map((column) => <th key={column}>{t(`cpa_refill.fields.${column}`, { defaultValue: column })}</th>)}{(activeTab === 'accounts' || activeTab === 'orders') && <th>{t('cpa_refill.operation')}</th>}</tr></thead>
              <tbody>{items.map((item, index) => <tr key={stringValue(item.id) + index}>{columns[activeTab].map((column) => {
                if (activeTab === 'accounts' && column === 'email') {
                  return <td key={column}><AccountIdentityCell item={item} /></td>;
                }
                if (activeTab === 'accounts' && column === 'status') {
                  return <td key={column}><AccountStatusCell item={item} /></td>;
                }
                return column === 'usage_windows'
                  ? <td key={column} className={styles.usageWindowTableCell}><UsageWindowCell value={item[column]} quotaValue={item.quota_windows} nowMS={quotaClockMS} /></td>
                  : <td key={column} title={displayValue(column, item[column], t)}>{displayValue(column, item[column], t)}</td>;
              })}{(activeTab === 'accounts' || activeTab === 'orders') && <td><button type="button" className={styles.detailButton} onClick={() => void openDetail(item)}>{t('cpa_refill.view_detail')}</button></td>}</tr>)}</tbody>
            </table>
            {!listLoading && items.length === 0 && <div className={styles.empty}>{t('cpa_refill.empty')}</div>}
          </div>
          {hasMore && <div className={styles.loadMore}><Button variant="secondary" size="sm" loading={listLoading} onClick={() => void loadList(activeTab, true)}>{t('cpa_refill.load_more')}</Button></div>}
        </section>
      )}

      {activeTab === 'policy' && (
        <section className={styles.policyGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>{t('cpa_refill.policy')}</h2><p>{t('cpa_refill.policy_hint')}</p></div></div>
            {policyLoading && !policy ? <div className={styles.center}><LoadingSpinner /></div> : policy && <div className={styles.policyForm}>
              <label>{t('cpa_refill.desired_mode')}<Select value={policy.desired_mode} options={['observe', 'active', 'paused'].map((value) => ({ value, label: t(`cpa_refill.values.mode.${value}`) }))} onChange={(desired_mode) => setPolicy({ ...policy, desired_mode })} triggerClassName={styles.policySelectTrigger} /></label>
              <label className={styles.checkbox}><input type="checkbox" checked={policy.purchase_enabled} onChange={(event) => setPolicy({ ...policy, purchase_enabled: event.target.checked })} />{t('cpa_refill.purchase_enabled')}</label>
              <label className={styles.checkbox}><input type="checkbox" checked={policy.recovery_enabled} onChange={(event) => setPolicy({ ...policy, recovery_enabled: event.target.checked })} />{t('cpa_refill.recovery_enabled')}</label>
              {(['window_minutes', 'target_coverage_seconds', 'minimum_healthy_accounts', 'max_cycle_quantity', 'order_hard_cap', 'min_order_gap_seconds', 'inventory_probe_seconds'] as const).map((field) => (
                <label key={field}>
                  {t(`cpa_refill.fields.${field}`)}
                  <input
                    type="number"
                    min={field === 'minimum_healthy_accounts' ? 0 : undefined}
                    max={field === 'minimum_healthy_accounts' ? 20 : undefined}
                    value={policy[field]}
                    onChange={(event) => setPolicy({ ...policy, [field]: Number(event.target.value) })}
                  />
                  {field === 'minimum_healthy_accounts' && <small>{t('cpa_refill.minimum_healthy_accounts_hint')}</small>}
                </label>
              ))}
              <Button loading={policyLoading} onClick={() => void savePolicy()}>{t('cpa_refill.save_policy')}</Button>
            </div>}
          </article>
          <article className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>{t('cpa_refill.actions')}</h2><p>{t('cpa_refill.actions_hint')}</p></div></div>
            <div className={styles.actionList}>
              <Button variant="secondary" loading={actionLoading === 'pause'} onClick={() => void executeAction('pause')}>{t('cpa_refill.pause')}</Button>
              <Button variant="secondary" loading={actionLoading === 'resume'} onClick={() => void executeAction('resume')}>{t('cpa_refill.resume')}</Button>
              <Button variant="secondary" loading={actionLoading === 'recalculate'} onClick={() => void executeAction('recalculate')}>{t('cpa_refill.recalculate')}</Button>
              <Button variant="secondary" loading={actionLoading === 'reset-circuit'} onClick={() => void executeAction('reset-circuit')}>{t('cpa_refill.reset_circuit')}</Button>
              <div className={styles.manualAction}><input type="number" min={1} max={20} value={manualQuantity} onChange={(event) => setManualQuantity(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} /><Button loading={actionLoading === 'manual-refill'} disabled={policy?.desired_mode !== 'active' || !policy?.purchase_enabled} onClick={() => void executeAction('manual-refill')}>{t('cpa_refill.manual_refill')}</Button></div>
              <small>{t('cpa_refill.manual_refill_hint')}</small>
            </div>
          </article>
        </section>
      )}

      <Drawer
        open={Boolean(selectedDetail) || detailLoading}
        onClose={closeDetail}
        width={560}
        className={styles.detailDrawer}
        title={
          <div className={styles.detailTitle}>
            <span>{detailKind === 'orders' ? t('cpa_refill.order_detail') : t('cpa_refill.account_detail')}</span>
            <strong>#{stringValue(selectedDetail?.id)}</strong>
          </div>
        }
      >
        {detailLoading ? (
          <div className={styles.center}><LoadingSpinner /></div>
        ) : selectedDetail ? (
          <div className={styles.detailContent}>
            {detailKind === 'accounts' && selectedAccountMeta && isMergedAccount(selectedAccountMeta) && (
              <section className={styles.mergedAccountSummary}>
                <div>
                  <strong>{t('cpa_refill.account_merged_detail_title')}</strong>
                  <span>{t('cpa_refill.account_merged_detail_hint', { count: Math.max(1, Math.trunc(numberValue(selectedAccountMeta.credential_count) || credentialIDs(selectedAccountMeta).length)) })}</span>
                </div>
                <div className={styles.credentialIDList}>
                  {credentialIDs(selectedAccountMeta).map((credentialID) => <code key={credentialID}>#{credentialID}</code>)}
                </div>
                <UsageWindowCell value={selectedAccountMeta.usage_windows} quotaValue={selectedAccountMeta.quota_windows} nowMS={quotaClockMS} />
                <CredentialCostBreakdown value={selectedAccountMeta.credentials} />
              </section>
            )}
            <dl className={styles.detailList}>
              {Object.entries(selectedDetail)
                // 合并账号的总金额已由聚合窗口展示；隐藏旧详情接口返回的单凭证累计值，避免两套口径并列误导。
                .filter(([key]) => key !== 'items' && !(detailKind === 'accounts' && selectedAccountMeta && isMergedAccount(selectedAccountMeta) && (key === 'total_tokens' || key === 'cost_micro_usd')))
                .map(([key, value]) => (
                  <div className={styles.detailRow} key={key}>
                    <dt>{t(`cpa_refill.fields.${key}`, { defaultValue: key })}</dt>
                    <dd title={displayValue(key, value, t)}>{displayValue(key, value, t)}</dd>
                  </div>
                ))}
            </dl>
            {Array.isArray(selectedDetail.items) && (
              <section className={styles.detailEvents}>
                <h3>{t('cpa_refill.delivered_items')}</h3>
                {selectedDetail.items.map((item, index) => (
                  <pre key={index}>{JSON.stringify(item, null, 2)}</pre>
                ))}
              </section>
            )}
            {selectedEvents.length > 0 && (
              <section className={styles.detailEvents}>
                <h3>{t('cpa_refill.account_events')}</h3>
                {selectedEvents.map((event, index) => (
                  <article key={index}>
                    <strong>{localizedValue('event_type', event.event_type, t)}</strong>
                    <span>{displayValue('created_at', event.created_at, t)}</span>
                    <small>{localizedValue('level', event.level, t)}</small>
                  </article>
                ))}
                {eventHasMore && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={eventLoading}
                    onClick={() => void loadMoreAccountEvents()}
                  >
                    {t('cpa_refill.load_more_events')}
                  </Button>
                )}
              </section>
            )}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

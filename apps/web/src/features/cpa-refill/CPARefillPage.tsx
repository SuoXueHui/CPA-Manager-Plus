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
  type CPARefillAction,
  type CPARefillAccountListItem,
  type CPARefillListQuery,
  type CPARefillListResource,
  type CPARefillOverview,
  type CPARefillPolicy,
  type CPARefillUsageWindow,
  type CPARefillUsageWindows,
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

const asUsageWindows = (value: unknown): CPARefillUsageWindows | null => {
  if (!value || typeof value !== 'object') return null;
  const windows = value as Partial<CPARefillUsageWindows>;
  return windows.five_hour && windows.seven_day ? windows as CPARefillUsageWindows : null;
};

const usageWindowBounds = (window: CPARefillUsageWindow) => {
  const start = new Date(window.window_start);
  const end = new Date(window.window_end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return { start, end };
};

const formatUsageRange = (window: CPARefillUsageWindow) => {
  const bounds = usageWindowBounds(window);
  if (!bounds) return '—';
  const formatter = new Intl.DateTimeFormat(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `${formatter.format(bounds.start)} – ${formatter.format(bounds.end)}`;
};

// 本地窗口没有官方额度上限，因此进度条只表达统计时间范围尚未走完的比例，不能解读为官方配额剩余。
const usageWindowProgress = (window: CPARefillUsageWindow, nowMs = Date.now()) => {
  const bounds = usageWindowBounds(window);
  if (!bounds) return null;
  const durationMs = bounds.end.getTime() - bounds.start.getTime();
  const remainingMs = Math.min(durationMs, Math.max(0, bounds.end.getTime() - nowMs));
  return {
    remainingPercent: Math.round((remainingMs / durationMs) * 100),
    remainingMs,
  };
};

const formatRemainingDuration = (remainingMs: number) => {
  const totalMinutes = Math.max(0, Math.ceil(remainingMs / 60_000));
  if (totalMinutes <= 0) return '0m';
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

// 独立导出便于对实际渲染的请求数、Token、金额单位和可访问提示做回归测试。
export function UsageWindowCell({ value }: { value: unknown }) {
  const { t } = useTranslation();
  const windows = asUsageWindows(value);
  if (!windows) return <span className={styles.usageWindowMissing}>—</span>;
  const rows: Array<{ key: keyof CPARefillUsageWindows; label: string; value: CPARefillUsageWindow }> = [
    { key: 'five_hour', label: '5h', value: windows.five_hour },
    { key: 'seven_day', label: '7d', value: windows.seven_day },
  ];
  return (
    <div className={styles.usageWindowCell}>
      <div className={styles.usageWindowHeader}>
        <span>{t('cpa_refill.usage_windows_local_label')}</span>
        <QuotaInfoTooltip
          ariaLabel={t('cpa_refill.usage_windows_local_hint')}
          rows={[{
            key: 'local-window',
            label: t('cpa_refill.fields.usage_windows'),
            value: t('cpa_refill.usage_windows_local_hint'),
          }]}
        />
      </div>
      {rows.map((row) => {
        const progress = usageWindowProgress(row.value);
        const progressLabel = progress
          ? t('cpa_refill.usage_remaining', { percent: progress.remainingPercent })
          : '';
        return (
          <div className={styles.usageWindowRow} key={row.key}>
          <div className={styles.usageWindowMetrics}>
            <span title={t('cpa_refill.usage_requests')}>{formatCompactCount(row.value.requests)} req</span>
            <span title={t('cpa_refill.usage_tokens')}>{formatCompactCount(row.value.tokens)}</span>
            <span title={t('cpa_refill.usage_account_cost')}>{formatCompactMicroUSD(row.value.cost_micro_usd)}</span>
          </div>
          <div className={styles.usageWindowRange}>
            <strong className={row.key === 'five_hour' ? styles.fiveHourBadge : styles.sevenDayBadge}>{row.label}</strong>
            {progress ? (
              <>
                <div
                  className={`${styles.usageWindowProgress} ${row.key === 'five_hour' ? styles.fiveHourProgress : styles.sevenDayProgress}`}
                  role="progressbar"
                  aria-label={progressLabel}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress.remainingPercent}
                  title={progressLabel}
                >
                  <span style={{ width: `${progress.remainingPercent}%` }} />
                </div>
                <small className={styles.usageWindowRemaining}>
                  <b>{progressLabel}</b>
                  <span>{t('cpa_refill.usage_remaining_time', { duration: formatRemainingDuration(progress.remainingMs) })}</span>
                </small>
              </>
            ) : <small>{formatUsageRange(row.value)}</small>}
          </div>
          <small className={styles.usageWindowStatisticsRange}>
            {t('cpa_refill.usage_statistics_range', { range: formatUsageRange(row.value) })}
          </small>
        </div>
        );
      })}
    </div>
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
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<CPARefillOverview | null>(null);
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
      setOverview(await cpaRefillApi.overview());
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('cpa_refill.load_failed'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadOverview();
    const timer = window.setInterval(() => {
      if (shouldPollCPARefillOverview(document.visibilityState)) {
        void loadOverview(true);
      }
    }, CPA_REFILL_OVERVIEW_POLL_MS);
    const refreshVisiblePage = () => {
      if (shouldPollCPARefillOverview(document.visibilityState)) void loadOverview(true);
    };
    document.addEventListener('visibilitychange', refreshVisiblePage);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshVisiblePage);
    };
  }, [loadOverview]);

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
      setPolicy(await cpaRefillApi.updatePolicy(policy, intent.key));
      pendingWriteKeysRef.current.delete(intent.fingerprint);
      showNotification(t('cpa_refill.policy_saved'), 'success');
      await loadOverview(true);
    } catch (saveError) {
      showNotification(saveError instanceof Error ? saveError.message : t('cpa_refill.action_failed'), 'error');
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
          <Button variant="secondary" size="sm" onClick={() => void loadOverview()}>{t('cpa_refill.refresh')}</Button>
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
              <tbody>{items.map((item, index) => <tr key={stringValue(item.id) + index}>{columns[activeTab].map((column) => column === 'usage_windows'
                ? <td key={column} className={styles.usageWindowTableCell}><UsageWindowCell value={item[column]} /></td>
                : <td key={column} title={displayValue(column, item[column], t)}>{displayValue(column, item[column], t)}</td>)}{(activeTab === 'accounts' || activeTab === 'orders') && <td><button type="button" className={styles.detailButton} onClick={() => void openDetail(item)}>{t('cpa_refill.view_detail')}</button></td>}</tr>)}</tbody>
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
              {(['window_minutes', 'target_coverage_seconds', 'max_cycle_quantity', 'order_hard_cap', 'min_order_gap_seconds', 'inventory_probe_seconds'] as const).map((field) => <label key={field}>{t(`cpa_refill.fields.${field}`)}<input type="number" value={policy[field]} onChange={(event) => setPolicy({ ...policy, [field]: Number(event.target.value) })} /></label>)}
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
            <dl className={styles.detailList}>
              {Object.entries(selectedDetail)
                .filter(([key]) => key !== 'items')
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

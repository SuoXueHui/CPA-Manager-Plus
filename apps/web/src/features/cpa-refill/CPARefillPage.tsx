import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  cpaRefillApi,
  type CPARefillAction,
  type CPARefillListQuery,
  type CPARefillListResource,
  type CPARefillOverview,
  type CPARefillPolicy,
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
  accounts: ['email', 'status', 'total_tokens', 'cost_micro_usd', 'imported_at', 'expires_at', 'last_request_at'],
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

// Token 使用完整千分位，便于管理员核对账号累计用量。
const formatTokenCount = (value: unknown) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(numberValue(value));

// Controller 金额以 micro USD 返回；管理页转换为美元但保留六位精度，避免小额被显示成 0。
const formatMicroUSD = (value: unknown) => `$${(numberValue(value) / 1_000_000).toFixed(6)}`;

const localizedValue = (key: string, value: unknown, translate: (key: string, options?: Record<string, unknown>) => string) => {
  const text = String(value);
  if (key === 'status' || key === 'source' || key === 'import_status' || key === 'level' || key === 'provider') {
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
  if (key.endsWith('_at') || key === 'created_at' || key === 'updated_at') {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }
  return localizedValue(key, value, translate);
};

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
  const [policy, setPolicy] = useState<CPARefillPolicy | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [manualQuantity, setManualQuantity] = useState(1);
  const [actionLoading, setActionLoading] = useState('');
  const listRequestIDRef = useRef(0);
  const detailRequestIDRef = useRef(0);
  // 网络超时后保留相同意图的幂等键；只有明确成功才清除，避免人工重试重复采购。
  const pendingWriteKeysRef = useRef(new Map<string, string>());

  const filters = isListResource(activeTab) ? filtersByResource[activeTab] : emptyFilters();
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
      const response = await cpaRefillApi.list(resource, query);
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
      { label: t('cpa_refill.capacity_deficit'), value: stringValue(capacity.deficit), meta: `${t('cpa_refill.target')}: ${stringValue(capacity.target)}` },
      { label: t('cpa_refill.planned_quantity'), value: stringValue(decision.planned_quantity), meta: stringValue(decision.reason) },
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
            {statusOptions[activeTab] && <select value={filters.status} onChange={(event) => setActiveFilters({ ...filters, status: event.target.value })}>
              <option value="">{t('cpa_refill.status_placeholder')}</option>
              {statusOptions[activeTab]?.map((status) => <option key={status} value={status}>{localizedValue('status', status, t)}</option>)}
            </select>}
            {activeTab === 'accounts' && <input value={filters.source} onChange={(event) => setActiveFilters({ ...filters, source: event.target.value })} placeholder={t('cpa_refill.source_placeholder')} />}
            {activeTab === 'accounts' && <select value={filters.import_status} onChange={(event) => setActiveFilters({ ...filters, import_status: event.target.value })}>
              <option value="">{t('cpa_refill.import_status_placeholder')}</option>
              {importStatusOptions.map((status) => <option key={status} value={status}>{localizedValue('import_status', status, t)}</option>)}
            </select>}
            {activeTab === 'accounts' && <select value="codex" disabled aria-label={t('cpa_refill.account_type')}><option value="codex">Codex</option></select>}
            {(activeTab === 'orders' || activeTab === 'recoveries') && <input value={filters.provider} onChange={(event) => setActiveFilters({ ...filters, provider: event.target.value })} placeholder={t('cpa_refill.provider_placeholder')} />}
            {activeTab === 'events' && <select value={filters.level} onChange={(event) => setActiveFilters({ ...filters, level: event.target.value })}>
              <option value="">{t('cpa_refill.level_placeholder')}</option>
              {['info', 'warning', 'error'].map((level) => <option key={level} value={level}>{localizedValue('level', level, t)}</option>)}
            </select>}
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
              <tbody>{items.map((item, index) => <tr key={stringValue(item.id) + index}>{columns[activeTab].map((column) => <td key={column} title={displayValue(column, item[column], t)}>{displayValue(column, item[column], t)}</td>)}{(activeTab === 'accounts' || activeTab === 'orders') && <td><button type="button" className={styles.detailButton} onClick={() => void openDetail(item)}>{t('cpa_refill.view_detail')}</button></td>}</tr>)}</tbody>
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
              <label>{t('cpa_refill.desired_mode')}<select value={policy.desired_mode} onChange={(event) => setPolicy({ ...policy, desired_mode: event.target.value })}><option value="observe">{t('cpa_refill.values.mode.observe')}</option><option value="active">{t('cpa_refill.values.mode.active')}</option><option value="paused">{t('cpa_refill.values.mode.paused')}</option></select></label>
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

      {(selectedDetail || detailLoading) && <aside className={styles.detailPanel} aria-label={t('cpa_refill.account_detail')}>
        <div className={styles.detailHeader}><div><span>{activeTab === 'orders' ? t('cpa_refill.order_detail') : t('cpa_refill.account_detail')}</span><strong>#{stringValue(selectedDetail?.id)}</strong></div><button type="button" onClick={() => { detailRequestIDRef.current += 1; setSelectedDetail(null); setSelectedEvents([]); setSelectedAccountID(0); setEventHasMore(false); }}>×</button></div>
        {detailLoading ? <div className={styles.center}><LoadingSpinner /></div> : selectedDetail && <><dl>{Object.entries(selectedDetail).filter(([key]) => key !== 'items').map(([key, value]) => <div key={key}><dt>{t(`cpa_refill.fields.${key}`, { defaultValue: key })}</dt><dd>{displayValue(key, value, t)}</dd></div>)}</dl>{Array.isArray(selectedDetail.items) && <div className={styles.detailEvents}><h3>{t('cpa_refill.delivered_items')}</h3>{selectedDetail.items.map((item, index) => <pre key={index}>{JSON.stringify(item, null, 2)}</pre>)}</div>}{selectedEvents.length > 0 && <div className={styles.detailEvents}><h3>{t('cpa_refill.account_events')}</h3>{selectedEvents.map((event, index) => <article key={index}><strong>{stringValue(event.event_type)}</strong><span>{displayValue('created_at', event.created_at, t)}</span><small>{localizedValue('level', event.level, t)}</small></article>)}{eventHasMore && <Button variant="secondary" size="sm" loading={eventLoading} onClick={() => void loadMoreAccountEvents()}>{t('cpa_refill.load_more_events')}</Button>}</div>}</>}
      </aside>}
    </div>
  );
}

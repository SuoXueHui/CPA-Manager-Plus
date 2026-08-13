import type { AuthFileItem } from '@/types';
import { normalizePlanType, resolveAuthProvider, resolveCodexPlanType } from '@/utils/quota';

export type AccountPlanTone = 'free' | 'paid';

export type AccountPlanPresentation = {
  planType: string;
  labelKey: string;
  defaultLabel: string;
  tone: AccountPlanTone;
};

const CODEX_PLAN_PRESENTATIONS: Record<string, Omit<AccountPlanPresentation, 'planType'>> = {
  free: {
    labelKey: 'codex_quota.plan_free',
    defaultLabel: 'Free',
    tone: 'free',
  },
  plus: {
    labelKey: 'codex_quota.plan_plus',
    defaultLabel: 'Plus',
    tone: 'paid',
  },
  team: {
    labelKey: 'codex_quota.plan_team',
    defaultLabel: 'Team',
    tone: 'paid',
  },
  pro: {
    labelKey: 'codex_quota.plan_pro',
    defaultLabel: 'Pro 20x',
    tone: 'paid',
  },
  prolite: {
    labelKey: 'codex_quota.plan_prolite',
    defaultLabel: 'Pro 5x',
    tone: 'paid',
  },
};

const XAI_PLAN_PRESENTATIONS: Record<string, Omit<AccountPlanPresentation, 'planType'>> = {
  free: {
    labelKey: 'xai_quota.plan_free',
    defaultLabel: 'Free',
    tone: 'free',
  },
  supergrok: {
    labelKey: 'xai_quota.plan_supergrok',
    defaultLabel: 'SuperGrok',
    tone: 'paid',
  },
  supergrok_heavy: {
    labelKey: 'xai_quota.plan_supergrok_heavy',
    defaultLabel: 'SuperGrok Heavy',
    tone: 'paid',
  },
};

// 将后端归一化字段和兼容别名收敛成稳定的 xAI 套餐键。
const normalizeXAIPlanType = (value: unknown): string | null => {
  const normalized = normalizePlanType(value);
  if (!normalized) return null;
  const compact = normalized.replace(/[\s-]+/g, '_').replace(/_+/g, '_');
  return compact === 'supergrokheavy' ? 'supergrok_heavy' : compact;
};

const normalizeCodexPresentationKey = (value: string): string => {
  const normalized = normalizePlanType(value) ?? value;
  if (normalized === 'pro-lite' || normalized === 'pro_lite') return 'prolite';
  return normalized;
};

// 套餐展示只读取明确身份字段，不使用额度金额、健康状态或启停状态进行推断。
export function getAccountPlanPresentation(file: AuthFileItem): AccountPlanPresentation | null {
  const provider = resolveAuthProvider(file);
  if (provider === 'xai') {
    const planType = normalizeXAIPlanType(file.xai_plan_type ?? file.xaiPlanType);
    if (!planType) return null;
    const presentation = XAI_PLAN_PRESENTATIONS[planType];
    return presentation ? { planType, ...presentation } : null;
  }

  if (provider !== 'codex') return null;
  const rawPlanType = resolveCodexPlanType(file);
  if (!rawPlanType) return null;
  const planType = normalizeCodexPresentationKey(rawPlanType);
  const presentation = CODEX_PLAN_PRESENTATIONS[planType];
  return presentation ? { planType, ...presentation } : null;
}

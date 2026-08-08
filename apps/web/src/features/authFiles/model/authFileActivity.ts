import type { AuthFileItem } from '@/types';
import { parseTimestampMs } from '@/utils/timestamp';

export type AuthFileActivitySortMode =
  | 'imported-desc'
  | 'imported-asc'
  | 'last-request-desc'
  | 'last-request-asc';

export interface AuthFileActivityInput {
  authFileName: string;
  authIndex?: string;
  createdAtMs?: number;
  modifiedAtMs?: number;
}

export interface AuthFileActivityItem {
  identityKey: string;
  authFileName: string;
  authIndex?: string;
  importedAtMs?: number;
  lastRequestAtMs?: number;
}

export interface AuthFileActivitySyncRequest {
  files: AuthFileActivityInput[];
  observedAtMs?: number;
}

export interface AuthFileActivitySyncResponse {
  items: AuthFileActivityItem[];
}

const readAuthIndex = (file: AuthFileItem): string => {
  const raw = file['auth_index'] ?? file.authIndex;
  return raw === null || raw === undefined ? '' : String(raw).trim();
};

const normalizeUnixTimestampMs = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return normalizeUnixTimestampMs(numeric);
    const parsed = parseTimestampMs(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
  }
  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;

  const absolute = Math.abs(value);
  if (absolute < 1e11) return Math.round(value * 1000);
  if (absolute < 1e14) return Math.round(value);
  if (absolute < 1e17) return Math.round(value / 1000);
  return Math.round(value / 1_000_000);
};

const normalizeExplicitTimestampMs = (value: unknown): number | undefined => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : undefined;
};

export const getAuthFileActivityIdentityKey = (file: AuthFileItem): string => {
  const authIndex = readAuthIndex(file);
  if (authIndex) return `auth-index:${authIndex}`;
  const fileName = file.name.trim();
  return fileName ? `file:${fileName}` : '';
};

export const toAuthFileActivityInput = (file: AuthFileItem): AuthFileActivityInput => {
  const authIndex = readAuthIndex(file);
  const createdAtMs = normalizeUnixTimestampMs(file.created_at ?? file.createdAt);
  const modifiedAtMs = normalizeUnixTimestampMs(file.modtime ?? file.updated_at ?? file.modified);
  return {
    authFileName: file.name.trim(),
    ...(authIndex ? { authIndex } : {}),
    ...(createdAtMs ? { createdAtMs } : {}),
    ...(modifiedAtMs ? { modifiedAtMs } : {}),
  };
};

export const mergeAuthFileActivity = (
  files: AuthFileItem[],
  activity: AuthFileActivityItem[]
): AuthFileItem[] => {
  const byIdentity = new Map(activity.map((item) => [item.identityKey, item]));
  return files.map((file) => {
    const identityKey = getAuthFileActivityIdentityKey(file);
    const item = byIdentity.get(identityKey);
    const fallback = toAuthFileActivityInput(file);
    const importedAtMs =
      normalizeExplicitTimestampMs(item?.importedAtMs) ??
      normalizeExplicitTimestampMs(file.importedAtMs) ??
      fallback.createdAtMs ??
      fallback.modifiedAtMs;
    const lastRequestAtMs =
      normalizeExplicitTimestampMs(item?.lastRequestAtMs) ??
      normalizeExplicitTimestampMs(file.lastRequestAtMs);
    return {
      ...file,
      ...(importedAtMs ? { importedAtMs } : {}),
      ...(lastRequestAtMs ? { lastRequestAtMs } : {}),
    };
  });
};

const compareNames = (left: AuthFileItem, right: AuthFileItem): number =>
  left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });

const compareKnownTimestamp = (
  left: AuthFileItem,
  right: AuthFileItem,
  read: (file: AuthFileItem) => number | undefined,
  direction: 'asc' | 'desc',
  missing: 'first' | 'last'
): number => {
  const leftValue = read(left);
  const rightValue = read(right);
  const leftKnown = typeof leftValue === 'number' && Number.isFinite(leftValue) && leftValue > 0;
  const rightKnown =
    typeof rightValue === 'number' && Number.isFinite(rightValue) && rightValue > 0;
  if (leftKnown !== rightKnown) {
    if (!leftKnown) return missing === 'first' ? -1 : 1;
    return missing === 'first' ? 1 : -1;
  }
  if (leftKnown && rightKnown && leftValue !== rightValue) {
    return direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
  }
  return compareNames(left, right);
};

export const sortAuthFilesByActivity = (
  files: AuthFileItem[],
  mode: AuthFileActivitySortMode
): AuthFileItem[] => {
  const copy = [...files];
  if (mode === 'imported-desc') {
    return copy.sort((left, right) =>
      compareKnownTimestamp(left, right, (file) => file.importedAtMs, 'desc', 'last')
    );
  }
  if (mode === 'imported-asc') {
    return copy.sort((left, right) =>
      compareKnownTimestamp(left, right, (file) => file.importedAtMs, 'asc', 'last')
    );
  }
  if (mode === 'last-request-desc') {
    return copy.sort((left, right) =>
      compareKnownTimestamp(left, right, (file) => file.lastRequestAtMs, 'desc', 'last')
    );
  }
  return copy.sort((left, right) =>
    compareKnownTimestamp(left, right, (file) => file.lastRequestAtMs, 'asc', 'first')
  );
};

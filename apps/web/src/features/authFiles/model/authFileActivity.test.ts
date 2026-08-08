import { describe, expect, it } from 'vitest';
import type { AuthFileItem } from '@/types';
import {
  getAuthFileActivityIdentityKey,
  mergeAuthFileActivity,
  sortAuthFilesByActivity,
  toAuthFileActivityInput,
} from './authFileActivity';

describe('auth file activity metadata', () => {
  it('prefers auth index identities and normalizes CPA timestamps', () => {
    const file: AuthFileItem = {
      name: 'codex-a.json',
      auth_index: 'auth-a',
      created_at: '1970-01-01T00:00:01Z',
      modtime: 1_700_000_000,
    };

    expect(getAuthFileActivityIdentityKey(file)).toBe('auth-index:auth-a');
    expect(toAuthFileActivityInput(file)).toEqual({
      authFileName: 'codex-a.json',
      authIndex: 'auth-a',
      createdAtMs: 1_000,
      modifiedAtMs: 1_700_000_000_000,
    });
  });

  it('merges durable server activity without mutating source files', () => {
    const files: AuthFileItem[] = [{ name: 'a.json', auth_index: 'auth-a', created_at: 1_000 }];
    const merged = mergeAuthFileActivity(files, [
      {
        identityKey: 'auth-index:auth-a',
        authFileName: 'a.json',
        authIndex: 'auth-a',
        importedAtMs: 2_000,
        lastRequestAtMs: 3_000,
      },
    ]);

    expect(merged[0]).not.toBe(files[0]);
    expect(merged[0]).toMatchObject({ importedAtMs: 2_000, lastRequestAtMs: 3_000 });
    expect(files[0].importedAtMs).toBeUndefined();
  });
});

describe('auth file activity sorting', () => {
  const files: AuthFileItem[] = [
    { name: 'a.json', importedAtMs: 1_000, lastRequestAtMs: 5_000 },
    { name: 'b.json', importedAtMs: 3_000, lastRequestAtMs: 2_000 },
    { name: 'c.json' },
  ];

  it('sorts import time newest and oldest with unknown values last', () => {
    expect(sortAuthFilesByActivity(files, 'imported-desc').map((file) => file.name)).toEqual([
      'b.json',
      'a.json',
      'c.json',
    ]);
    expect(sortAuthFilesByActivity(files, 'imported-asc').map((file) => file.name)).toEqual([
      'a.json',
      'b.json',
      'c.json',
    ]);
  });

  it('sorts last request newest with never-used last and longest-unused with never-used first', () => {
    expect(sortAuthFilesByActivity(files, 'last-request-desc').map((file) => file.name)).toEqual([
      'a.json',
      'b.json',
      'c.json',
    ]);
    expect(sortAuthFilesByActivity(files, 'last-request-asc').map((file) => file.name)).toEqual([
      'c.json',
      'b.json',
      'a.json',
    ]);
  });
});

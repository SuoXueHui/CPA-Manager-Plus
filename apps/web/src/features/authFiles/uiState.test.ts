import { describe, expect, it } from 'vitest';
import { normalizeAuthFilesSortMode, normalizeAuthFilesViewMode } from './uiState';

describe('authFiles uiState', () => {
  it('normalizes persisted sort modes', () => {
    expect(normalizeAuthFilesSortMode('default')).toBe('default');
    expect(normalizeAuthFilesSortMode('priority')).toBe('priority-desc');
    expect(normalizeAuthFilesSortMode('imported-desc')).toBe('imported-desc');
    expect(normalizeAuthFilesSortMode('imported-asc')).toBe('imported-asc');
    expect(normalizeAuthFilesSortMode('last-request-desc')).toBe('last-request-desc');
    expect(normalizeAuthFilesSortMode('last-request-asc')).toBe('last-request-asc');
    expect(normalizeAuthFilesSortMode('bad')).toBeNull();
  });

  it('normalizes persisted view modes', () => {
    expect(normalizeAuthFilesViewMode('diagram')).toBe('diagram');
    expect(normalizeAuthFilesViewMode('list')).toBe('list');
    expect(normalizeAuthFilesViewMode('bad')).toBeNull();
  });
});

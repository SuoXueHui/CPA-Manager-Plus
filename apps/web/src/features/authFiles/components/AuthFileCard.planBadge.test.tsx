import { act } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { AuthFileItem } from '@/types';
import { AuthFileCard } from './AuthFileCard';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      typeof options?.defaultValue === 'string' ? options.defaultValue : key,
  }),
}));

const renderCard = (file: AuthFileItem): ReactTestRenderer => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <AuthFileCard
        file={file}
        compact
        selected={false}
        resolvedTheme="dark"
        disableControls={false}
        deleting={null}
        statusUpdating={{}}
        statusBarCache={new Map()}
        onShowModels={vi.fn()}
        onDownload={vi.fn()}
        onOpenPrefixProxyEditor={vi.fn()}
        onDelete={vi.fn()}
        onToggleStatus={vi.fn()}
        onToggleSelect={vi.fn()}
      />
    );
  });
  return renderer;
};

const findPlanBadges = (renderer: ReactTestRenderer): ReactTestInstance[] =>
  renderer.root.findAll(
    (node) => node.type === 'span' && typeof node.props['data-account-plan'] === 'string'
  );

const textContent = (node: ReactTestInstance): string =>
  node.children
    .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('');

describe('AuthFileCard account plan badge', () => {
  it('shows the explicit xAI SuperGrok Heavy plan independently from disabled health', () => {
    const renderer = renderCard({
      name: 'heavy-xai.json',
      type: 'xai',
      disabled: true,
      statusMessage: 'Grok Build usage balance exhausted',
      xai_plan_type: 'supergrok_heavy',
      monthly_limit: 0,
      monthly_usage: 0,
    });

    const badges = findPlanBadges(renderer);
    expect(badges).toHaveLength(1);
    expect(badges[0].props['data-account-plan']).toBe('supergrok_heavy');
    expect(textContent(badges[0])).toBe('SuperGrok Heavy');
  });

  it('shows explicit xAI Free evidence', () => {
    const badges = findPlanBadges(
      renderCard({ name: 'free-xai.json', type: 'xai', xai_plan_type: 'free' })
    );

    expect(badges).toHaveLength(1);
    expect(textContent(badges[0])).toBe('Free');
  });

  it('does not infer xAI Free from a zero monthly quota', () => {
    const badges = findPlanBadges(
      renderCard({
        name: 'unknown-xai.json',
        type: 'xai',
        monthly_limit: 0,
        monthly_usage: 0,
      })
    );

    expect(badges).toHaveLength(0);
  });

  it('shows the existing Codex plan_type without waiting for quota loading', () => {
    const badges = findPlanBadges(
      renderCard({ name: 'plus-codex.json', type: 'codex', plan_type: 'plus' })
    );

    expect(badges).toHaveLength(1);
    expect(badges[0].props['data-account-plan']).toBe('plus');
    expect(textContent(badges[0])).toBe('Plus');
  });

  it('keeps the existing Codex id_token plan alias compatible', () => {
    const badges = findPlanBadges(
      renderCard({ name: 'team-codex.json', type: 'codex', id_token: { plan_type: 'team' } })
    );

    expect(badges).toHaveLength(1);
    expect(badges[0].props['data-account-plan']).toBe('team');
    expect(textContent(badges[0])).toBe('Team');
  });

  it('omits the badge when no supported plan evidence exists', () => {
    expect(findPlanBadges(renderCard({ name: 'unknown.json', type: 'codex' }))).toHaveLength(0);
    expect(
      findPlanBadges(
        renderCard({ name: 'unexpected-codex.json', type: 'codex', plan_type: 'unexpected' })
      )
    ).toHaveLength(0);
    expect(
      findPlanBadges(
        renderCard({ name: 'unexpected-xai.json', type: 'xai', xai_plan_type: 'unexpected' })
      )
    ).toHaveLength(0);
  });
});

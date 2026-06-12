// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingSyncSummary } from '@/hooks/usePendingSyncCount';
import { initTestI18n, tEs } from '@/test/i18n';
import PendingSyncIndicator from './PendingSyncIndicator';

let mockSummary: PendingSyncSummary = {
  total: 0,
  errorCount: 0,
  byEntity: [],
  hasAny: false,
};

vi.mock('@/hooks/usePendingSyncCount', () => ({
  default: () => mockSummary,
}));

function setSummary(partial: Partial<PendingSyncSummary>) {
  mockSummary = { ...mockSummary, ...partial };
}

// Asserts contra catálogo (estrategia tEs, F1.7). Las keys plurales se
// resuelven acá con el sufijo explícito + replace del placeholder — el
// componente interpola vía i18next, el test contra el JSON importado.
function tEsCount(path: string, count: number): string {
  return tEs(path).replace('{{count}}', String(count));
}

describe('PendingSyncIndicator', () => {
  beforeEach(async () => {
    // initTestI18n ANTES de fake timers: changeLanguage es async y no debe
    // quedar atrapado en timers mockeados.
    await initTestI18n();
    vi.useFakeTimers();
    setSummary({ total: 0, errorCount: 0, byEntity: [], hasAny: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sin pending → no renderiza nada', () => {
    const { container } = render(<PendingSyncIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('pending: arranca expanded con label "N pendientes" y bg amber', () => {
    setSummary({
      total: 3,
      errorCount: 0,
      byEntity: [{ entity: 'notas', count: 3, hasError: false }],
      hasAny: true,
    });
    const { container } = render(<PendingSyncIndicator />);
    const pendingLabel = tEsCount('sync.pending_other', 3);
    const trigger = container.querySelector(`button[aria-label*="${pendingLabel}"]`);
    expect(trigger).not.toBeNull();
    expect(trigger?.className).toContain('max-w-[220px]');
    expect(trigger?.className).toContain('bg-amber-500/15');

    const label = trigger?.querySelector('span:not([aria-hidden])');
    expect(label?.textContent).toBe(pendingLabel);

    const dot = trigger?.querySelector('span[aria-hidden]');
    expect(dot?.className).toContain('bg-amber-500');
  });

  it('tras 3s colapsa: label oculto, dot visible', () => {
    setSummary({
      total: 1,
      errorCount: 0,
      byEntity: [{ entity: 'tarea', count: 1, hasError: false }],
      hasAny: true,
    });
    const { container } = render(<PendingSyncIndicator />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const trigger = container.querySelector(
      `button[aria-label*="${tEsCount('sync.pending_one', 1)}"]`,
    );
    expect(trigger?.className).toContain('max-w-11');

    const label = trigger?.querySelector('span:not([aria-hidden])');
    expect(label?.className).toContain('opacity-0');

    const dot = trigger?.querySelector('span[aria-hidden]');
    expect(dot?.className).toContain('opacity-100');
  });

  it('error: bg destructive en chip y dot, retry habilitado', () => {
    setSummary({
      total: 1,
      errorCount: 1,
      byEntity: [{ entity: 'nota', count: 1, hasError: true }],
      hasAny: true,
    });
    const { container } = render(<PendingSyncIndicator />);
    const trigger = container.querySelector(
      `button[aria-label*="${tEsCount('sync.unsaved_one', 1)}"]`,
    );
    expect(trigger).not.toBeNull();
    expect(trigger?.className).toContain('bg-destructive/15');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const dot = trigger?.querySelector('span[aria-hidden]');
    expect(dot?.className).toContain('bg-destructive');
  });

  it('aria-label dinámico según severity', () => {
    setSummary({
      total: 5,
      errorCount: 2,
      byEntity: [{ entity: 'notas', count: 5, hasError: true }],
      hasAny: true,
    });
    const { container } = render(<PendingSyncIndicator />);
    const trigger = container.querySelector('button');
    const expectedAria = tEs('sync.openDetail').replace(
      '{{label}}',
      tEsCount('sync.unsaved_other', 2),
    );
    expect(trigger?.getAttribute('aria-label')).toBe(expectedAria);
  });
});

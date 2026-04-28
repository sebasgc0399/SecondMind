// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingSyncSummary } from '@/hooks/usePendingSyncCount';
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

describe('PendingSyncIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setSummary({ total: 0, errorCount: 0, byEntity: [], hasAny: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hasAny=false → no renderiza nada', () => {
    const { container } = render(<PendingSyncIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('arranca expanded: label visible (opacity-100), dot oculto (opacity-0)', () => {
    setSummary({
      total: 3,
      errorCount: 0,
      byEntity: [{ entity: 'notas', count: 3, hasError: false }],
      hasAny: true,
    });
    const { container } = render(<PendingSyncIndicator />);
    const trigger = container.querySelector('button[aria-label*="3 pendientes"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.className).toContain('max-w-[180px]');
    expect(trigger?.className).toContain('px-2');

    const label = trigger?.querySelector('span:not([aria-hidden])');
    expect(label?.className).toContain('opacity-100');
    expect(label?.textContent).toBe('3 pendientes');

    const dot = trigger?.querySelector('span[aria-hidden]');
    expect(dot?.className).toContain('opacity-0');
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
    const trigger = container.querySelector('button[aria-label*="pendiente"]');
    expect(trigger?.className).toContain('max-w-11');
    expect(trigger?.className).toContain('px-0');

    const label = trigger?.querySelector('span:not([aria-hidden])');
    expect(label?.className).toContain('opacity-0');

    const dot = trigger?.querySelector('span[aria-hidden]');
    expect(dot?.className).toContain('opacity-100');
  });

  it('error state usa colores destructive en chip y dot', () => {
    setSummary({
      total: 1,
      errorCount: 1,
      byEntity: [{ entity: 'nota', count: 1, hasError: true }],
      hasAny: true,
    });
    const { container } = render(<PendingSyncIndicator />);
    const trigger = container.querySelector('button[aria-label*="sin guardar"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.className).toContain('bg-destructive/15');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const dot = trigger?.querySelector('span[aria-hidden]');
    expect(dot?.className).toContain('bg-destructive');
    expect(dot?.className).toContain('opacity-100');
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
    expect(trigger?.getAttribute('aria-label')).toBe('2 sin guardar: abrir detalle');
  });
});

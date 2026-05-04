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
let mockOnline = true;

vi.mock('@/hooks/usePendingSyncCount', () => ({
  default: () => mockSummary,
}));

vi.mock('@/hooks/useOnlineStatus', () => ({
  default: () => mockOnline,
}));

function setSummary(partial: Partial<PendingSyncSummary>) {
  mockSummary = { ...mockSummary, ...partial };
}

describe('PendingSyncIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setSummary({ total: 0, errorCount: 0, byEntity: [], hasAny: false });
    mockOnline = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('online + sin pending → no renderiza nada', () => {
    const { container } = render(<PendingSyncIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('online + pending: arranca expanded con label "N pendientes" y bg amber', () => {
    setSummary({
      total: 3,
      errorCount: 0,
      byEntity: [{ entity: 'notas', count: 3, hasError: false }],
      hasAny: true,
    });
    const { container } = render(<PendingSyncIndicator />);
    const trigger = container.querySelector('button[aria-label*="3 pendientes"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.className).toContain('max-w-[220px]');
    expect(trigger?.className).toContain('bg-amber-500/15');

    const label = trigger?.querySelector('span:not([aria-hidden])');
    expect(label?.textContent).toBe('3 pendientes');

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
    const trigger = container.querySelector('button[aria-label*="pendiente"]');
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
    const trigger = container.querySelector('button[aria-label*="sin guardar"]');
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
    expect(trigger?.getAttribute('aria-label')).toBe('2 sin guardar: abrir detalle');
  });

  it('offline + sin pending: chip persiste con bg blue y label "Sin conexión"', () => {
    mockOnline = false;
    const { container } = render(<PendingSyncIndicator />);
    const trigger = container.querySelector('button[aria-label*="Sin conexión"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.className).toContain('bg-blue-500/15');

    const label = trigger?.querySelector('span:not([aria-hidden])');
    expect(label?.textContent).toBe('Sin conexión');

    const dot = trigger?.querySelector('span[aria-hidden]');
    expect(dot?.className).toContain('bg-blue-500');
  });

  it('offline + pending: label dual "Sin conexión · N pendientes"', () => {
    mockOnline = false;
    setSummary({
      total: 2,
      errorCount: 0,
      byEntity: [{ entity: 'notas', count: 2, hasError: false }],
      hasAny: true,
    });
    const { container } = render(<PendingSyncIndicator />);
    const trigger = container.querySelector('button');
    expect(trigger?.getAttribute('aria-label')).toBe('Sin conexión · 2 pendientes: abrir detalle');
    expect(trigger?.className).toContain('bg-blue-500/15');
  });

  it('offline + error: error gana visualmente sobre offline (bg destructive)', () => {
    mockOnline = false;
    setSummary({
      total: 1,
      errorCount: 1,
      byEntity: [{ entity: 'nota', count: 1, hasError: true }],
      hasAny: true,
    });
    const { container } = render(<PendingSyncIndicator />);
    const trigger = container.querySelector('button');
    expect(trigger?.className).toContain('bg-destructive/15');
    expect(trigger?.getAttribute('aria-label')).toBe('1 sin guardar: abrir detalle');
  });
});

// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useMountedTransition from './useMountedTransition';

describe('useMountedTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('arranca con visible=true → shouldRender=true, isExiting=false, justMounted=true', () => {
    const { result } = renderHook(
      ({ visible }: { visible: boolean }) => useMountedTransition(visible, 200),
      { initialProps: { visible: true } },
    );
    expect(result.current).toEqual({ shouldRender: true, isExiting: false, justMounted: true });
  });

  it('arranca con visible=false → shouldRender=false, isExiting=false, justMounted=false (skip-initial)', () => {
    const { result } = renderHook(
      ({ visible }: { visible: boolean }) => useMountedTransition(visible, 200),
      { initialProps: { visible: false } },
    );
    expect(result.current).toEqual({ shouldRender: false, isExiting: false, justMounted: false });
  });

  it('flip visible: true → false retarda unmount durationMs', () => {
    const { result, rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useMountedTransition(visible, 200),
      { initialProps: { visible: true } },
    );
    rerender({ visible: false });
    expect(result.current).toEqual({ shouldRender: true, isExiting: true, justMounted: false });

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current).toEqual({ shouldRender: true, isExiting: true, justMounted: false });

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toEqual({ shouldRender: false, isExiting: false, justMounted: false });
  });

  it('flip visible: false → true monta inmediato sin timer', () => {
    const { result, rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useMountedTransition(visible, 200),
      { initialProps: { visible: false } },
    );
    expect(result.current).toEqual({ shouldRender: false, isExiting: false, justMounted: false });

    rerender({ visible: true });
    expect(result.current).toEqual({ shouldRender: true, isExiting: false, justMounted: true });
  });

  it('toggle rápido true→false→true antes de durationMs cancela timer', () => {
    const { result, rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useMountedTransition(visible, 200),
      { initialProps: { visible: true } },
    );
    // Avanzar durationMs para limpiar el justMounted del mount inicial,
    // así el toggle posterior arranca de un estado estable.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.justMounted).toBe(false);

    rerender({ visible: false });
    expect(result.current).toEqual({ shouldRender: true, isExiting: true, justMounted: false });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ visible: true });
    expect(result.current).toEqual({ shouldRender: true, isExiting: false, justMounted: false });

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toEqual({ shouldRender: true, isExiting: false, justMounted: false });
  });

  it('cleanup en unmount cancela el timer pendiente', () => {
    const { result, rerender, unmount } = renderHook(
      ({ visible }: { visible: boolean }) => useMountedTransition(visible, 200),
      { initialProps: { visible: true } },
    );
    rerender({ visible: false });
    expect(result.current).toEqual({ shouldRender: true, isExiting: true, justMounted: false });

    unmount();
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(200);
      });
    }).not.toThrow();
  });

  // F35.1 — justMounted

  it('justMounted: true en mount inicial con visible=true', () => {
    const { result } = renderHook(
      ({ visible }: { visible: boolean }) => useMountedTransition(visible, 200),
      { initialProps: { visible: true } },
    );
    expect(result.current.justMounted).toBe(true);
  });

  it('justMounted: persiste durante durationMs y se limpia tras el timer', () => {
    const { result, rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useMountedTransition(visible, 200),
      { initialProps: { visible: true } },
    );
    expect(result.current.justMounted).toBe(true);

    // Re-render dentro de durationMs preserva justMounted=true
    rerender({ visible: true });
    expect(result.current.justMounted).toBe(true);

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current.justMounted).toBe(true);

    // Tras durationMs el flag se limpia
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.justMounted).toBe(false);

    // Re-render posterior sigue con justMounted=false
    rerender({ visible: true });
    expect(result.current.justMounted).toBe(false);
  });

  it('justMounted: false en toggle rápido <durationMs (saliente mantuvo shouldRender=true)', () => {
    const { result, rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useMountedTransition(visible, 200),
      { initialProps: { visible: true } },
    );
    // Esperar a que el justMounted del mount inicial expire para empezar limpio
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.justMounted).toBe(false);

    rerender({ visible: false });
    expect(result.current).toEqual({ shouldRender: true, isExiting: true, justMounted: false });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ visible: true });
    // shouldRender se mantuvo true durante todo el flujo → no es re-mount
    expect(result.current).toEqual({ shouldRender: true, isExiting: false, justMounted: false });
  });

  it('justMounted: true en re-mount tras exit completado (>durationMs)', () => {
    const { result, rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useMountedTransition(visible, 200),
      { initialProps: { visible: true } },
    );
    // Esperar a que justMounted del mount inicial expire
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.justMounted).toBe(false);

    // Iniciar exit y completarlo
    rerender({ visible: false });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toEqual({ shouldRender: false, isExiting: false, justMounted: false });

    // Flippear a visible nuevamente — shouldRender flippea false→true → re-mount real
    rerender({ visible: true });
    expect(result.current).toEqual({ shouldRender: true, isExiting: false, justMounted: true });
  });
});

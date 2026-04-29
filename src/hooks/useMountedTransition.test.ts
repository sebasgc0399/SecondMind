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

  it('arranca con visible=true → shouldRender=true, isExiting=false', () => {
    const { result } = renderHook(
      ({ visible }: { visible: boolean }) => useMountedTransition(visible, 200),
      { initialProps: { visible: true } },
    );
    expect(result.current).toEqual({ shouldRender: true, isExiting: false });
  });

  it('arranca con visible=false → shouldRender=false, isExiting=false (skip-initial)', () => {
    const { result } = renderHook(
      ({ visible }: { visible: boolean }) => useMountedTransition(visible, 200),
      { initialProps: { visible: false } },
    );
    expect(result.current).toEqual({ shouldRender: false, isExiting: false });
  });

  it('flip visible: true → false retarda unmount durationMs', () => {
    const { result, rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useMountedTransition(visible, 200),
      { initialProps: { visible: true } },
    );
    rerender({ visible: false });
    expect(result.current).toEqual({ shouldRender: true, isExiting: true });

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current).toEqual({ shouldRender: true, isExiting: true });

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toEqual({ shouldRender: false, isExiting: false });
  });

  it('flip visible: false → true monta inmediato sin timer', () => {
    const { result, rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useMountedTransition(visible, 200),
      { initialProps: { visible: false } },
    );
    expect(result.current).toEqual({ shouldRender: false, isExiting: false });

    rerender({ visible: true });
    expect(result.current).toEqual({ shouldRender: true, isExiting: false });
  });

  it('toggle rápido true→false→true antes de durationMs cancela timer', () => {
    const { result, rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useMountedTransition(visible, 200),
      { initialProps: { visible: true } },
    );
    rerender({ visible: false });
    expect(result.current).toEqual({ shouldRender: true, isExiting: true });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ visible: true });
    expect(result.current).toEqual({ shouldRender: true, isExiting: false });

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toEqual({ shouldRender: true, isExiting: false });
  });

  it('cleanup en unmount cancela el timer pendiente', () => {
    const { result, rerender, unmount } = renderHook(
      ({ visible }: { visible: boolean }) => useMountedTransition(visible, 200),
      { initialProps: { visible: true } },
    );
    rerender({ visible: false });
    expect(result.current).toEqual({ shouldRender: true, isExiting: true });

    unmount();
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(200);
      });
    }).not.toThrow();
  });
});

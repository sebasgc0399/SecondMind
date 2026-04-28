// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useExpandThenCollapse from './useExpandThenCollapse';

describe('useExpandThenCollapse', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('arranca expanded=true', () => {
    const { result } = renderHook(() => useExpandThenCollapse('initial', 3000));
    expect(result.current).toBe(true);
  });

  it('colapsa a expanded=false tras durationMs', () => {
    const { result } = renderHook(() => useExpandThenCollapse('initial', 3000));
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(false);
  });

  it('no colapsa antes de durationMs', () => {
    const { result } = renderHook(() => useExpandThenCollapse('initial', 3000));
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(result.current).toBe(true);
  });

  it('re-expande al cambiar triggerKey y resetea timer', () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useExpandThenCollapse(key, 3000),
      { initialProps: { key: 'normal' } },
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(false);

    rerender({ key: 'error' });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });

  it('mismo triggerKey en rerender NO resetea timer en vuelo', () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useExpandThenCollapse(key, 3000),
      { initialProps: { key: 'normal' } },
    );
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    rerender({ key: 'normal' });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current).toBe(false);
  });

  it('cleanup en unmount cancela el timer pendiente', () => {
    const { result, unmount } = renderHook(() => useExpandThenCollapse('initial', 3000));
    expect(result.current).toBe(true);
    unmount();
    // Si el cleanup no funcionara, el setTimeout seguiría vivo y dispararía
    // setExpanded en un componente unmounted (warning de React). Avanzar
    // timers post-unmount valida que no haya warning.
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    }).not.toThrow();
  });
});

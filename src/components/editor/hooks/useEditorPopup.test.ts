// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SuggestionProps } from '@tiptap/suggestion';
import { useEditorPopup, type PopupListener } from './useEditorPopup';

interface TestItem {
  id: string;
  label: string;
}

const ITEMS: TestItem[] = [
  { id: '1', label: 'Foo' },
  { id: '2', label: 'Bar' },
  { id: '3', label: 'Baz' },
];

function mockSuggestionProps(query: string, items: TestItem[] = ITEMS): SuggestionProps<TestItem> {
  return {
    query,
    items,
    text: query,
    range: { from: 0, to: 0 },
    command: vi.fn(),
    editor: {} as never,
    decorationNode: null,
    clientRect: () =>
      ({
        top: 100,
        left: 100,
        bottom: 120,
        right: 200,
        width: 100,
        height: 20,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect,
  };
}

function keydownProps(key: string) {
  return { event: new KeyboardEvent('keydown', { key }) } as Parameters<
    PopupListener<TestItem>['onKeyDown']
  >[0];
}

describe('useEditorPopup', () => {
  describe('L1 — listener lifecycle', () => {
    it('registers listener on mount and clears it on unmount', () => {
      const setListener = vi.fn();
      const { unmount } = renderHook(() =>
        useEditorPopup<TestItem>({
          setListener,
          queryItems: () => ITEMS,
          executeCommand: vi.fn(),
        }),
      );

      expect(setListener).toHaveBeenCalledTimes(1);
      expect(setListener.mock.calls[0]![0]).toMatchObject({
        onStart: expect.any(Function),
        onUpdate: expect.any(Function),
        onKeyDown: expect.any(Function),
        onExit: expect.any(Function),
      });

      unmount();
      expect(setListener).toHaveBeenCalledTimes(2);
      expect(setListener.mock.calls[1]![0]).toBeNull();
    });

    it('does not leak listener between separate hook instances', () => {
      const setListener = vi.fn();
      const params = {
        setListener,
        queryItems: () => ITEMS,
        executeCommand: vi.fn(),
      };

      renderHook(() => useEditorPopup<TestItem>(params)).unmount();
      renderHook(() => useEditorPopup<TestItem>(params)).unmount();

      expect(setListener).toHaveBeenCalledTimes(4);
      expect(setListener.mock.calls[1]![0]).toBeNull();
      expect(setListener.mock.calls[3]![0]).toBeNull();
    });
  });

  describe('L2 — filtering', () => {
    it('invokes queryItems with the suggestion query on onStart', () => {
      const setListener = vi.fn();
      const queryItems = vi.fn((q: string) =>
        ITEMS.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())),
      );
      const { result } = renderHook(() =>
        useEditorPopup<TestItem>({
          setListener,
          queryItems,
          executeCommand: vi.fn(),
        }),
      );

      const listener = setListener.mock.calls[0]![0] as PopupListener<TestItem>;
      act(() => listener.onStart(mockSuggestionProps('Ba')));

      expect(queryItems).toHaveBeenCalledWith('Ba');
      expect(result.current.isOpen).toBe(true);
      expect(result.current.items.map((i) => i.label)).toEqual(['Bar', 'Baz']);
      expect(result.current.query).toBe('Ba');
    });

    it('preserves selectedIndex on onUpdate when still within range', () => {
      const setListener = vi.fn();
      const queryItems = vi.fn(() => ITEMS);
      const { result } = renderHook(() =>
        useEditorPopup<TestItem>({
          setListener,
          queryItems,
          executeCommand: vi.fn(),
        }),
      );

      const listener = setListener.mock.calls[0]![0] as PopupListener<TestItem>;
      act(() => listener.onStart(mockSuggestionProps('')));
      act(() => result.current.setSelectedIndex(2));

      // onUpdate without changing items — selectedIndex 2 stays valid.
      act(() => listener.onUpdate(mockSuggestionProps('foo')));
      expect(result.current.selectedIndex).toBe(2);
    });

    it('resets selectedIndex on onUpdate when current index falls out of range', () => {
      const setListener = vi.fn();
      const queryItems = vi.fn((q: string) =>
        q === '' ? ITEMS : ITEMS.filter((i) => i.label === 'Foo'),
      );
      const { result } = renderHook(() =>
        useEditorPopup<TestItem>({
          setListener,
          queryItems,
          executeCommand: vi.fn(),
        }),
      );

      const listener = setListener.mock.calls[0]![0] as PopupListener<TestItem>;
      act(() => listener.onStart(mockSuggestionProps('')));
      act(() => result.current.setSelectedIndex(2));

      // Update narrows items to 1 — index 2 invalid, must reset to 0.
      act(() => listener.onUpdate(mockSuggestionProps('Foo')));
      expect(result.current.items).toHaveLength(1);
      expect(result.current.selectedIndex).toBe(0);
    });
  });

  describe('L3 — keyboard navigation', () => {
    function setup() {
      const setListener = vi.fn();
      const executeCommand = vi.fn();
      const { result } = renderHook(() =>
        useEditorPopup<TestItem>({
          setListener,
          queryItems: () => ITEMS,
          executeCommand,
        }),
      );
      const listener = setListener.mock.calls[0]![0] as PopupListener<TestItem>;
      const props = mockSuggestionProps('');
      act(() => listener.onStart(props));
      return { result, listener, props, executeCommand };
    }

    it('ArrowDown circulates selection forward and wraps at the end', () => {
      const { result, listener } = setup();
      expect(result.current.selectedIndex).toBe(0);

      act(() => {
        listener.onKeyDown(keydownProps('ArrowDown'));
      });
      expect(result.current.selectedIndex).toBe(1);

      act(() => {
        listener.onKeyDown(keydownProps('ArrowDown'));
      });
      expect(result.current.selectedIndex).toBe(2);

      act(() => {
        listener.onKeyDown(keydownProps('ArrowDown'));
      });
      expect(result.current.selectedIndex).toBe(0);
    });

    it('ArrowUp circulates selection backward and wraps at the start', () => {
      const { result, listener } = setup();
      expect(result.current.selectedIndex).toBe(0);

      act(() => {
        listener.onKeyDown(keydownProps('ArrowUp'));
      });
      expect(result.current.selectedIndex).toBe(2);
    });

    it('Enter calls executeCommand with the selected item and the latest props', () => {
      const { result, listener, props, executeCommand } = setup();
      act(() => {
        listener.onKeyDown(keydownProps('ArrowDown'));
      });
      act(() => {
        listener.onKeyDown(keydownProps('Enter'));
      });

      expect(executeCommand).toHaveBeenCalledTimes(1);
      expect(executeCommand).toHaveBeenCalledWith(ITEMS[1], props);
      // hook does NOT reset state on Enter — the suggestion plugin's onExit handles cleanup.
      expect(result.current.isOpen).toBe(true);
    });

    it('Escape closes the menu', () => {
      const { result, listener } = setup();
      expect(result.current.isOpen).toBe(true);

      act(() => {
        listener.onKeyDown(keydownProps('Escape'));
      });
      expect(result.current.isOpen).toBe(false);
    });

    it('returns false for unhandled keys (lets TipTap process them)', () => {
      const { listener } = setup();
      const handled = listener.onKeyDown(keydownProps('a'));
      expect(handled).toBe(false);
    });
  });

  describe('L4 — close on scroll (registration spies)', () => {
    // Note: jsdom does not always trigger capture-phase listeners reliably for
    // dispatched scroll events. The actual close-on-scroll behavior is verified
    // end-to-end by Playwright in F5. Here we assert the contract: when the
    // popup opens, the hook adds a `scroll` listener on `document` with
    // { capture: true, passive: true }; when it closes, the listener is removed.
    it('adds and removes scroll listener on document with capture: true', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      const removeSpy = vi.spyOn(document, 'removeEventListener');

      const setListener = vi.fn();
      renderHook(() =>
        useEditorPopup<TestItem>({
          setListener,
          queryItems: () => ITEMS,
          executeCommand: vi.fn(),
        }),
      );

      const listener = setListener.mock.calls[0]![0] as PopupListener<TestItem>;

      // open the popup
      act(() => listener.onStart(mockSuggestionProps('')));

      const scrollAdds = addSpy.mock.calls.filter(([type]) => type === 'scroll');
      expect(scrollAdds).toHaveLength(1);
      expect(scrollAdds[0]![2]).toMatchObject({ capture: true, passive: true });

      // close via onExit
      act(() => listener.onExit());

      const scrollRemoves = removeSpy.mock.calls.filter(([type]) => type === 'scroll');
      expect(scrollRemoves).toHaveLength(1);
      expect(scrollRemoves[0]![2]).toMatchObject({ capture: true });

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });
});

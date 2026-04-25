import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  autoUpdate,
  computePosition,
  flip,
  offset as offsetMiddleware,
  shift,
  type Placement,
  type VirtualElement,
} from '@floating-ui/dom';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';

export interface PopupListener<TItem> {
  onStart: (props: SuggestionProps<TItem>) => void;
  onUpdate: (props: SuggestionProps<TItem>) => void;
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
  onExit: () => void;
}

export interface UseEditorPopupParams<TItem> {
  setListener: (listener: PopupListener<TItem> | null) => void;
  queryItems: (query: string) => TItem[];
  executeCommand: (item: TItem, suggestionProps: SuggestionProps<TItem>) => void;
  placement?: Placement;
  offset?: number;
  shiftPadding?: number;
}

export interface UseEditorPopupReturn<TItem> {
  isOpen: boolean;
  items: TItem[];
  query: string;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  position: { top: number; left: number } | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  selectItem: (item: TItem) => void;
}

interface PopupState<TItem> {
  isOpen: boolean;
  items: TItem[];
  query: string;
  referenceRect: (() => DOMRect) | null;
  selectedIndex: number;
}

function makeInitialState<TItem>(): PopupState<TItem> {
  return {
    isOpen: false,
    items: [],
    query: '',
    referenceRect: null,
    selectedIndex: 0,
  };
}

export function useEditorPopup<TItem>(
  params: UseEditorPopupParams<TItem>,
): UseEditorPopupReturn<TItem> {
  const {
    setListener,
    queryItems,
    executeCommand,
    placement = 'bottom-start',
    offset = 6,
    shiftPadding = 8,
  } = params;

  const [state, setState] = useState<PopupState<TItem>>(() => makeInitialState<TItem>());
  const stateRef = useRef<PopupState<TItem>>(state);
  const propsRef = useRef<SuggestionProps<TItem> | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Latest values captured in refs so the listener (registered once on mount)
  // always sees fresh props/handlers without re-registering.
  const queryItemsRef = useRef(queryItems);
  const executeCommandRef = useRef(executeCommand);
  useEffect(() => {
    queryItemsRef.current = queryItems;
    executeCommandRef.current = executeCommand;
  }, [queryItems, executeCommand]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    function syncFromProps(props: SuggestionProps<TItem>): PopupState<TItem> {
      propsRef.current = props;
      const items = queryItemsRef.current(props.query);
      const referenceRect = props.clientRect ? () => props.clientRect!() ?? new DOMRect() : null;
      return {
        isOpen: true,
        items,
        query: props.query,
        referenceRect,
        selectedIndex: 0,
      };
    }

    setListener({
      onStart: (props) => {
        setState(syncFromProps(props));
      },
      onUpdate: (props) => {
        setState((prev) => {
          const next = syncFromProps(props);
          const preservedIndex = prev.selectedIndex < next.items.length ? prev.selectedIndex : 0;
          return { ...next, selectedIndex: preservedIndex };
        });
      },
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        const current = stateRef.current;
        if (!current.isOpen) return false;
        const itemCount = current.items.length;
        const denominator = Math.max(itemCount, 1);

        if (event.key === 'ArrowDown') {
          setState((prev) => ({
            ...prev,
            selectedIndex: (prev.selectedIndex + 1) % denominator,
          }));
          return true;
        }
        if (event.key === 'ArrowUp') {
          setState((prev) => ({
            ...prev,
            selectedIndex: (prev.selectedIndex - 1 + denominator) % denominator,
          }));
          return true;
        }
        if (event.key === 'Enter') {
          const item = current.items[current.selectedIndex];
          const props = propsRef.current;
          if (item && props) {
            executeCommandRef.current(item, props);
          }
          return true;
        }
        if (event.key === 'Escape') {
          setState(makeInitialState<TItem>());
          return true;
        }
        return false;
      },
      onExit: () => {
        propsRef.current = null;
        setState(makeInitialState<TItem>());
        setPosition(null);
      },
    });

    return () => setListener(null);
  }, [setListener]);

  useLayoutEffect(() => {
    if (!state.isOpen || !state.referenceRect || !menuRef.current) {
      return;
    }

    const referenceRect = state.referenceRect;
    const menuEl = menuRef.current;
    const virtualRef: VirtualElement = {
      getBoundingClientRect: () => referenceRect(),
    };

    const update = () => {
      computePosition(virtualRef, menuEl, {
        placement,
        middleware: [offsetMiddleware(offset), flip(), shift({ padding: shiftPadding })],
      }).then(({ x, y }) => {
        setPosition({ top: y, left: x });
      });
    };

    return autoUpdate(virtualRef, menuEl, update, {
      ancestorScroll: false,
      elementResize: true,
      layoutShift: true,
    });
  }, [state.isOpen, state.referenceRect, placement, offset, shiftPadding]);

  useEffect(() => {
    if (!state.isOpen) return;
    const handleScroll = () => {
      setState(makeInitialState<TItem>());
      setPosition(null);
    };
    // scroll events do not bubble; capture phase intercepts scrolls of any
    // descendant scrollable container (including inner <main> on mobile).
    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [state.isOpen]);

  const selectItem = useCallback((item: TItem) => {
    const props = propsRef.current;
    if (props) {
      executeCommandRef.current(item, props);
    }
  }, []);

  const setSelectedIndex = useCallback((index: number) => {
    setState((prev) => ({ ...prev, selectedIndex: index }));
  }, []);

  return {
    isOpen: state.isOpen,
    items: state.items,
    query: state.query,
    selectedIndex: state.selectedIndex,
    setSelectedIndex,
    position,
    menuRef,
    selectItem,
  };
}

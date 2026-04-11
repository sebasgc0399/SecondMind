import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import {
  setWikilinkMenuListener,
  type WikilinkSuggestionItem,
} from '@/components/editor/extensions/wikilink-suggestion';

interface MenuState {
  isOpen: boolean;
  items: WikilinkSuggestionItem[];
  query: string;
  rect: DOMRect | null;
  selectedIndex: number;
  command: ((item: WikilinkSuggestionItem) => void) | null;
}

const INITIAL_STATE: MenuState = {
  isOpen: false,
  items: [],
  query: '',
  rect: null,
  selectedIndex: 0,
  command: null,
};

export default function WikilinkMenu() {
  const [state, setState] = useState<MenuState>(INITIAL_STATE);
  const stateRef = useRef<MenuState>(INITIAL_STATE);
  stateRef.current = state;

  useEffect(() => {
    function syncFromProps(props: SuggestionProps<WikilinkSuggestionItem>): MenuState {
      const rect = props.clientRect?.() ?? null;
      return {
        isOpen: true,
        items: props.items,
        query: props.query,
        rect,
        selectedIndex: 0,
        command: (item) => props.command(item),
      };
    }

    setWikilinkMenuListener({
      onStart: (props) => {
        setState(syncFromProps(props));
      },
      onUpdate: (props) => {
        setState((prev) => {
          const next = syncFromProps(props);
          // preservar selectedIndex si sigue siendo válido
          const preservedIndex = prev.selectedIndex < next.items.length ? prev.selectedIndex : 0;
          return { ...next, selectedIndex: preservedIndex };
        });
      },
      onKeyDown: (props: SuggestionKeyDownProps) => {
        const current = stateRef.current;
        if (!current.isOpen) return false;

        if (props.event.key === 'ArrowDown') {
          setState((prev) => ({
            ...prev,
            selectedIndex: (prev.selectedIndex + 1) % Math.max(prev.items.length, 1),
          }));
          return true;
        }
        if (props.event.key === 'ArrowUp') {
          setState((prev) => ({
            ...prev,
            selectedIndex:
              (prev.selectedIndex - 1 + Math.max(prev.items.length, 1)) %
              Math.max(prev.items.length, 1),
          }));
          return true;
        }
        if (props.event.key === 'Enter') {
          const item = current.items[current.selectedIndex];
          if (item && current.command) {
            current.command(item);
          }
          return true;
        }
        if (props.event.key === 'Escape') {
          setState(INITIAL_STATE);
          return true;
        }
        return false;
      },
      onExit: () => {
        setState(INITIAL_STATE);
      },
    });

    return () => setWikilinkMenuListener(null);
  }, []);

  if (!state.isOpen || !state.rect) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    top: state.rect.bottom + 6,
    left: state.rect.left,
    zIndex: 60,
  };

  return createPortal(
    <div
      role="listbox"
      style={style}
      className="min-w-64 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
    >
      {state.items.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          Sin resultados{state.query ? ` para "${state.query}"` : ''}
        </div>
      ) : (
        <ul className="max-h-64 overflow-y-auto py-1">
          {state.items.map((item, index) => {
            const isSelected = index === state.selectedIndex;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    state.command?.(item);
                  }}
                  onMouseEnter={() => {
                    setState((prev) => ({ ...prev, selectedIndex: index }));
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                    isSelected ? 'bg-accent text-accent-foreground' : 'text-foreground'
                  }`}
                >
                  <span className="truncate">{item.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>,
    document.body,
  );
}

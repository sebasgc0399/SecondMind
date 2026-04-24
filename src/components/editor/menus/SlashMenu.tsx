import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  type VirtualElement,
} from '@floating-ui/dom';
import { setSlashMenuListener } from '@/components/editor/extensions/slash-command-suggestion';
import {
  CATEGORY_ORDER,
  type SlashMenuCategory,
  type SlashMenuItem,
} from '@/components/editor/menus/slashMenuItems';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';

interface MenuState {
  isOpen: boolean;
  items: SlashMenuItem[];
  query: string;
  referenceRect: (() => DOMRect) | null;
  selectedIndex: number;
  command: ((item: SlashMenuItem) => void) | null;
}

const INITIAL_STATE: MenuState = {
  isOpen: false,
  items: [],
  query: '',
  referenceRect: null,
  selectedIndex: 0,
  command: null,
};

export default function SlashMenu() {
  const [state, setState] = useState<MenuState>(INITIAL_STATE);
  const stateRef = useRef<MenuState>(INITIAL_STATE);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    function syncFromProps(props: SuggestionProps<SlashMenuItem>): MenuState {
      return {
        isOpen: true,
        items: props.items,
        query: props.query,
        referenceRect: props.clientRect ? () => props.clientRect!() ?? new DOMRect() : null,
        selectedIndex: 0,
        command: (item) => props.command(item),
      };
    }

    setSlashMenuListener({
      onStart: (props) => setState(syncFromProps(props)),
      onUpdate: (props) => {
        setState((prev) => {
          const next = syncFromProps(props);
          const preservedIndex = prev.selectedIndex < next.items.length ? prev.selectedIndex : 0;
          return { ...next, selectedIndex: preservedIndex };
        });
      },
      onKeyDown: (props: SuggestionKeyDownProps) => {
        const current = stateRef.current;
        if (!current.isOpen) return false;
        const itemCount = current.items.length;

        if (props.event.key === 'ArrowDown') {
          setState((prev) => ({
            ...prev,
            selectedIndex: (prev.selectedIndex + 1) % Math.max(itemCount, 1),
          }));
          return true;
        }
        if (props.event.key === 'ArrowUp') {
          setState((prev) => ({
            ...prev,
            selectedIndex:
              (prev.selectedIndex - 1 + Math.max(itemCount, 1)) % Math.max(itemCount, 1),
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
        setPosition(null);
      },
    });

    return () => setSlashMenuListener(null);
  }, []);

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
        placement: 'bottom-start',
        middleware: [offset(6), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        setPosition({ top: y, left: x });
      });
    };

    const cleanup = autoUpdate(virtualRef, menuEl, update);
    return cleanup;
  }, [state.isOpen, state.referenceRect]);

  const groupedItems = useMemo(() => {
    const map = new Map<SlashMenuCategory, { item: SlashMenuItem; index: number }[]>();
    state.items.forEach((item, index) => {
      const list = map.get(item.category) ?? [];
      list.push({ item, index });
      map.set(item.category, list);
    });
    return CATEGORY_ORDER.filter((cat) => map.has(cat)).map((cat) => ({
      category: cat,
      entries: map.get(cat)!,
    }));
  }, [state.items]);

  if (!state.isOpen || !state.referenceRect) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    top: position?.top ?? 0,
    left: position?.left ?? 0,
    zIndex: 60,
    visibility: position === null ? 'hidden' : 'visible',
  };

  return createPortal(
    <div
      ref={menuRef}
      role="listbox"
      style={style}
      className="min-w-72 max-w-[min(20rem,calc(100vw-1rem))] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
    >
      {state.items.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          Sin resultados{state.query ? ` para "${state.query}"` : ''}
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto py-1">
          {groupedItems.map(({ category, entries }) => (
            <div key={category}>
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {category}
              </div>
              <ul>
                {entries.map(({ item, index }) => {
                  const isSelected = index === state.selectedIndex;
                  const Icon = item.icon;
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
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                          isSelected ? 'bg-accent text-accent-foreground' : 'text-foreground'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">{item.label}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

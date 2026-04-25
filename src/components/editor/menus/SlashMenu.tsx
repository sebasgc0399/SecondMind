import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { setSlashMenuListener } from '@/components/editor/extensions/slash-command-suggestion';
import { useEditorPopup } from '@/components/editor/hooks/useEditorPopup';
import {
  CATEGORY_ORDER,
  filterSlashMenuItems,
  type SlashMenuCategory,
  type SlashMenuItem,
} from '@/components/editor/menus/slashMenuItems';

export default function SlashMenu() {
  const { isOpen, items, query, selectedIndex, setSelectedIndex, position, menuRef, selectItem } =
    useEditorPopup<SlashMenuItem>({
      setListener: setSlashMenuListener,
      queryItems: filterSlashMenuItems,
      executeCommand: (item, props) => props.command(item),
    });

  const groupedItems = useMemo(() => {
    const map = new Map<SlashMenuCategory, { item: SlashMenuItem; index: number }[]>();
    items.forEach((item, index) => {
      const list = map.get(item.category) ?? [];
      list.push({ item, index });
      map.set(item.category, list);
    });
    return CATEGORY_ORDER.filter((cat) => map.has(cat)).map((cat) => ({
      category: cat,
      entries: map.get(cat)!,
    }));
  }, [items]);

  if (!isOpen) return null;

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
      {items.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          Sin resultados{query ? ` para "${query}"` : ''}
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
                  const isSelected = index === selectedIndex;
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectItem(item);
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
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

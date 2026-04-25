import { createPortal } from 'react-dom';
import {
  queryWikilinkItems,
  setWikilinkMenuListener,
  type WikilinkSuggestionItem,
} from '@/components/editor/extensions/wikilink-suggestion';
import { useEditorPopup } from '@/components/editor/hooks/useEditorPopup';

export default function WikilinkMenu() {
  const { isOpen, items, query, selectedIndex, setSelectedIndex, position, menuRef, selectItem } =
    useEditorPopup<WikilinkSuggestionItem>({
      setListener: setWikilinkMenuListener,
      queryItems: queryWikilinkItems,
      executeCommand: (item, props) => props.command(item),
    });

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
      className="min-w-64 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
    >
      {items.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          Sin resultados{query ? ` para "${query}"` : ''}
        </div>
      ) : (
        <ul className="max-h-64 overflow-y-auto py-1">
          {items.map((item, index) => {
            const isSelected = index === selectedIndex;
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

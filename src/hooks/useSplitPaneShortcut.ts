import { useEffect, useRef } from 'react';
import useAuth from '@/hooks/useAuth';
import { useBreakpoint } from '@/hooks/useMediaQuery';

// Selector del guard de foco — idéntico a useSidebarVisibilityShortcut:
// cubre TipTap (.ProseMirror tiene contenteditable=true) + inputs/textareas/
// selects nativos.
const FOCUS_GUARD_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

interface UseSplitPaneShortcutOptions {
  onToggle: () => void;
}

// Atajo Cmd/Ctrl+\ para toggle del split-pane (F46.4). Patrón canónico de
// `useSidebarVisibilityShortcut.ts:14-50`: event.code (layout-independent
// Dvorak/AZERTY OK), guards de foco + auth + breakpoint desktop. onToggle
// delega al consumer la decisión "abrir picker vs cerrar split" — así
// SplitPaneLayout mantiene el state del picker localmente.
//
// El ref pattern (onToggleRef) evita re-attach del listener cuando onToggle
// cambia identidad por re-render del parent. Sin esto, el effect re-corre
// en cada render → leak de listeners temporal hasta el próximo cleanup.
export default function useSplitPaneShortcut({ onToggle }: UseSplitPaneShortcutOptions): void {
  const { user } = useAuth();
  const breakpoint = useBreakpoint();
  const onToggleRef = useRef(onToggle);
  useEffect(() => {
    onToggleRef.current = onToggle;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.code !== 'Backslash') return;
      if (event.shiftKey || event.altKey) return;

      // Guard 1 (foco): no disparar si user está tipeando en input/editor.
      // TipTap .ProseMirror tiene contenteditable=true → cubierto.
      const active = document.activeElement;
      if (active instanceof Element && active.matches(FOCUS_GUARD_SELECTOR)) {
        return;
      }

      // Guard 2 (auth): el hook se monta antes que useStoreInit complete;
      // sin sesión los handlers internos romperían con uid undefined.
      if (!user) return;

      // Guard 3 (breakpoint): solo desktop ≥1024px. En tablet/mobile no-op
      // para no romper expectativas — el split tampoco se renderiza ahí (D6).
      if (breakpoint !== 'desktop') return;

      event.preventDefault();
      onToggleRef.current();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, breakpoint]);
}

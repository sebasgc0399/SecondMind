import { useEffect } from 'react';
import { setPreferences } from '@/lib/preferences';
import useAuth from './useAuth';
import { useBreakpoint } from './useMediaQuery';
import usePreferences from './usePreferences';

// Selector del guard de foco. `'select'` armoniza con la convención de
// inbox/process/page.tsx. `[contenteditable="true"]` cubre el editor
// TipTap (.ProseMirror lo setea); `[contenteditable=""]` cubre el caso
// donde el atributo viene sin valor explícito.
const FOCUS_GUARD_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

export default function useSidebarVisibilityShortcut(): void {
  const { user } = useAuth();
  const breakpoint = useBreakpoint();
  const { preferences } = usePreferences();
  const sidebarHidden = preferences.sidebarHidden;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // event.code es independiente del layout físico (Dvorak/AZERTY
      // siguen funcionando), a diferencia de event.key.
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.code !== 'KeyB') return;
      if (event.shiftKey || event.altKey) return;

      // Guard 1 (foco): no pisar el bold de TipTap ni atajos nativos de
      // inputs/textareas/selects. .ProseMirror tiene contenteditable=true.
      const active = document.activeElement;
      if (active instanceof Element && active.matches(FOCUS_GUARD_SELECTOR)) {
        return;
      }

      // Guard 2 (auth): el hook se monta antes que useStoreInit complete;
      // sin sesión setPreferences(user.uid, ...) rompe con uid undefined.
      if (!user) return;

      // Guard 3 (breakpoint): solo desktop. En tablet/mobile no-op para
      // no romper expectativas (sidebar collapsed o drawer ya cubren).
      if (breakpoint !== 'desktop') return;

      event.preventDefault();
      void setPreferences(user.uid, { sidebarHidden: !sidebarHidden });
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, breakpoint, sidebarHidden]);
}

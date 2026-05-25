import { useMemo } from 'react';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  type LayoutStorage,
} from 'react-resizable-panels';
import NoteEditorContainer from '@/components/notes/NoteEditorContainer';
import useAuth from '@/hooks/useAuth';
import { useBreakpoint } from '@/hooks/useMediaQuery';
import usePreferences from '@/hooks/usePreferences';
import useSplitPanes from '@/hooks/useSplitPanes';
import { setPreferences } from '@/lib/preferences';

interface SplitPaneLayoutProps {
  currentNoteId: string;
}

// Skeleton del pane derecho durante hidratación inicial de TinyBase
// (primeros 500ms post-mount). Mismo treatment que NoteEditorContainer.isLoading.
function PaneSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-3 px-4 py-6">
      <div className="h-6 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-full animate-pulse rounded bg-muted" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
    </div>
  );
}

function PaneNotFound({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-muted-foreground">Nota no encontrada</p>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
      >
        Cerrar panel
      </button>
    </div>
  );
}

export default function SplitPaneLayout({ currentNoteId }: SplitPaneLayoutProps) {
  const breakpoint = useBreakpoint();
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const { rightNoteId, isOpen, rightStatus, closeSplit } = useSplitPanes(currentNoteId);
  const isSplitActive = isOpen && breakpoint === 'desktop';

  // LayoutStorage adapter custom — getItem sync read desde preferences,
  // setItem fire-and-forget al async setPreferences (Firestore). El
  // debounceSaveMs nativo del hook v4 (100ms) ya colapsa decenas de
  // pointermove durante un drag. Si Firestore falla, el próximo drag
  // re-dispara (no perdemos UX — el ratio en memoria sigue correcto via
  // onLayoutChanged). useMemo con deps mínimas evita re-instanciar el
  // adapter en cada render.
  const layoutStorage: LayoutStorage = useMemo(
    () => ({
      getItem: () => JSON.stringify(preferences.splitPaneLayout),
      setItem: (_key, value) => {
        if (!user) return;
        try {
          const parsed = JSON.parse(value) as Record<string, number>;
          if (typeof parsed.left !== 'number' || typeof parsed.right !== 'number') return;
          void setPreferences(user.uid, {
            splitPaneLayout: { left: parsed.left, right: parsed.right },
          });
        } catch {
          // Layout corrupto, ignorar (defensive).
        }
      },
    }),
    [preferences.splitPaneLayout, user],
  );

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'split-pane-notes',
    panelIds: isSplitActive ? ['left', 'right'] : ['left'],
    storage: layoutStorage,
  });

  return (
    <Group
      id="split-pane-notes"
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      style={{ height: '100%', width: '100%' }}
    >
      <Panel id="left" minSize="30%">
        <NoteEditorContainer
          key={currentNoteId}
          noteId={currentNoteId}
          showSidePanel={!isSplitActive}
        />
      </Panel>
      {isSplitActive && (
        <>
          <Separator className="w-1 cursor-col-resize bg-border transition-colors hover:bg-primary/30" />
          <Panel id="right" minSize="30%">
            {rightStatus === 'loading' && <PaneSkeleton />}
            {rightStatus === 'not-found' && <PaneNotFound onClose={() => closeSplit('right')} />}
            {rightStatus === 'ready' && rightNoteId !== null && (
              <NoteEditorContainer key={rightNoteId} noteId={rightNoteId} showSidePanel={false} />
            )}
          </Panel>
        </>
      )}
    </Group>
  );
}

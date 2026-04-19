import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Check, Loader2 } from 'lucide-react';
import useAuth from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { hideCurrentWindow, isTauri, showMainWindow } from '@/lib/tauri';

const CAPTURE_LOGICAL_WIDTH = 480;
const CAPTURE_LOGICAL_HEIGHT = 220;

type Status = 'editing' | 'saving' | 'saved';

export default function CapturePage() {
  const { user, isLoading } = useAuth();
  const [rawContent, setRawContent] = useState('');
  const [status, setStatus] = useState<Status>('editing');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (status !== 'editing') return;
    const id = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [status]);

  // Bug B (fix post-F7): WebView2 no rescala su contenido cuando Windows
  // dispara WM_DPICHANGED al arrastrar entre monitores con DPI distinto.
  // Workaround: escuchar onScaleChanged y forzar setSize(LogicalSize) al
  // instante — esto fuerza a WebView2 a reflow en el DPI del monitor actual,
  // previniendo el estado "autorescaled grande que no se recupera" que reporta
  // el issue tauri-apps/tauri#3610.
  useEffect(() => {
    if (!isTauri()) return;
    let cleanup: (() => void) | null = null;
    void (async () => {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const { LogicalSize } = await import('@tauri-apps/api/window');
        const win = getCurrentWebviewWindow();
        const unlisten = await win.onScaleChanged(async () => {
          try {
            await win.setSize(new LogicalSize(CAPTURE_LOGICAL_WIDTH, CAPTURE_LOGICAL_HEIGHT));
          } catch (error) {
            console.error('capture scale-change resize failed', error);
          }
        });
        cleanup = unlisten;
      } catch (error) {
        console.error('capture onScaleChanged setup failed', error);
      }
    })();
    return () => {
      cleanup?.();
    };
  }, []);

  const closeWindow = useCallback(() => {
    void hideCurrentWindow();
    window.setTimeout(() => {
      setStatus('editing');
      setRawContent('');
    }, 200);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeWindow();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeWindow]);

  async function handleSave() {
    const trimmed = rawContent.trim();
    if (!trimmed || !user) return;
    setStatus('saving');
    const itemId = crypto.randomUUID();
    try {
      await setDoc(doc(db, 'users', user.uid, 'inbox', itemId), {
        id: itemId,
        rawContent: trimmed,
        source: 'desktop-capture',
        status: 'pending',
        aiProcessed: false,
        createdAt: serverTimestamp(),
      });
      setStatus('saved');
      window.setTimeout(closeWindow, 600);
    } catch (error) {
      console.error('capture save failed', error);
      setStatus('editing');
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void handleSave();
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen w-screen flex-col bg-background text-foreground">
        <div data-tauri-drag-region className="h-8 shrink-0 border-b border-border bg-card" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-muted-foreground">Abrí SecondMind para iniciar sesión.</p>
          <button
            type="button"
            onClick={() => {
              void showMainWindow();
              void hideCurrentWindow();
            }}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Abrir SecondMind
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-card text-foreground">
      <div
        data-tauri-drag-region
        className="flex h-8 shrink-0 items-center border-b border-border-strong bg-card/60 px-3 text-xs text-muted-foreground"
      >
        Captura rápida
      </div>
      <div className="flex flex-1 flex-col p-4">
        {status === 'saved' ? (
          <div className="flex flex-1 items-center justify-center">
            <Check className="h-10 w-10 text-primary animate-in zoom-in-50 duration-200" />
          </div>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={rawContent}
              onChange={(event) => setRawContent(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribí una idea..."
              rows={4}
              disabled={status === 'saving'}
              className="flex-1 resize-none border-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
            />
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground">
                  Enter
                </kbd>{' '}
                guardar ·{' '}
                <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground">
                  Esc
                </kbd>{' '}
                cerrar
              </span>
              {status === 'saving' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

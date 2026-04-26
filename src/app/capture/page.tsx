import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Check, Loader2 } from 'lucide-react';
import useAuth from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { hideCurrentWindow, showMainWindow } from '@/lib/tauri';

type Status = 'editing' | 'saving' | 'saved' | 'closing';

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

  const closeWindow = useCallback(() => {
    void hideCurrentWindow();
    setStatus('closing');
  }, []);

  // Tras 'saved' → cerrar ventana a los 600ms. Cleanup en unmount o si el
  // status cambia antes (p. ej. ESC durante el delay).
  useEffect(() => {
    if (status !== 'saved') return;
    const id = window.setTimeout(closeWindow, 600);
    return () => window.clearTimeout(id);
  }, [status, closeWindow]);

  // Tras 'closing' → resetear a 'editing' a los 200ms (deja respirar al
  // hide de Tauri). Cleanup garantiza que un unmount durante el delay no
  // dispare setState fantasma.
  useEffect(() => {
    if (status !== 'closing') return;
    const id = window.setTimeout(() => {
      setStatus('editing');
      setRawContent('');
    }, 200);
    return () => window.clearTimeout(id);
  }, [status]);

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
        <div className="h-8 shrink-0 border-b border-border bg-card" />
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
      <div className="flex h-8 shrink-0 items-center border-b border-border-strong bg-card/60 px-3 text-xs text-muted-foreground">
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
              placeholder="Escribe una idea..."
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

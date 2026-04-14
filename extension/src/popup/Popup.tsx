import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth/web-extension';
import { signInWithChrome, observeAuth } from '../lib/auth.ts';
import { saveToInbox } from '../lib/firestore.ts';
import { getSelection } from '../content/getSelection.ts';

interface PageInfo {
  title: string;
  url: string;
}

type SaveState = 'idle' | 'saving' | 'saved';

export default function Popup() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [content, setContent] = useState('');
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = observeAuth((u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tab = tabs[0];
      if (tab?.title && tab.url) {
        setPageInfo({ title: tab.title, url: tab.url });
      }
    });
  }, []);

  const handleSignIn = useCallback(async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithChrome();
    } catch (err) {
      console.error('[SecondMind] signIn error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setAuthError(`Error: ${msg}`);
      setAuthLoading(false);
    }
  }, []);

  const handleCapture = useCallback(async () => {
    setError(null);
    setIsCapturing(true);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        setError('No se pudo acceder a la pestana activa.');
        return;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: getSelection,
      });

      const result = results[0]?.result;
      if (!result || !result.text) {
        setError('No hay texto seleccionado en la pagina.');
        return;
      }

      setContent((prev) => (prev ? `${prev}\n\n${result.text}` : result.text));
    } catch {
      setError('No se puede capturar en esta pagina.');
    } finally {
      setIsCapturing(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!user || !content.trim()) return;
    setError(null);
    setSaveState('saving');

    try {
      await saveToInbox(user.uid, {
        rawContent: content.trim(),
        sourceUrl: pageInfo?.url ?? '',
        sourceTitle: pageInfo?.title ?? '',
      });
      setSaveState('saved');
      setTimeout(() => window.close(), 800);
    } catch {
      setError('Error al guardar. Verifica tu conexion.');
      setSaveState('idle');
    }
  }, [user, content, pageInfo]);

  const isAuthenticated = !!user;

  return (
    <div className="popup">
      <header className="popup-header">
        <span className="popup-logo">SecondMind</span>
        {isAuthenticated ? (
          <span className="popup-status">
            <span className="popup-status-dot popup-status-dot--connected" />
            <span className="popup-user">{user.displayName ?? user.email}</span>
          </span>
        ) : (
          <span className="popup-status">
            <span className="popup-status-dot" />
            Sin conectar
          </span>
        )}
      </header>

      {!isAuthenticated && !authLoading && (
        <>
          <button
            type="button"
            className="popup-btn-google"
            onClick={() => void handleSignIn()}
            disabled={authLoading}
          >
            Conectar con Google
          </button>
          {authError && <p className="popup-error">{authError}</p>}
        </>
      )}

      {authLoading && !isAuthenticated && <p className="popup-disabled-msg">Conectando...</p>}

      <textarea
        className="popup-textarea"
        placeholder="Escribe o pega contenido..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      {error && <p className="popup-error">{error}</p>}
      {saveState === 'saved' && <p className="popup-success">Guardado en Inbox</p>}

      <div className="popup-actions">
        <button
          type="button"
          className="popup-btn popup-btn-secondary"
          onClick={() => void handleCapture()}
          disabled={isCapturing}
        >
          {isCapturing ? 'Capturando...' : 'Capturar seleccion'}
        </button>
        <button
          type="button"
          className="popup-btn popup-btn-primary"
          onClick={() => void handleSave()}
          disabled={!isAuthenticated || !content.trim() || saveState !== 'idle'}
        >
          {saveState === 'saving' ? (
            <span className="popup-spinner" />
          ) : saveState === 'saved' ? (
            'Guardado'
          ) : (
            'Guardar en Inbox'
          )}
        </button>
      </div>

      {!isAuthenticated && <p className="popup-disabled-msg">Conecta tu cuenta para guardar</p>}

      {pageInfo && (
        <footer className="popup-footer">
          <p className="popup-page-info" title={pageInfo.url}>
            {pageInfo.title}
          </p>
        </footer>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { getSelection } from '../content/getSelection.ts';

interface PageInfo {
  title: string;
  url: string;
}

export default function Popup() {
  const [content, setContent] = useState('');
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tab = tabs[0];
      if (tab?.title && tab.url) {
        setPageInfo({ title: tab.title, url: tab.url });
      }
    });
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

      const captured = `${result.text}\n\n--- Capturado de: ${result.title}\n${result.url}`;
      setContent((prev) => (prev ? `${prev}\n\n${captured}` : captured));
    } catch {
      setError('No se puede capturar en esta pagina.');
    } finally {
      setIsCapturing(false);
    }
  }, []);

  return (
    <div className="popup">
      <header className="popup-header">
        <span className="popup-logo">SecondMind</span>
        <span className="popup-status">
          <span className="popup-status-dot" />
          Sin conectar
        </span>
      </header>

      <textarea
        className="popup-textarea"
        placeholder="Escribe o pega contenido..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      {error && <p className="popup-error">{error}</p>}

      <div className="popup-actions">
        <button
          type="button"
          className="popup-btn popup-btn-secondary"
          onClick={() => void handleCapture()}
          disabled={isCapturing}
        >
          {isCapturing ? 'Capturando...' : 'Capturar seleccion'}
        </button>
        <button type="button" className="popup-btn popup-btn-primary" disabled>
          Guardar en Inbox
        </button>
      </div>

      <p className="popup-disabled-msg">Conecta tu cuenta para guardar</p>

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

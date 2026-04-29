import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  QuickCaptureContext,
  type QuickCaptureContextValue,
  type QuickCaptureOpenOptions,
} from '@/hooks/useQuickCapture';
import { inboxStore } from '@/stores/inboxStore';

interface QuickCaptureProviderProps {
  children: ReactNode;
}

export default function QuickCaptureProvider({ children }: QuickCaptureProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialContent, setInitialContent] = useState('');
  const pendingMetaRef = useRef<QuickCaptureOpenOptions>({});

  const open = useCallback((content?: string, options?: QuickCaptureOpenOptions) => {
    setInitialContent(content ?? '');
    pendingMetaRef.current = options ?? {};
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setInitialContent('');
    pendingMetaRef.current = {};
  }, []);

  const save = useCallback((rawContent: string) => {
    const trimmed = rawContent.trim();
    if (!trimmed) return;
    const id = crypto.randomUUID();
    const { source = 'quick-capture', sourceUrl } = pendingMetaRef.current;
    inboxStore.setRow('inbox', id, {
      rawContent: trimmed,
      source,
      status: 'pending',
      aiProcessed: false,
      createdAt: Date.now(),
      ...(sourceUrl ? { sourceUrl } : {}),
    });
    pendingMetaRef.current = {};
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // event.code es independiente del layout físico (Dvorak/AZERTY siguen
      // funcionando), a diferencia de event.key. Paridad con
      // useSidebarVisibilityShortcut (F31.5).
      if (!event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) {
        return;
      }
      if (event.code !== 'KeyN') return;
      event.preventDefault();
      setIsOpen((current) => (current ? current : true));
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const value = useMemo<QuickCaptureContextValue>(
    () => ({ isOpen, initialContent, open, close, save }),
    [isOpen, initialContent, open, close, save],
  );

  return <QuickCaptureContext.Provider value={value}>{children}</QuickCaptureContext.Provider>;
}

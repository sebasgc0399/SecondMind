import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { QuickCaptureContext, type QuickCaptureContextValue } from '@/hooks/useQuickCapture';
import { inboxStore } from '@/stores/inboxStore';

interface QuickCaptureProviderProps {
  children: ReactNode;
}

export default function QuickCaptureProvider({ children }: QuickCaptureProviderProps) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const save = useCallback((rawContent: string) => {
    const trimmed = rawContent.trim();
    if (!trimmed) return;
    const id = crypto.randomUUID();
    inboxStore.setRow('inbox', id, {
      rawContent: trimmed,
      source: 'quick-capture',
      status: 'pending',
      aiProcessed: false,
      createdAt: Date.now(),
    });
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) {
        return;
      }
      if (event.key !== 'n' && event.key !== 'N') return;
      event.preventDefault();
      setIsOpen((current) => (current ? current : true));
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const value = useMemo<QuickCaptureContextValue>(
    () => ({ isOpen, open, close, save }),
    [isOpen, open, close, save],
  );

  return <QuickCaptureContext.Provider value={value}>{children}</QuickCaptureContext.Provider>;
}

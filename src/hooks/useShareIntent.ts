import { useEffect } from 'react';
import { isCapacitor } from '@/lib/capacitor';
import useQuickCapture from '@/hooks/useQuickCapture';

export default function useShareIntent(): void {
  const { open } = useQuickCapture();

  useEffect(() => {
    if (!isCapacitor()) return;

    let listenerHandle: { remove: () => Promise<void> } | undefined;
    let cancelled = false;

    void (async () => {
      const { CapacitorShareTarget } = await import('@capgo/capacitor-share-target');
      if (cancelled) return;
      listenerHandle = await CapacitorShareTarget.addListener('shareReceived', (event) => {
        const text = event.texts?.[0]?.trim() ?? '';
        if (!text) return;
        const isUrl = /^https?:\/\//i.test(text);
        if (isUrl) {
          const title = event.title?.trim();
          const content = title && title !== text ? `${title}\n${text}` : text;
          open(content, { source: 'share-intent', sourceUrl: text });
        } else {
          open(text, { source: 'share-intent' });
        }
      });
    })();

    return () => {
      cancelled = true;
      if (listenerHandle) {
        void listenerHandle.remove();
      }
    };
  }, [open]);
}

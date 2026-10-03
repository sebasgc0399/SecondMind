import { useEffect } from 'react';
import { isCapacitor } from '@/lib/capacitor';
import { buildSharedContent } from '@/lib/buildSharedContent';
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
        const shared = buildSharedContent(event);
        if (!shared) return;
        open(shared.content, {
          source: 'share-intent',
          ...(shared.sourceUrl ? { sourceUrl: shared.sourceUrl } : {}),
        });
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

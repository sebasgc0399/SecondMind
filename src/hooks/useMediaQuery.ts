import { useSyncExternalStore } from 'react';
import { DESKTOP_QUERY, MOBILE_QUERY, type Breakpoint } from '@/lib/breakpoints';

function createSubscribe(query: string) {
  return (callback: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
  };
}

function createSnapshot(query: string) {
  return () => window.matchMedia(query).matches;
}

function getServerSnapshotFalse() {
  return false;
}

export default function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    createSubscribe(query),
    createSnapshot(query),
    getServerSnapshotFalse,
  );
}

export function useBreakpoint(): Breakpoint {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  if (isMobile) return 'mobile';
  if (isDesktop) return 'desktop';
  return 'tablet';
}

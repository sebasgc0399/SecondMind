import type { ReactNode } from 'react';
import useAutoUpdate from '@/hooks/useAutoUpdate';
import useCloseToTray from '@/hooks/useCloseToTray';
import useSaveQueueFlush from '@/hooks/useSaveQueueFlush';
import useTauriThemeSync from '@/hooks/useTauriThemeSync';

export default function TauriIntegration({ children }: { children: ReactNode }) {
  useCloseToTray();
  useAutoUpdate();
  useSaveQueueFlush();
  useTauriThemeSync();
  return <>{children}</>;
}

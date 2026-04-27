import type { ReactNode } from 'react';
import useAutoUpdate from '@/hooks/useAutoUpdate';
import useCloseToTray from '@/hooks/useCloseToTray';
import useSaveQueueFlush from '@/hooks/useSaveQueueFlush';

export default function TauriIntegration({ children }: { children: ReactNode }) {
  useCloseToTray();
  useAutoUpdate();
  useSaveQueueFlush();
  return <>{children}</>;
}

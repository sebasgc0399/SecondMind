import type { ReactNode } from 'react';
import useAutoUpdate from '@/hooks/useAutoUpdate';
import useCloseToTray from '@/hooks/useCloseToTray';

export default function TauriIntegration({ children }: { children: ReactNode }) {
  useCloseToTray();
  useAutoUpdate();
  return <>{children}</>;
}

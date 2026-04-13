import { Navigate, Outlet } from 'react-router';
import QuickCapture from '@/components/capture/QuickCapture';
import QuickCaptureProvider from '@/components/capture/QuickCaptureProvider';
import CommandPalette, { CommandPaletteProvider } from '@/components/layout/CommandPalette';
import InstallPrompt from '@/components/layout/InstallPrompt';
import OfflineBadge from '@/components/layout/OfflineBadge';
import Sidebar from '@/components/layout/Sidebar';
import useAuth from '@/hooks/useAuth';
import useStoreInit from '@/hooks/useStoreInit';

export default function Layout() {
  const { user, isLoading, signOut } = useAuth();
  useStoreInit(user?.uid ?? null);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <CommandPaletteProvider>
      <QuickCaptureProvider>
        <div className="flex h-screen bg-background text-foreground">
          <Sidebar user={user} onSignOut={signOut} />
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
          <QuickCapture />
          <CommandPalette />
          <InstallPrompt />
          <OfflineBadge />
        </div>
      </QuickCaptureProvider>
    </CommandPaletteProvider>
  );
}

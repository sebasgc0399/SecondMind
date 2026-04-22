import { useState } from 'react';
import { Navigate, Outlet } from 'react-router';
import QuickCapture from '@/components/capture/QuickCapture';
import QuickCaptureProvider from '@/components/capture/QuickCaptureProvider';
import BottomNav from '@/components/layout/BottomNav';
import CommandPalette, { CommandPaletteProvider } from '@/components/layout/CommandPalette';
import FAB from '@/components/layout/FAB';
import InstallPrompt from '@/components/layout/InstallPrompt';
import MobileHeader from '@/components/layout/MobileHeader';
import MoreDrawer from '@/components/layout/MoreDrawer';
import NavigationDrawer from '@/components/layout/NavigationDrawer';
import OfflineBadge from '@/components/layout/OfflineBadge';
import Sidebar from '@/components/layout/Sidebar';
import useAuth from '@/hooks/useAuth';
import { useBreakpoint } from '@/hooks/useMediaQuery';
import useShareIntent from '@/hooks/useShareIntent';
import useStoreInit from '@/hooks/useStoreInit';
import StoreHydrationProvider from '@/hooks/StoreHydrationProvider';

function ShareIntentMount() {
  useShareIntent();
  return null;
}

export default function Layout() {
  const { user, isLoading, signOut } = useAuth();
  const breakpoint = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { isHydrating } = useStoreInit(user?.uid ?? null);

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

  const isMobile = breakpoint === 'mobile';
  const isTablet = breakpoint === 'tablet';

  return (
    <StoreHydrationProvider value={{ isHydrating }}>
      <CommandPaletteProvider>
        <QuickCaptureProvider>
          <div className="flex h-screen bg-background text-foreground">
            {!isMobile && (
              <Sidebar
                user={user}
                onSignOut={signOut}
                collapsed={isTablet}
                onExpandClick={isTablet ? () => setDrawerOpen(true) : undefined}
              />
            )}
            <div className="flex flex-1 flex-col overflow-hidden">
              {isMobile && <MobileHeader onMenuClick={() => setDrawerOpen(true)} />}
              <main
                className="flex-1 overflow-auto p-4 md:p-6"
                style={isMobile ? { paddingBottom: 'calc(80px + var(--sai-bottom))' } : undefined}
              >
                <Outlet />
              </main>
            </div>
            {isMobile && <BottomNav onMoreClick={() => setMoreOpen(true)} />}
            {isMobile && <FAB />}
            {isMobile && <MoreDrawer open={moreOpen} onOpenChange={setMoreOpen} />}
            {(isMobile || isTablet) && (
              <NavigationDrawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                user={user}
                onSignOut={signOut}
              />
            )}
            <QuickCapture />
            <ShareIntentMount />
            <CommandPalette />
            <InstallPrompt />
            <OfflineBadge />
          </div>
        </QuickCaptureProvider>
      </CommandPaletteProvider>
    </StoreHydrationProvider>
  );
}

import { useLayoutEffect, useRef, useState } from 'react';
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
import TopBar from '@/components/layout/TopBar';
import useAuth from '@/hooks/useAuth';
import { useBreakpoint } from '@/hooks/useMediaQuery';
import usePreferences from '@/hooks/usePreferences';
import useShareIntent from '@/hooks/useShareIntent';
import useSidebarVisibilityShortcut from '@/hooks/useSidebarVisibilityShortcut';
import AuthLoadingSkeleton from '@/components/layout/AuthLoadingSkeleton';
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
  const { preferences } = usePreferences();
  useSidebarVisibilityShortcut();

  // Animación toggle-only del swap sidebar↔TopBar (F32.3): el mount inicial
  // (page load) NO anima — clave porque post-F32.4 el layout arranca hidratado
  // con el último valor persistido y un animate-in fijo dispararía un
  // slide-in en cada carga. Solo cambios subsecuentes de
  // preferences.sidebarHidden (toggle interactivo o snapshot post-hint stale)
  // animan la entrada del componente que monta.
  //
  // useLayoutEffect (no useEffect): el setState debe correr ANTES del paint
  // para que el componente entrante reciba la clase animate-in en su PRIMER
  // render visible. Con useEffect, el componente paint sin clase y luego
  // recibe la clase ~30ms después → blip visual donde el elemento aparece
  // en posición final y luego retro-anima.
  const isInitialMount = useRef(true);
  const [animateLayoutSwap, setAnimateLayoutSwap] = useState(false);

  useLayoutEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- toggle-only mount-anim (F32.3): la setState ES el side-effect que sincroniza el visual con el cambio de preferences.sidebarHidden. Detectar 'cambio subsecuente vs mount inicial' requiere ref + setState; no hay alternativa pura render-state.
    setAnimateLayoutSwap(true);
    const timer = window.setTimeout(() => setAnimateLayoutSwap(false), 300);
    return () => window.clearTimeout(timer);
  }, [preferences.sidebarHidden]);

  if (isLoading) {
    return <AuthLoadingSkeleton />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isMobile = breakpoint === 'mobile';
  const isTablet = breakpoint === 'tablet';
  // F32.4: el state arranca hidratado con el último valor persistido en
  // localStorage para este uid (ver usePreferences), así que el AND-gate
  // sobre prefsLoaded de F31 (D7) deja de ser necesario para sidebarHidden.
  // Los demás campos siguen usando isLoaded gate dentro de sus consumers.
  const sidebarHiddenEffective = preferences.sidebarHidden;
  const showSidebar = !isMobile && !(breakpoint === 'desktop' && sidebarHiddenEffective);
  const showTopBar = breakpoint === 'desktop' && sidebarHiddenEffective;

  return (
    <StoreHydrationProvider value={{ isHydrating }}>
      <CommandPaletteProvider>
        <QuickCaptureProvider>
          <div className="flex h-screen bg-background text-foreground">
            {showSidebar && (
              <Sidebar
                user={user}
                onSignOut={signOut}
                collapsed={isTablet}
                onExpandClick={isTablet ? () => setDrawerOpen(true) : undefined}
                animateEntry={animateLayoutSwap}
              />
            )}
            <div className="flex flex-1 flex-col overflow-hidden">
              {showTopBar && <TopBar animateEntry={animateLayoutSwap} />}
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

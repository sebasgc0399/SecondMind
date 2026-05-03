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
import UpdateBanner from '@/components/layout/UpdateBanner';
import useAuth from '@/hooks/useAuth';
import useHideSplashWhenReady from '@/hooks/useHideSplashWhenReady';
import { useBreakpoint } from '@/hooks/useMediaQuery';
import useMountedTransition from '@/hooks/useMountedTransition';
import usePreferences from '@/hooks/usePreferences';
import useShareIntent from '@/hooks/useShareIntent';
import useSidebarVisibilityShortcut from '@/hooks/useSidebarVisibilityShortcut';
import useVersionCheck from '@/hooks/useVersionCheck';
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
  useHideSplashWhenReady({ isLoading, user, isHydrating });
  useSidebarVisibilityShortcut();
  useVersionCheck();

  const isMobile = breakpoint === 'mobile';
  const isTablet = breakpoint === 'tablet';
  // F32.4: el state arranca hidratado con el último valor persistido en
  // localStorage para este uid (ver usePreferences), así que el AND-gate
  // sobre prefsLoaded de F31 (D7) deja de ser necesario para sidebarHidden.
  // Los demás campos siguen usando isLoaded gate dentro de sus consumers.
  const sidebarHiddenEffective = preferences.sidebarHidden;
  const showSidebar = !isMobile && !(breakpoint === 'desktop' && sidebarHiddenEffective);
  const showTopBar = breakpoint === 'desktop' && sidebarHiddenEffective;

  // F33.1: retarda el unmount 200ms para que el saliente alcance a
  // ejecutar animate-out slide-out-to-X. shouldRender controla mount;
  // isExiting controla la clase de salida. Skip-initial gratis: en mount
  // inicial con visible=false (post-hint F32.4 con sidebarHidden=true),
  // shouldRender arranca false sin disparar timer parásito. Ver SPEC F33 D7.
  const sidebarTransition = useMountedTransition(showSidebar, 200);
  const topBarTransition = useMountedTransition(showTopBar, 200);

  // Animación toggle-only del entry-anim del entrante (F32.3): el mount
  // inicial (page load) NO anima — clave porque post-F32.4 el layout
  // arranca hidratado con el último valor persistido y un animate-in fijo
  // dispararía un slide-in en cada carga. Solo cambios subsecuentes de
  // preferences.sidebarHidden (toggle interactivo o snapshot post-hint
  // stale) animan la entrada del componente que monta.
  //
  // useLayoutEffect (no useEffect): el setState debe correr ANTES del
  // paint para que el componente entrante reciba la clase animate-in en
  // su PRIMER render visible. Con useEffect, el componente paint sin
  // clase y luego recibe la clase ~30ms después → blip visual donde el
  // elemento aparece en posición final y luego retro-anima.
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

  return (
    <StoreHydrationProvider value={{ isHydrating }}>
      <CommandPaletteProvider>
        <QuickCaptureProvider>
          <div className="relative flex h-screen overflow-x-hidden bg-background text-foreground">
            {sidebarTransition.shouldRender && (
              <Sidebar
                user={user}
                onSignOut={signOut}
                collapsed={isTablet}
                onExpandClick={isTablet ? () => setDrawerOpen(true) : undefined}
                animateEntry={animateLayoutSwap && sidebarTransition.justMounted}
                animateExit={sidebarTransition.isExiting}
                floating={!isMobile && !isTablet}
              />
            )}
            <div
              className="flex flex-1 flex-col overflow-hidden transition-[padding-left] duration-200"
              style={{
                paddingLeft: !isMobile && !isTablet && showSidebar ? '16rem' : '0',
              }}
            >
              <UpdateBanner />
              {topBarTransition.shouldRender && (
                <TopBar
                  animateEntry={animateLayoutSwap && topBarTransition.justMounted}
                  animateExit={topBarTransition.isExiting}
                />
              )}
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

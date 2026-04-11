import { Navigate, Outlet } from 'react-router';
import useAuth from '@/hooks/useAuth';
import useStoreInit from '@/hooks/useStoreInit';
import Sidebar from '@/components/layout/Sidebar';

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
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar user={user} onSignOut={signOut} />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}

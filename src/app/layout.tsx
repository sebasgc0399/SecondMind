import useAuth from '@/hooks/useAuth';
import useStoreInit from '@/hooks/useStoreInit';
import Sidebar from '@/components/layout/Sidebar';
import LoginPage from '@/app/login/page';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, isLoading, signIn, signOut } = useAuth();
  useStoreInit(user?.uid ?? null);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onSignIn={signIn} />;
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar user={user} onSignOut={signOut} />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}

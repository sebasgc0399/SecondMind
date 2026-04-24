import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import useAuth from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const { user, isLoading, signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  if (isLoading || user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-56 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-11 w-48 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">SecondMind</h1>
          <p className="text-muted-foreground">Tu segundo cerebro digital</p>
        </div>
        <Button onClick={signIn} size="lg" className="gap-2">
          Sign in with Google
        </Button>
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import useAuth from '@/hooks/useAuth';
import LoginCard from '@/components/auth/LoginCard';

export default function LoginPage() {
  const { user, isLoading } = useAuth();
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
          <div className="h-10 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-56 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-[360px] w-full max-w-md animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[75%]"
        style={{
          background:
            'radial-gradient(ellipse 55% 42% at 50% 8%, color-mix(in oklch, var(--primary) 45%, transparent) 0%, transparent 65%)',
        }}
      />

      <div className="mb-10 flex flex-col items-center gap-3 text-center">
        <img src="/favicon.svg" alt="" aria-hidden className="h-20 w-20 md:h-24 md:w-24" />
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">SecondMind</h1>
        <p className="text-muted-foreground">Tu segundo cerebro digital</p>
      </div>

      <LoginCard />
    </div>
  );
}

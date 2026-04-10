import { Button } from '@/components/ui/button';

interface LoginPageProps {
  onSignIn: () => Promise<void>;
}

export default function LoginPage({ onSignIn }: LoginPageProps) {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">SecondMind</h1>
          <p className="text-muted-foreground">Tu segundo cerebro digital</p>
        </div>
        <Button onClick={onSignIn} size="lg" className="gap-2">
          Sign in with Google
        </Button>
      </div>
    </div>
  );
}

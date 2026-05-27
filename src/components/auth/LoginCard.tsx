import { useState } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import SignInForm from './SignInForm';
import GoogleSignInButton from './GoogleSignInButton';

type TabValue = 'signin' | 'signup';

export default function LoginCard() {
  const [tab, setTab] = useState<TabValue>('signin');
  const [error, setError] = useState('');

  return (
    <div className="w-full max-w-md">
      <div className="relative rounded-2xl border border-border-strong bg-popover p-6 shadow-modal backdrop-blur-md md:p-8">
        <Tabs.Root value={tab} onValueChange={(value) => setTab(value as TabValue)}>
          <Tabs.List className="relative mb-6 flex gap-1 border-b border-border">
            <Tabs.Tab
              value="signin"
              className="relative flex h-10 flex-1 items-center justify-center px-4 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground data-selected:text-foreground"
            >
              Iniciar sesión
            </Tabs.Tab>
            <Tabs.Tab
              value="signup"
              className="relative flex h-10 flex-1 items-center justify-center px-4 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground data-selected:text-foreground"
            >
              Crear cuenta
            </Tabs.Tab>
            <Tabs.Indicator className="absolute bottom-[-1px] left-0 h-[2px] w-(--active-tab-width) translate-x-(--active-tab-left) bg-primary transition-[translate,width] duration-200 ease-out" />
          </Tabs.List>

          <Tabs.Panel value="signin" className="outline-none">
            <SignInForm onError={setError} />
          </Tabs.Panel>

          <Tabs.Panel value="signup" className="outline-none">
            <div className="py-8 text-center text-sm text-muted-foreground">
              Disponible próximamente.
            </div>
          </Tabs.Panel>
        </Tabs.Root>

        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-6 mb-4 flex items-center gap-3 text-xs tracking-wider text-muted-foreground uppercase">
          <div className="h-px flex-1 bg-border" />
          o continuá con
          <div className="h-px flex-1 bg-border" />
        </div>

        <GoogleSignInButton onError={setError} />
      </div>
    </div>
  );
}

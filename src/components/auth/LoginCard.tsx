import { useState } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { cn } from '@/lib/utils';
import useMountedTransition from '@/hooks/useMountedTransition';
import SignInForm from './SignInForm';
import SignUpForm from './SignUpForm';
import ResetPasswordForm from './ResetPasswordForm';
import GoogleSignInButton from './GoogleSignInButton';
import SignupCapacityGate from './SignupCapacityGate';

type TabValue = 'signin' | 'signup';
type Mode = 'tabs' | 'reset';

export default function LoginCard() {
  const [tab, setTab] = useState<TabValue>('signin');
  const [mode, setMode] = useState<Mode>('tabs');
  const [error, setError] = useState('');

  // Switch tabs ↔ reset con anim 200ms. Grid 1x1 hace overlap durante
  // los 200ms de exit+entry. fill-mode-forwards en exit obligatorio
  // (sin él el saliente revierte mid-vuelo a translateX(0), gotcha F33/F35).
  const tabsTransition = useMountedTransition(mode === 'tabs', 200);
  const resetTransition = useMountedTransition(mode === 'reset', 200);

  function handleForgotPassword() {
    setError('');
    setMode('reset');
  }

  function handleBackFromReset() {
    setError('');
    setMode('tabs');
  }

  return (
    <div className="w-full max-w-md">
      <div className="relative rounded-2xl border border-border-strong bg-popover p-6 shadow-modal backdrop-blur-md md:p-8">
        <div className="grid grid-cols-1 grid-rows-1">
          {tabsTransition.shouldRender && (
            <div
              className={cn(
                'col-start-1 row-start-1',
                tabsTransition.justMounted &&
                  mode === 'tabs' &&
                  'animate-in fade-in slide-in-from-left-2 duration-200',
                tabsTransition.isExiting &&
                  'animate-out fade-out slide-out-to-left-2 fill-mode-forwards duration-200',
              )}
            >
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
                  <SignInForm onError={setError} onForgotPassword={handleForgotPassword} />
                </Tabs.Panel>

                <Tabs.Panel value="signup" className="outline-none">
                  <SignupCapacityGate>
                    <SignUpForm onError={setError} />
                  </SignupCapacityGate>
                </Tabs.Panel>
              </Tabs.Root>
            </div>
          )}

          {resetTransition.shouldRender && (
            <div
              className={cn(
                'col-start-1 row-start-1',
                resetTransition.justMounted &&
                  mode === 'reset' &&
                  'animate-in fade-in slide-in-from-right-2 duration-200',
                resetTransition.isExiting &&
                  'animate-out fade-out slide-out-to-right-2 fill-mode-forwards duration-200',
              )}
            >
              <ResetPasswordForm onBack={handleBackFromReset} />
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}

        {mode === 'tabs' && (
          <>
            <div className="mt-6 mb-4 flex items-center gap-3 text-xs tracking-wider text-muted-foreground uppercase">
              <div className="h-px flex-1 bg-border" />
              o continuá con
              <div className="h-px flex-1 bg-border" />
            </div>

            <GoogleSignInButton onError={setError} />
          </>
        )}
      </div>
    </div>
  );
}

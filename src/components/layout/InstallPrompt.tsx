import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useInstallPrompt from '@/hooks/useInstallPrompt';

export default function InstallPrompt() {
  const { isInstallable, promptInstall, dismiss } = useInstallPrompt();

  if (!isInstallable) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-lg sm:left-auto sm:right-4 sm:translate-x-0">
      <Download className="h-5 w-5 shrink-0 text-primary" />
      <p className="flex-1 text-sm text-foreground">
        Instalar SecondMind para acceso directo desde tu dispositivo.
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" onClick={() => void promptInstall()}>
          Instalar
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Cerrar">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

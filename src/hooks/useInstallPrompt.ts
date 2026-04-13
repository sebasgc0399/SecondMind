import { useCallback, useEffect, useRef, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface UseInstallPromptReturn {
  isInstallable: boolean;
  promptInstall: () => Promise<void>;
  dismiss: () => void;
}

const STORAGE_KEY = 'secondmind-install-dismissed';

export default function useInstallPrompt(): UseInstallPromptReturn {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === 'true') return;

    function handleBeforeInstall(event: Event) {
      event.preventDefault();
      deferredPrompt.current = event as BeforeInstallPromptEvent;
      setIsInstallable(true);
    }

    function handleAppInstalled() {
      deferredPrompt.current = null;
      setIsInstallable(false);
      localStorage.setItem(STORAGE_KEY, 'true');
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const prompt = deferredPrompt.current;
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
    deferredPrompt.current = null;
    setIsInstallable(false);
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    deferredPrompt.current = null;
    setIsInstallable(false);
  }, []);

  return { isInstallable, promptInstall, dismiss };
}

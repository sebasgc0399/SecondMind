import { useEffect } from 'react';
import { hideSplash } from '@/lib/splash';

// El system splash se oculta apenas Layout monta, NO al final del bootstrap.
// Si esperáramos a !isLoading + stores hidratados, el system splash taparía
// el AppBootSplash branded durante todo el boot y el handoff se vería como
// un solo frame imperceptible. El timeout 5s en main.tsx cubre el caso de
// crash pre-mount.
export default function useHideSplashWhenReady(): void {
  useEffect(() => {
    void hideSplash();
  }, []);
}

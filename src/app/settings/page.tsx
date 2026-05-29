import { useEffect } from 'react';
import { useLocation } from 'react-router';
import ApiKeysSection from '@/components/settings/ApiKeysSection';
import AppInfoSection from '@/components/settings/AppInfoSection';
import SidebarVisibilitySelector from '@/components/settings/SidebarVisibilitySelector';
import ThemeSelector from '@/components/settings/ThemeSelector';
import TrashAutoPurgeSelector from '@/components/settings/TrashAutoPurgeSelector';

export default function SettingsPage() {
  const location = useLocation();

  useEffect(() => {
    const hash = location.hash.slice(1);
    if (!hash) return;
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [location.key, location.hash]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="hidden md:block">
        <h1 className="text-2xl font-bold tracking-tight">Ajustes</h1>
        <p className="mt-1 text-muted-foreground">Configuración de cuenta y preferencias.</p>
      </header>

      <section aria-labelledby="appearance-heading">
        <div className="mb-3">
          <h2 id="appearance-heading" className="text-sm font-semibold text-foreground">
            Apariencia
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Elegí el modo de color. Automático sigue la preferencia del sistema.
          </p>
        </div>
        <ThemeSelector />
      </section>

      <section aria-labelledby="sidebar-visibility-heading" className="hidden lg:block">
        <div className="mb-3">
          <h2 id="sidebar-visibility-heading" className="text-sm font-semibold text-foreground">
            Visibilidad del menú
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Elegí si el menú lateral aparece o se oculta para maximizar espacio. Aplica solo a
            pantallas grandes.
          </p>
        </div>
        <SidebarVisibilitySelector />
      </section>

      <section id="trash" aria-labelledby="trash-heading" className="scroll-mt-14">
        <div className="mb-3">
          <h2 id="trash-heading" className="text-sm font-semibold text-foreground">
            Papelera de notas
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tiempo en la papelera antes de eliminar definitivamente. La limpieza ocurre una vez al
            día.
          </p>
        </div>
        <TrashAutoPurgeSelector />
      </section>

      <section id="api-keys" aria-labelledby="api-keys-heading" className="scroll-mt-14">
        <div className="mb-3">
          <h2 id="api-keys-heading" className="text-sm font-semibold text-foreground">
            Proveedores de IA
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Configurá tu propia API key para habilitar la clasificación del inbox y el auto-tagging
            con IA. Se guarda cifrada y solo la usan tus Cloud Functions.
          </p>
        </div>
        <ApiKeysSection />
      </section>

      <AppInfoSection />
    </div>
  );
}

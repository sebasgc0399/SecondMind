import AppInfoSection from '@/components/settings/AppInfoSection';
import ThemeSelector from '@/components/settings/ThemeSelector';

export default function SettingsPage() {
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

      <AppInfoSection />
    </div>
  );
}

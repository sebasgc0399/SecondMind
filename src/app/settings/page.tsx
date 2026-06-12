import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import ApiKeysSection from '@/components/settings/ApiKeysSection';
import AppInfoSection from '@/components/settings/AppInfoSection';
import LanguageSelector from '@/components/settings/LanguageSelector';
import SidebarVisibilitySelector from '@/components/settings/SidebarVisibilitySelector';
import ThemeSelector from '@/components/settings/ThemeSelector';
import TrashAutoPurgeSelector from '@/components/settings/TrashAutoPurgeSelector';

export default function SettingsPage() {
  const { t } = useTranslation();
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
        <h1 className="text-2xl font-bold tracking-tight">{t('settings.title', 'Ajustes')}</h1>
        <p className="mt-1 text-muted-foreground">
          {t('settings.subtitle', 'Configuración de cuenta y preferencias.')}
        </p>
      </header>

      <section aria-labelledby="appearance-heading">
        <div className="mb-3">
          <h2 id="appearance-heading" className="text-sm font-semibold text-foreground">
            {t('settings.appearance.title', 'Apariencia')}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(
              'settings.appearance.description',
              'Elegí el modo de color. Automático sigue la preferencia del sistema.',
            )}
          </p>
        </div>
        <ThemeSelector />
      </section>

      <section id="language" aria-labelledby="language-heading" className="scroll-mt-14">
        <div className="mb-3">
          <h2 id="language-heading" className="text-sm font-semibold text-foreground">
            {t('settings.language.title', 'Idioma')}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(
              'settings.language.description',
              'Elegí el idioma de la interfaz. Los textos generados por la IA siguen esta preferencia.',
            )}
          </p>
        </div>
        <LanguageSelector />
      </section>

      <section aria-labelledby="sidebar-visibility-heading" className="hidden lg:block">
        <div className="mb-3">
          <h2 id="sidebar-visibility-heading" className="text-sm font-semibold text-foreground">
            {t('settings.sidebar.title', 'Visibilidad del menú')}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(
              'settings.sidebar.description',
              'Elegí si el menú lateral aparece o se oculta para maximizar espacio. Aplica solo a pantallas grandes.',
            )}
          </p>
        </div>
        <SidebarVisibilitySelector />
      </section>

      <section id="trash" aria-labelledby="trash-heading" className="scroll-mt-14">
        <div className="mb-3">
          <h2 id="trash-heading" className="text-sm font-semibold text-foreground">
            {t('settings.trash.title', 'Papelera de notas')}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(
              'settings.trash.description',
              'Tiempo en la papelera antes de eliminar definitivamente. La limpieza ocurre una vez al día.',
            )}
          </p>
        </div>
        <TrashAutoPurgeSelector />
      </section>

      <section id="api-keys" aria-labelledby="api-keys-heading" className="scroll-mt-14">
        <div className="mb-3">
          <h2 id="api-keys-heading" className="text-sm font-semibold text-foreground">
            {t('settings.apiKeys.title', 'Proveedores de IA')}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(
              'settings.apiKeys.description',
              'Configurá tu propia API key para habilitar la clasificación del inbox y el auto-tagging con IA. Se guarda cifrada y solo la usan tus Cloud Functions.',
            )}
          </p>
        </div>
        <ApiKeysSection />
      </section>

      <AppInfoSection />
    </div>
  );
}

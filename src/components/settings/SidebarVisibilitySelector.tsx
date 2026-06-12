import { PanelLeft, PanelLeftClose } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useAuth from '@/hooks/useAuth';
import usePreferences from '@/hooks/usePreferences';
import { setPreferences } from '@/lib/preferences';

interface Option {
  value: boolean;
  label: string;
  description: string;
  Icon: typeof PanelLeft;
}

export default function SidebarVisibilitySelector() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const current = preferences.sidebarHidden;

  // OPTIONS adentro del componente con keys literales (re-render en el switch
  // + visibles para el extract). F58 F1.5.
  const OPTIONS: readonly Option[] = [
    {
      value: false,
      label: t('settings.sidebar.visible.label', 'Visible'),
      description: t(
        'settings.sidebar.visible.description',
        'El menú lateral aparece en pantallas grandes.',
      ),
      Icon: PanelLeft,
    },
    {
      value: true,
      label: t('settings.sidebar.hidden.label', 'Oculto'),
      description: t(
        'settings.sidebar.hidden.description',
        'Maximiza espacio. Usá Cmd/Ctrl+B o Cmd/Ctrl+K para navegar.',
      ),
      Icon: PanelLeftClose,
    },
  ] as const;

  function handleSelect(value: boolean) {
    if (!user || value === current) return;
    void setPreferences(user.uid, { sidebarHidden: value });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {OPTIONS.map(({ value, label, description, Icon }) => {
        const isActive = current === value;
        return (
          <button
            key={String(value)}
            type="button"
            onClick={() => handleSelect(value)}
            aria-pressed={isActive}
            className={`group flex min-h-[100px] flex-col gap-2 rounded-lg border p-3 text-left transition-all ${
              isActive
                ? 'border-primary bg-accent/40 ring-2 ring-primary/30'
                : 'border-border bg-card hover:border-border/80 hover:bg-accent/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium text-foreground">{label}</span>
              {isActive && (
                <span className="ml-auto text-[10px] uppercase tracking-wide text-primary">
                  {t('common.activeBadge', 'activo')}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
          </button>
        );
      })}
    </div>
  );
}

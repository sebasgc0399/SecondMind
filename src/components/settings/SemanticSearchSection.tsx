import { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useSemanticSearchToggle from '@/hooks/useSemanticSearchToggle';
import SemanticConsentModal from '@/components/search/SemanticConsentModal';

interface Option {
  value: boolean;
  label: string;
  description: string;
  Icon: typeof Search;
}

// SPEC-66 F5 — toggle de la búsqueda semántica en Ajustes (entrada alternativa a
// la activación, además del banner de búsqueda). Mismo árbol D5/D6 que el banner:
// activar sin reconocimiento previo abre el modal; ya reconocido (D6) activa
// directo; desactivar dispara la purga server-side (trigger F7). Patrón
// grid-button de SidebarVisibilitySelector.
export default function SemanticSearchSection() {
  const { t } = useTranslation();
  const { enabled, acknowledged, busy, enable, disable } = useSemanticSearchToggle();
  const [modalOpen, setModalOpen] = useState(false);

  const OPTIONS: readonly Option[] = [
    {
      value: false,
      label: t('settings.semanticSearch.off.label', 'Desactivada'),
      description: t(
        'settings.semanticSearch.off.description',
        'Solo búsqueda por palabras clave, 100% en tu dispositivo.',
      ),
      Icon: Search,
    },
    {
      value: true,
      label: t('settings.semanticSearch.on.label', 'Activada'),
      description: t(
        'settings.semanticSearch.on.description',
        'Encontrá notas por significado, además de por palabras clave.',
      ),
      Icon: Sparkles,
    },
  ] as const;

  function handleSelect(value: boolean) {
    if (busy || value === enabled) return;
    if (value) {
      // Activar: primer cruce → modal de reconocimiento; ya reconocido → directo (D6).
      if (acknowledged) void enable();
      else setModalOpen(true);
    } else {
      void disable();
    }
  }

  function handleAccept() {
    setModalOpen(false);
    void enable();
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPTIONS.map(({ value, label, description, Icon }) => {
          const isActive = enabled === value;
          return (
            <button
              key={String(value)}
              type="button"
              onClick={() => handleSelect(value)}
              disabled={busy}
              aria-pressed={isActive}
              className={`group flex min-h-[100px] flex-col gap-2 rounded-lg border p-3 text-left transition-all disabled:opacity-60 ${
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

      <SemanticConsentModal open={modalOpen} onOpenChange={setModalOpen} onAccept={handleAccept} />
    </>
  );
}

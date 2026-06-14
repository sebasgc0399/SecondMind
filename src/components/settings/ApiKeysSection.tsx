import { useState } from 'react';
import { CheckCircle2, ExternalLink, Key } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useApiKeys from '@/hooks/useApiKeys';
import { mapCfError } from '@/lib/cfError';

export default function ApiKeysSection() {
  const { t } = useTranslation();
  const { apiKeys, isLoaded, saving, error, saveKey, removeKey } = useApiKeys();
  const [inputKey, setInputKey] = useState('');

  const anthropic = apiKeys.anthropic;

  async function handleSave() {
    const trimmed = inputKey.trim();
    if (!trimmed) return;
    const ok = await saveKey('anthropic', trimmed);
    if (ok) setInputKey('');
  }

  // Skeleton mientras carga el metadata (no spinner, evita layout shift).
  if (!isLoaded) {
    return <div className="h-28 animate-pulse rounded-lg border border-border bg-card" />;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Key className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium text-foreground">
          {t('settings.apiKeys.provider', 'Anthropic (Claude)')}
        </span>
        {anthropic.configured && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {t('settings.apiKeys.configured', 'Configurada')}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {t(
          'settings.apiKeys.help',
          'Habilita la clasificación del inbox y el auto-tagging de notas con IA.',
        )}
      </p>

      {anthropic.configured ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <code className="rounded bg-muted/60 px-2 py-1 text-xs text-foreground">
            {t('settings.apiKeys.maskedKey', 'sk-ant-…{{last4}}', { last4: anthropic.last4 })}
          </code>
          <button
            type="button"
            onClick={() => void removeKey('anthropic')}
            disabled={saving}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground disabled:opacity-50"
          >
            {t('settings.apiKeys.remove', 'Borrar')}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="password"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSave();
            }}
            placeholder="sk-ant-…"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !inputKey.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving
              ? t('settings.apiKeys.validating', 'Validando…')
              : t('settings.apiKeys.save', 'Guardar')}
          </button>
        </div>
      )}

      {error != null && <p className="mt-2 text-xs text-destructive">{mapCfError(error, t)}</p>}

      <a
        href="https://console.anthropic.com/settings/keys"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        {t('settings.apiKeys.getKeyLink', 'Obtené tu API key en console.anthropic.com')}
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    </div>
  );
}

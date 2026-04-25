import { Trash2 } from 'lucide-react';
import useAuth from '@/hooks/useAuth';
import usePreferences from '@/hooks/usePreferences';
import { setPreferences } from '@/lib/preferences';
import type { UserPreferences } from '@/types/preferences';

interface Option {
  value: UserPreferences['trashAutoPurgeDays'];
  label: string;
  description: string;
}

const OPTIONS: readonly Option[] = [
  { value: 0, label: 'Nunca', description: 'Las notas eliminadas no se borran nunca solas.' },
  { value: 7, label: '7 días', description: 'Limpieza semanal automática.' },
  { value: 15, label: '15 días', description: 'Equilibrio entre tiempo y espacio.' },
  { value: 30, label: '30 días', description: 'Mantiene las notas el mayor tiempo posible.' },
] as const;

export default function TrashAutoPurgeSelector() {
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const current = preferences.trashAutoPurgeDays;

  function handleSelect(value: UserPreferences['trashAutoPurgeDays']) {
    if (!user || value === current) return;
    void setPreferences(user.uid, { trashAutoPurgeDays: value });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
      {OPTIONS.map(({ value, label, description }) => {
        const isActive = current === value;
        return (
          <button
            key={value}
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
              <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium text-foreground">{label}</span>
              {isActive && (
                <span className="ml-auto text-[10px] uppercase tracking-wide text-primary">
                  activo
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

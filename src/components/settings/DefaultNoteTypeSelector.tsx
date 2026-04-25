import { FileText } from 'lucide-react';
import useAuth from '@/hooks/useAuth';
import usePreferences from '@/hooks/usePreferences';
import { setPreferences } from '@/lib/preferences';
import type { NoteType } from '@/types/common';

interface Option {
  value: NoteType;
  label: string;
  description: string;
}

const OPTIONS: readonly Option[] = [
  { value: 'fleeting', label: 'Fugaz', description: 'Ideas rápidas y notas sin procesar.' },
  {
    value: 'literature',
    label: 'Literatura',
    description: 'Notas de lectura y referencias externas.',
  },
  {
    value: 'permanent',
    label: 'Permanente',
    description: 'Ideas desarrolladas y conocimiento consolidado.',
  },
] as const;

export default function DefaultNoteTypeSelector() {
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const current = preferences.defaultNoteType;

  function handleSelect(value: NoteType) {
    if (!user || value === current) return;
    void setPreferences(user.uid, { defaultNoteType: value });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
              <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
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

import { Monitor, Moon, Sun } from 'lucide-react';
import useTheme from '@/hooks/useTheme';
import { systemPrefersDark, type Theme } from '@/lib/theme';

interface Option {
  value: Theme;
  label: string;
  Icon: typeof Sun;
  preview: 'light' | 'dark' | 'auto';
}

const OPTIONS: readonly Option[] = [
  { value: 'light', label: 'Claro', Icon: Sun, preview: 'light' },
  { value: 'auto', label: 'Automático', Icon: Monitor, preview: 'auto' },
  { value: 'dark', label: 'Oscuro', Icon: Moon, preview: 'dark' },
] as const;

function Preview({ variant }: { variant: 'light' | 'dark' | 'auto' }) {
  if (variant === 'auto') {
    return (
      <div className="relative h-16 w-full overflow-hidden rounded-md border border-border">
        <div className="absolute inset-0 bg-white">
          <div className="mx-2 mt-2 h-1.5 w-8 rounded-full bg-neutral-300" />
          <div className="mx-2 mt-1.5 h-1 w-12 rounded-full bg-neutral-200" />
          <div className="mx-2 mt-1 h-1 w-10 rounded-full bg-neutral-200" />
        </div>
        <div
          className="absolute inset-0 bg-neutral-900"
          style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
        >
          <div className="absolute right-2 top-2 h-1.5 w-8 rounded-full bg-neutral-600" />
          <div className="absolute right-2 top-[14px] h-1 w-12 rounded-full bg-neutral-700" />
          <div className="absolute right-2 top-[22px] h-1 w-10 rounded-full bg-neutral-700" />
        </div>
      </div>
    );
  }
  const isDark = variant === 'dark';
  return (
    <div
      className={`h-16 w-full overflow-hidden rounded-md border border-border ${
        isDark ? 'bg-neutral-900' : 'bg-white'
      }`}
    >
      <div
        className={`mx-2 mt-2 h-1.5 w-8 rounded-full ${isDark ? 'bg-neutral-600' : 'bg-neutral-300'}`}
      />
      <div
        className={`mx-2 mt-1.5 h-1 w-12 rounded-full ${
          isDark ? 'bg-neutral-700' : 'bg-neutral-200'
        }`}
      />
      <div
        className={`mx-2 mt-1 h-1 w-10 rounded-full ${
          isDark ? 'bg-neutral-700' : 'bg-neutral-200'
        }`}
      />
    </div>
  );
}

export default function ThemeSelector() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const autoResolvedLabel = systemPrefersDark() ? 'oscuro' : 'claro';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {OPTIONS.map(({ value, label, Icon, preview }) => {
        const isActive = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={isActive}
            className={`group flex min-h-[112px] flex-col gap-3 rounded-lg border p-3 text-left transition-all ${
              isActive
                ? 'border-primary bg-accent/40 ring-2 ring-primary/30'
                : 'border-border bg-card hover:border-border/80 hover:bg-accent/40'
            }`}
          >
            <Preview variant={preview} />
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium text-foreground">{label}</span>
              {isActive && value === 'auto' && (
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                  {autoResolvedLabel}
                </span>
              )}
              {isActive && value !== 'auto' && resolvedTheme && (
                <span className="ml-auto text-[10px] uppercase tracking-wide text-primary">
                  activo
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

import { useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import type { GraphFilters as GraphFiltersType } from '@/hooks/useGraph';
import { DEFAULT_FILTERS } from '@/hooks/useGraph';
import type { ParaType, NoteType } from '@/types/common';

interface GraphFiltersProps {
  filters: GraphFiltersType;
  onChange: (filters: GraphFiltersType) => void;
}

const PARA_OPTIONS: { value: ParaType | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'project', label: 'Proyecto' },
  { value: 'area', label: 'Area' },
  { value: 'resource', label: 'Recurso' },
  { value: 'archive', label: 'Archivo' },
];

const NOTE_TYPE_OPTIONS: { value: NoteType | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'fleeting', label: 'Fleeting' },
  { value: 'literature', label: 'Literature' },
  { value: 'permanent', label: 'Permanent' },
];

function isFiltered(filters: GraphFiltersType): boolean {
  return (
    filters.paraType !== DEFAULT_FILTERS.paraType ||
    filters.noteType !== DEFAULT_FILTERS.noteType ||
    filters.minLinks !== DEFAULT_FILTERS.minLinks
  );
}

export default function GraphFilters({ filters, onChange }: GraphFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasFilters = isFiltered(filters);

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground md:px-6"
      >
        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        Filtros
        {hasFilters && (
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
            activos
          </span>
        )}
      </button>

      {isOpen && (
        <div className="flex flex-wrap items-end gap-3 px-4 pb-3 md:gap-4 md:px-6">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Area</span>
            <select
              value={filters.paraType}
              onChange={(e) =>
                onChange({ ...filters, paraType: e.target.value as ParaType | 'all' })
              }
              className="rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
            >
              {PARA_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Tipo</span>
            <select
              value={filters.noteType}
              onChange={(e) =>
                onChange({ ...filters, noteType: e.target.value as NoteType | 'all' })
              }
              className="rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
            >
              {NOTE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Links min</span>
            <input
              type="number"
              min={0}
              value={filters.minLinks}
              onChange={(e) =>
                onChange({ ...filters, minLinks: Math.max(0, parseInt(e.target.value) || 0) })
              }
              className="w-20 rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
            />
          </label>

          {hasFilters && (
            <button
              type="button"
              onClick={() => onChange(DEFAULT_FILTERS)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Resetear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import useInbox from '@/hooks/useInbox';
import InboxProcessorForm from '@/components/capture/InboxProcessorForm';
import type { ConvertOverrides, InboxAiResult, InboxItem } from '@/types/inbox';

type ProcessedKind = 'note' | 'task' | 'project' | 'trash';

// Grace dedicado para esperar a que los persisters hidraten en full reload.
// El isInitializing de useInbox es un timer fijo de 200ms, no confiable para este uso.
const HYDRATION_GRACE_MS = 1500;

export default function InboxProcessorPage() {
  const { items, convertToNote, convertToTask, convertToProject, dismiss } = useInbox();
  const navigate = useNavigate();

  const [batch, setBatch] = useState<InboxItem[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [processedMarkers, setProcessedMarkers] = useState<Record<string, ProcessedKind>>({});

  // Inicializar el batch una sola vez. Si items tiene datos, snapshotear inmediato.
  // Si items está vacío, esperar HYDRATION_GRACE_MS por si los persisters están cargando.
  // El cleanup del timer se cancela si items cambia antes del timeout, garantizando
  // que el snapshot ocurre al primer render con datos.
  useEffect(() => {
    if (batch !== null) return;
    if (items.length > 0) {
      setBatch(items.filter((i) => i.status === 'pending'));
      return;
    }
    const timer = window.setTimeout(() => {
      setBatch(items.filter((i) => i.status === 'pending'));
    }, HYDRATION_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [items, batch]);

  const handleExit = useCallback(() => {
    navigate('/inbox');
  }, [navigate]);

  const advance = useCallback(() => {
    setCurrentIndex((i) => i + 1);
  }, []);

  const handleCreate = useCallback(
    async (edited: InboxAiResult) => {
      if (!batch) return;
      const item = batch[currentIndex];
      if (!item) return;

      const overrides: ConvertOverrides = {
        title: edited.suggestedTitle,
        area: edited.suggestedArea,
        priority: edited.priority,
        tags: edited.suggestedTags,
      };
      const opts = { skipNavigate: true };
      let kind: ProcessedKind = 'trash';

      switch (edited.suggestedType) {
        case 'note':
          await convertToNote(item.id, overrides, opts);
          kind = 'note';
          break;
        case 'task':
          await convertToTask(item.id, overrides, opts);
          kind = 'task';
          break;
        case 'project':
          await convertToProject(item.id, overrides, opts);
          kind = 'project';
          break;
        case 'trash':
        default:
          dismiss(item.id);
          kind = 'trash';
      }

      setProcessedMarkers((m) => ({ ...m, [item.id]: kind }));
      advance();
    },
    [batch, currentIndex, convertToNote, convertToTask, convertToProject, dismiss, advance],
  );

  const handleDismiss = useCallback(() => {
    if (!batch) return;
    const item = batch[currentIndex];
    if (!item) return;
    dismiss(item.id);
    setProcessedMarkers((m) => ({ ...m, [item.id]: 'trash' }));
    advance();
  }, [batch, currentIndex, dismiss, advance]);

  // Keyboard shortcuts globales
  useEffect(() => {
    if (!batch) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleExit();
        return;
      }
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (isEditable) return;
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        setCurrentIndex((i) => i - 1);
      }
      if (e.key === 'ArrowRight' && currentIndex < batch.length - 1) {
        e.preventDefault();
        setCurrentIndex((i) => i + 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [batch, currentIndex, handleExit]);

  // Estado: hidratando
  if (batch === null) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-lg border border-border bg-card p-10">
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-4 w-full animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  // Estado: inbox vacío desde el inicio
  if (batch.length === 0) {
    return <DoneScreen counts={{}} batchSize={0} initialEmpty />;
  }

  // Estado: terminamos todos los items
  if (currentIndex >= batch.length) {
    return <DoneScreen counts={processedMarkers} batchSize={batch.length} />;
  }

  const currentItem = batch[currentIndex];
  if (!currentItem) return null;

  const isProcessed = !!processedMarkers[currentItem.id];
  const processedAs = processedMarkers[currentItem.id];
  const isLast = currentIndex === batch.length - 1;
  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < batch.length - 1;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Procesando Inbox ·{' '}
          <span className="text-muted-foreground">
            {currentIndex + 1} de {batch.length}
          </span>
        </h1>
        <button
          type="button"
          onClick={handleExit}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          <X className="h-3 w-3" />
          Salir
        </button>
      </header>

      <div className="mb-4 rounded-lg border border-border bg-muted/20 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Contenido original
        </p>
        <p className="mt-2 text-sm whitespace-pre-wrap text-foreground">{currentItem.rawContent}</p>
      </div>

      <InboxProcessorForm
        key={currentItem.id}
        item={currentItem}
        isLast={isLast}
        isProcessed={isProcessed}
        processedAs={processedAs}
        onCreate={handleCreate}
        onDismiss={handleDismiss}
      />

      <nav className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setCurrentIndex((i) => i - 1)}
          disabled={!canGoBack}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft className="h-3 w-3" />
          Atrás
        </button>

        <ProgressDots
          total={batch.length}
          current={currentIndex}
          processedIds={new Set(Object.keys(processedMarkers))}
          batch={batch}
          onSelect={setCurrentIndex}
        />

        <button
          type="button"
          onClick={() => setCurrentIndex((i) => i + 1)}
          disabled={!canGoForward}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          Siguiente
          <ArrowRight className="h-3 w-3" />
        </button>
      </nav>
    </div>
  );
}

interface ProgressDotsProps {
  total: number;
  current: number;
  processedIds: Set<string>;
  batch: InboxItem[];
  onSelect: (index: number) => void;
}

function ProgressDots({ total, current, processedIds, batch, onSelect }: ProgressDotsProps) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => {
        const item = batch[i];
        const isCurrent = i === current;
        const isProcessed = item ? processedIds.has(item.id) : false;
        const className = isCurrent
          ? 'h-2 w-2 rounded-full bg-primary'
          : isProcessed
            ? 'h-2 w-2 rounded-full bg-primary/40'
            : 'h-2 w-2 rounded-full bg-muted';
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`Item ${i + 1} de ${total}`}
            className={className}
          />
        );
      })}
    </div>
  );
}

interface DoneScreenProps {
  counts: Record<string, string> | Record<string, number>;
  batchSize: number;
  initialEmpty?: boolean;
}

function DoneScreen({ counts, batchSize, initialEmpty }: DoneScreenProps) {
  const summary =
    batchSize === 0
      ? 'No tenés items pendientes.'
      : buildSummary(counts as Record<string, ProcessedKind> | Record<string, number>, batchSize);

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
        <p className="text-3xl font-semibold text-foreground">¡Inbox limpio! 🎉</p>
        <p className="mt-3 text-sm text-muted-foreground">{summary}</p>
        {initialEmpty && (
          <p className="mt-2 text-xs text-muted-foreground">
            Captura una idea con Alt+N desde cualquier pantalla.
          </p>
        )}
        <Link
          to="/"
          className="mt-6 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Volver al Dashboard
        </Link>
      </div>
    </div>
  );
}

function buildSummary(
  markers: Record<string, ProcessedKind> | Record<string, number>,
  batchSize: number,
): string {
  const counts: Record<ProcessedKind, number> = {
    note: 0,
    task: 0,
    project: 0,
    trash: 0,
  };

  // Si `markers` es un mapa itemId → ProcessedKind, agregamos. Si ya vino agregado, usamos
  // directo. Detectar: si algún valor es number, asumir pre-agregado.
  const values = Object.values(markers);
  const isAggregated = values.length > 0 && typeof values[0] === 'number';

  if (isAggregated) {
    for (const [key, value] of Object.entries(markers as Record<string, number>)) {
      if (key in counts) counts[key as ProcessedKind] = value;
    }
  } else {
    for (const kind of Object.values(markers as Record<string, ProcessedKind>)) {
      counts[kind] += 1;
    }
  }

  const parts: string[] = [];
  if (counts.note > 0) parts.push(`${counts.note} nota${counts.note > 1 ? 's' : ''}`);
  if (counts.task > 0) parts.push(`${counts.task} tarea${counts.task > 1 ? 's' : ''}`);
  if (counts.project > 0) parts.push(`${counts.project} proyecto${counts.project > 1 ? 's' : ''}`);
  if (counts.trash > 0) parts.push(`${counts.trash} descartado${counts.trash > 1 ? 's' : ''}`);

  if (parts.length === 0) return `Procesaste ${batchSize} item${batchSize > 1 ? 's' : ''}.`;
  return `Procesaste ${parts.join(', ')}.`;
}

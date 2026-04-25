import { useCallback, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Plus, Search, Network, Sparkles, Trash2, Settings } from 'lucide-react';
import { notesRepo } from '@/infra/repos/notesRepo';
import useAuth from '@/hooks/useAuth';
import useHybridSearch, { type SemanticResult } from '@/hooks/useHybridSearch';
import useTrashNotes from '@/hooks/useTrashNotes';
import usePreferences from '@/hooks/usePreferences';
import NoteCard from '@/components/editor/NoteCard';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { NoteOramaDoc } from '@/lib/orama';
import type { TrashNote } from '@/types/note';

type Filter = 'all' | 'favorites' | 'trash';

const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'favorites', label: 'Favoritas' },
  { key: 'trash', label: 'Papelera' },
];

// TrashNote tiene los mismos campos que NoteOramaDoc excepto isArchived
// (que en papelera es siempre false implícito). Mapeo trivial para que
// NoteCard reciba la shape canónica.
function trashNoteToOramaDoc(t: TrashNote): NoteOramaDoc {
  return {
    id: t.id,
    title: t.title,
    contentPlain: t.contentPlain,
    noteType: t.noteType,
    paraType: t.paraType,
    linkCount: t.linkCount,
    updatedAt: t.updatedAt,
    isArchived: false,
    isFavorite: t.isFavorite,
    deletedAt: t.deletedAt,
    distillLevel: t.distillLevel,
    aiSummary: '',
  };
}

export default function NotesListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const [trashQuery, setTrashQuery] = useState('');
  const { query, setQuery, keywordResults, semanticResults, isInitializing, isLoadingSemantic } =
    useHybridSearch();
  const {
    notes: trashNotes,
    count: trashCount,
    allIds: trashAllIds,
    isLoading: isTrashLoading,
  } = useTrashNotes({
    filter: trashQuery,
  });
  const { preferences } = usePreferences();
  const [isPurgeOpen, setIsPurgeOpen] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!user) return;
    // repo.createNote hace setRow (sync) + await setDoc (async) en orden
    // correcto. El await garantiza que Firestore terminó antes de navigate,
    // preservando el gotcha "useNote.getDoc en página destino necesita doc
    // presente en Firestore al momento de navegar".
    const newId = await notesRepo.createNote();
    if (!newId) return;
    navigate(`/notes/${newId}`);
  }, [navigate, user]);

  const hasQuery = query.trim().length > 0;
  const isTrashView = filter === 'trash';
  const isFavoritesView = filter === 'favorites';

  // Sort estable: cuando NO hay query, ancla favoritos al tope manteniendo
  // el orden interno de updatedAt desc que ya viene de useNoteSearch. Con
  // query activo respetamos el orden de relevancia de Orama (no resort).
  const displayedKeywordResults = useMemo<NoteOramaDoc[]>(() => {
    let list: NoteOramaDoc[] = isFavoritesView
      ? keywordResults.filter((n) => n.isFavorite)
      : keywordResults;
    if (!hasQuery) {
      list = [...list].sort((a, b) => {
        if (a.isFavorite === b.isFavorite) return 0;
        return a.isFavorite ? -1 : 1;
      });
    }
    return list;
  }, [keywordResults, isFavoritesView, hasQuery]);

  const showSearchSkeleton = !isTrashView && isInitializing && keywordResults.length === 0;
  const showKeywordEmpty =
    !isTrashView && !isInitializing && hasQuery && keywordResults.length === 0;
  const showAllNotesEmpty =
    filter === 'all' && !isInitializing && !hasQuery && keywordResults.length === 0;
  const showFavoritesEmpty =
    isFavoritesView &&
    !isInitializing &&
    !hasQuery &&
    displayedKeywordResults.length === 0 &&
    keywordResults.length > 0;
  const showTrashSkeleton = isTrashView && isTrashLoading && trashCount === 0;
  const showTrashEmpty = isTrashView && !isTrashLoading && trashCount === 0;
  const showTrashFilterEmpty =
    isTrashView && !isTrashLoading && trashCount > 0 && trashNotes.length === 0;

  const purgeDays = preferences.trashAutoPurgeDays;
  const trashCaption =
    purgeDays === 0
      ? 'Las notas en papelera no se eliminan automáticamente.'
      : `Las notas se eliminan definitivamente a los ${purgeDays} días.`;

  function handleConfirmPurge() {
    if (trashCount === 0) return;
    void notesRepo.purgeAll(trashAllIds);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="hidden text-2xl font-bold tracking-tight md:block">Notas</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/notes/graph"
            aria-label="Ver como grafo"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Network className="h-4 w-4" />
            <span className="hidden sm:inline">Ver como grafo</span>
          </Link>
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nueva nota</span>
            <span className="sm:hidden">Nueva</span>
          </button>
        </div>
      </header>

      <nav className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border">
        {TABS.map((tab) => {
          const isActive = tab.key === filter;
          const showCount = tab.key === 'trash' && trashCount > 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setFilter(tab.key);
                setQuery('');
                setTrashQuery('');
              }}
              className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors md:py-2 ${
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {showCount && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
                  {trashCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={isTrashView ? trashQuery : query}
            onChange={(event) =>
              isTrashView ? setTrashQuery(event.target.value) : setQuery(event.target.value)
            }
            placeholder={isTrashView ? 'Buscar en papelera...' : 'Buscar notas...'}
            className="w-full rounded-md border border-border bg-card py-2 pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-border/80"
          />
        </div>
      </div>

      {isTrashView && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{trashCaption}</span>
            <Link
              to="/settings#trash"
              className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
            >
              <Settings className="h-3 w-3" />
              Cambiar
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setIsPurgeOpen(true)}
            disabled={trashCount === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Vaciar papelera
          </button>
        </div>
      )}

      {(showSearchSkeleton || showTrashSkeleton) && <NoteListSkeleton />}

      {showAllNotesEmpty && <EmptyNotesState onCreate={handleCreate} />}
      {showFavoritesEmpty && <EmptyFavoritesState onClear={() => setFilter('all')} />}
      {showTrashEmpty && <EmptyTrashState onClear={() => setFilter('all')} />}
      {showTrashFilterEmpty && <EmptyTrashFilterState onClear={() => setTrashQuery('')} />}

      {!isTrashView && displayedKeywordResults.length > 0 && (
        <ul className="flex flex-col gap-3">
          {displayedKeywordResults.map((note) => (
            <li key={note.id}>
              <NoteCard note={note} />
            </li>
          ))}
        </ul>
      )}

      {isTrashView && trashNotes.length > 0 && (
        <ul className="flex flex-col gap-3">
          {trashNotes.map((tn) => (
            <li key={tn.id}>
              <NoteCard
                note={trashNoteToOramaDoc(tn)}
                mode="trash"
                daysUntilPurge={tn.daysUntilPurge}
              />
            </li>
          ))}
        </ul>
      )}

      {!isTrashView && hasQuery && (
        <SemanticSection
          results={semanticResults}
          isLoading={isLoadingSemantic}
          hasKeywordResults={keywordResults.length > 0}
          showKeywordEmpty={showKeywordEmpty}
        />
      )}

      <ConfirmDialog
        open={isPurgeOpen}
        onOpenChange={setIsPurgeOpen}
        title="¿Vaciar la papelera?"
        description={`Se eliminarán para siempre ${trashCount} ${
          trashCount === 1 ? 'nota' : 'notas'
        }, sus embeddings y los links que las mencionan. Esta acción no se puede deshacer.`}
        confirmLabel="Vaciar papelera"
        variant="destructive"
        onConfirm={handleConfirmPurge}
      />
    </div>
  );
}

interface SemanticSectionProps {
  results: SemanticResult[];
  isLoading: boolean;
  hasKeywordResults: boolean;
  showKeywordEmpty: boolean;
}

function SemanticSection({
  results,
  isLoading,
  hasKeywordResults,
  showKeywordEmpty,
}: SemanticSectionProps) {
  if (!isLoading && results.length === 0) {
    if (showKeywordEmpty) {
      return (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Sin resultados.</p>
        </div>
      );
    }
    return null;
  }

  return (
    <section className={hasKeywordResults ? 'mt-8' : 'mt-0'}>
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500" />
        <h2 className="text-sm font-semibold text-foreground">
          {hasKeywordResults ? 'Semánticamente similares' : 'Notas temáticamente similares'}
        </h2>
      </div>
      {!hasKeywordResults && !isLoading && results.length > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          No hay coincidencias exactas, pero estas notas son temáticamente similares.
        </p>
      )}
      {isLoading && <SemanticSkeleton />}
      {!isLoading && results.length > 0 && (
        <ul className="flex flex-col gap-3">
          {results.map(({ note, score }) => (
            <li key={note.id}>
              <NoteCard note={note} semanticScore={score} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SemanticSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-full animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function NoteListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-full animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function EmptyNotesState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <p className="text-sm text-muted-foreground">No tenés notas todavía.</p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" />
        Crear primera nota
      </button>
    </div>
  );
}

function EmptyFavoritesState({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <p className="text-sm text-muted-foreground">No tenés notas favoritas todavía.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Mostrar todas las notas
      </button>
    </div>
  );
}

function EmptyTrashState({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <Trash2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Tu papelera está vacía.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Volver a todas las notas
      </button>
    </div>
  );
}

function EmptyTrashFilterState({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">No se encontraron notas en la papelera.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Limpiar búsqueda
      </button>
    </div>
  );
}

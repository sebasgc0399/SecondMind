import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { doc, setDoc } from 'firebase/firestore';
import { Link } from 'react-router';
import { Plus, Search, Network, Sparkles } from 'lucide-react';
import { db } from '@/lib/firebase';
import { notesStore } from '@/stores/notesStore';
import useAuth from '@/hooks/useAuth';
import useHybridSearch, { type SemanticResult } from '@/hooks/useHybridSearch';
import NoteCard from '@/components/editor/NoteCard';

export default function NotesListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { query, setQuery, keywordResults, semanticResults, isInitializing, isLoadingSemantic } =
    useHybridSearch();

  const handleCreate = useCallback(async () => {
    if (!user) return;
    const newId = crypto.randomUUID();
    const now = Date.now();
    const defaults = {
      title: '',
      content: '',
      contentPlain: '',
      paraType: 'resource',
      noteType: 'fleeting',
      source: '',
      projectIds: '[]',
      areaIds: '[]',
      tagIds: '[]',
      outgoingLinkIds: '[]',
      incomingLinkIds: '[]',
      linkCount: 0,
      summaryL1: '',
      summaryL2: '',
      summaryL3: '',
      distillLevel: 0,
      aiTags: '[]',
      aiSummary: '',
      aiProcessed: false,
      createdAt: now,
      updatedAt: now,
      lastViewedAt: 0,
      viewCount: 0,
      isFavorite: false,
      isArchived: false,
    } as const;

    await setDoc(doc(db, 'users', user.uid, 'notes', newId), defaults);
    notesStore.setRow('notes', newId, defaults);
    navigate(`/notes/${newId}`);
  }, [navigate, user]);

  const hasQuery = query.trim().length > 0;
  const showSkeleton = isInitializing && keywordResults.length === 0;
  const showKeywordEmpty = !isInitializing && hasQuery && keywordResults.length === 0;
  const showNotesEmpty = !isInitializing && !hasQuery && keywordResults.length === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Notas</h1>
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

      <div className="relative mb-4">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar notas..."
          className="w-full rounded-md border border-border bg-card py-2 pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-border/80"
        />
      </div>

      {showSkeleton && <NoteListSkeleton />}

      {showNotesEmpty && <EmptyNotesState onCreate={handleCreate} />}

      {keywordResults.length > 0 && (
        <ul className="flex flex-col gap-3">
          {keywordResults.map((note) => (
            <li key={note.id}>
              <NoteCard note={note} />
            </li>
          ))}
        </ul>
      )}

      {hasQuery && (
        <SemanticSection
          results={semanticResults}
          isLoading={isLoadingSemantic}
          hasKeywordResults={keywordResults.length > 0}
          showKeywordEmpty={showKeywordEmpty}
        />
      )}
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

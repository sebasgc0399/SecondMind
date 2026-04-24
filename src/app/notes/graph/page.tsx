import { useState, useCallback } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import type { GraphNode } from 'reagraph';
import KnowledgeGraph from '@/components/graph/KnowledgeGraph';
import GraphNodePanel from '@/components/graph/GraphNodePanel';
import GraphFiltersPanel from '@/components/graph/GraphFilters';
import useGraph, { DEFAULT_FILTERS } from '@/hooks/useGraph';
import type { GraphFilters } from '@/hooks/useGraph';
import type { ParaType, NoteType } from '@/types/common';

export default function GraphPage() {
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS);
  const { nodes, edges, isEmpty } = useGraph(filters);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const hasActiveFilters =
    filters.paraType !== DEFAULT_FILTERS.paraType ||
    filters.noteType !== DEFAULT_FILTERS.noteType ||
    filters.minLinks !== DEFAULT_FILTERS.minLinks;

  const handleNodeSelect = useCallback((node: GraphNode | null) => {
    setSelectedNode(node);
  }, []);

  return (
    <div
      className={`flex h-full flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 md:px-6 md:py-4">
        <Link
          to="/notes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Notas
        </Link>
        <h1 className="hidden text-base font-semibold text-foreground md:inline md:text-lg">
          Grafo
        </h1>
        <span className="text-xs text-muted-foreground md:text-sm">
          {nodes.length} {nodes.length === 1 ? 'nota' : 'notas'} &middot; {edges.length}{' '}
          {edges.length === 1 ? 'conexión' : 'conexiones'}
        </span>
        <button
          type="button"
          onClick={() => setIsFullscreen((prev) => !prev)}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      <GraphFiltersPanel filters={filters} onChange={setFilters} />

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-muted-foreground">
            {hasActiveFilters
              ? 'Ningún nodo coincide con los filtros.'
              : 'El grafo cobra vida con más notas y conexiones.'}
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="text-sm font-medium text-primary hover:underline"
            >
              Resetear filtros
            </button>
          ) : (
            <Link to="/notes" className="text-sm font-medium text-primary hover:underline">
              Crear notas &rarr;
            </Link>
          )}
        </div>
      ) : (
        <div className="relative flex-1">
          <KnowledgeGraph nodes={nodes} edges={edges} onNodeSelect={handleNodeSelect} />

          {selectedNode && selectedNode.data && (
            <GraphNodePanel
              nodeId={selectedNode.id}
              title={selectedNode.data.title}
              paraType={selectedNode.data.paraType as ParaType}
              noteType={selectedNode.data.noteType as NoteType}
              linkCount={selectedNode.data.linkCount as number}
              onClose={() => setSelectedNode(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

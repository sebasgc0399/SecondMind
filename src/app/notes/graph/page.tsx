import { useState, useCallback } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import type { GraphNode } from 'reagraph';
import KnowledgeGraph from '@/components/graph/KnowledgeGraph';
import GraphNodePanel from '@/components/graph/GraphNodePanel';
import useGraph from '@/hooks/useGraph';
import type { ParaType, NoteType } from '@/types/common';

export default function GraphPage() {
  const { nodes, edges, isEmpty } = useGraph();
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleNodeSelect = useCallback((node: GraphNode | null) => {
    setSelectedNode(node);
  }, []);

  if (isEmpty) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
          <Link
            to="/notes"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Notas
          </Link>
          <h1 className="text-lg font-semibold text-foreground">Knowledge Graph</h1>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-muted-foreground">El grafo cobra vida con mas notas y conexiones.</p>
          <Link to="/notes" className="text-sm font-medium text-primary hover:underline">
            Crear notas &rarr;
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex h-full flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : ''}`}
    >
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <Link
          to="/notes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Notas
        </Link>
        <h1 className="text-lg font-semibold text-foreground">Knowledge Graph</h1>
        <span className="text-sm text-muted-foreground">
          {nodes.length} {nodes.length === 1 ? 'nota' : 'notas'} &middot; {edges.length}{' '}
          {edges.length === 1 ? 'conexion' : 'conexiones'}
        </span>
        <button
          type="button"
          onClick={() => setIsFullscreen((prev) => !prev)}
          className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

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
    </div>
  );
}

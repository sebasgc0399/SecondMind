import { useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { GraphCanvas, useSelection } from 'reagraph';
import type { GraphCanvasRef } from 'reagraph';
import type { GraphNode, GraphEdge } from 'reagraph';

interface KnowledgeGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeSelect: (node: GraphNode | null) => void;
}

export default function KnowledgeGraph({ nodes, edges, onNodeSelect }: KnowledgeGraphProps) {
  const graphRef = useRef<GraphCanvasRef | null>(null);
  const navigate = useNavigate();

  const { selections, actives, onNodeClick, onCanvasClick, onNodePointerOver, onNodePointerOut } =
    useSelection({
      ref: graphRef,
      nodes,
      edges,
      type: 'single',
      pathHoverType: 'direct',
      focusOnSelect: false,
      onSelection: (selectedIds) => {
        if (selectedIds.length === 0) {
          onNodeSelect(null);
          return;
        }
        const selectedNode = nodes.find((n) => n.id === selectedIds[0]);
        if (selectedNode) onNodeSelect(selectedNode);
      },
    });

  const handleNodeDoubleClick = useCallback(
    (node: GraphNode) => {
      navigate(`/notes/${node.id}`);
    },
    [navigate],
  );

  return (
    <GraphCanvas
      ref={graphRef}
      nodes={nodes}
      edges={edges}
      selections={selections}
      actives={actives}
      onNodeClick={onNodeClick}
      onCanvasClick={onCanvasClick}
      onNodePointerOver={onNodePointerOver}
      onNodePointerOut={onNodePointerOut}
      onNodeDoubleClick={handleNodeDoubleClick}
      layoutType="forceDirected2d"
      edgeArrowPosition="none"
      labelType="auto"
      sizingType="attribute"
      sizingAttribute="size"
    />
  );
}

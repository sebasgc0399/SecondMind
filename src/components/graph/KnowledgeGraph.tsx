import { useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { GraphCanvas, lightTheme, useSelection } from 'reagraph';
import type { GraphCanvasRef, Theme as ReagraphTheme } from 'reagraph';
import type { GraphNode, GraphEdge } from 'reagraph';
import useTheme from '@/hooks/useTheme';
import {
  getGraphCanvasBackground,
  getGraphEdgeColor,
  getGraphLabelColor,
} from '@/lib/theme-colors';

interface KnowledgeGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeSelect: (node: GraphNode | null) => void;
}

export default function KnowledgeGraph({ nodes, edges, onNodeSelect }: KnowledgeGraphProps) {
  const graphRef = useRef<GraphCanvasRef | null>(null);
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();

  const theme: ReagraphTheme = useMemo(() => {
    const canvasBg = getGraphCanvasBackground(resolvedTheme);
    const labelColor = getGraphLabelColor(resolvedTheme);
    const edgeColor = getGraphEdgeColor(resolvedTheme);
    return {
      ...lightTheme,
      canvas: { background: canvasBg },
      node: {
        ...lightTheme.node,
        label: {
          ...lightTheme.node.label,
          color: labelColor,
          activeColor: labelColor,
          stroke: canvasBg,
        },
      },
      edge: {
        ...lightTheme.edge,
        fill: edgeColor,
        activeFill: labelColor,
        label: {
          ...lightTheme.edge.label,
          color: labelColor,
          activeColor: labelColor,
        },
      },
      arrow: {
        ...lightTheme.arrow,
        fill: edgeColor,
        activeFill: labelColor,
      },
    };
  }, [resolvedTheme]);

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
      theme={theme}
    />
  );
}

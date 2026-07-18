/**
 * OutlookMapDisplay.tsx — 「見通す」専用の軽量マップ表示
 * 配置先: frontend/knowledge-map-app/src/components/OutlookMapDisplay.tsx
 *
 * KnowledgeMapDisplay(CustomNode)には依存しない読み取り用表示。
 *   - 振り返り/科目とも同じ文字サイズ(13px)で統一
 *   - 科目マップは科目名(ルート)から離れるほど色が薄くなる(depthフェード)
 *   - links のハイライト指定で対象ノード・エッジが明るく光る
 *   - ノードのドラッグ可(保存はしない)、ホバーで説明文をtooltip表示
 */
import React, { memo, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background, BackgroundVariant, Controls, Handle, Position,
  useNodesState, useEdgesState,
  type Node, type Edge, type NodeTypes, type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';

// ===== 外部公開型 =====

export interface OViewNode {
  id: string;
  label: string;
  sentence?: string;
  kind: 'reflection' | 'subject';
  /** 科目ノード: ルート(科目名)からの距離。0=ルート。reflectionでは未使用 */
  depth?: number;
  position: { x: number; y: number };
}

export interface OViewEdge {
  id: string;
  source: string;
  target: string;
  kind: 'reflection' | 'subject' | 'cross';
}

export interface OHighlight {
  sourceId: string;
  targetId: string;
}

interface Props {
  nodes: OViewNode[];
  edges: OViewEdge[];
  highlight: OHighlight | null;
}

// ===== 配色 =====
// 科目マップ: ルート=濃いティール → 深くなるほど明確に薄く(明暗の差を強調)
const SUBJECT_DEPTH_BG = ['#134e4a', '#0d9488', '#5eead4', '#ccfbf1', '#f0fdfa'];
const SUBJECT_DEPTH_FG = ['#ffffff', '#ffffff', '#134e4a', '#0f766e', '#14b8a6'];
const SUBJECT_DEPTH_BORDER = ['#134e4a', '#0f766e', '#14b8a6', '#5eead4', '#99f6e4'];

const HIGHLIGHT_SHADOW = '0 0 0 3px #fbbf24, 0 0 14px rgba(251, 191, 36, 0.65)';

function depthIndex(depth: number | undefined): number {
  const d = depth ?? 0;
  return Math.min(Math.max(d, 0), SUBJECT_DEPTH_BG.length - 1);
}

// ===== カスタムノード =====

const ONode: React.FC<NodeProps> = memo(({ data }) => {
  const { label, sentence, kind, depth, highlighted } = data as {
    label: string; sentence?: string; kind: 'reflection' | 'subject';
    depth?: number; highlighted?: boolean;
  };

  let style: React.CSSProperties;
  if (kind === 'subject') {
    const i = depthIndex(depth);
    style = {
      background: SUBJECT_DEPTH_BG[i],
      color: SUBJECT_DEPTH_FG[i],
      border: `1.5px solid ${SUBJECT_DEPTH_BORDER[i]}`,
    };
  } else {
    style = {
      background: '#ffffff',
      color: '#374151',
      border: '1.5px solid #adb5bd',
    };
  }
  if (highlighted) {
    style.boxShadow = HIGHLIGHT_SHADOW;
    style.zIndex = 10;
  }

  return (
    <div
      title={sentence || undefined}
      style={{
        ...style,
        borderRadius: 12,
        padding: '12px 22px',
        fontSize: 30,            // 縮小表示でも読めるサイズ(振り返り・科目とも同一)
        fontWeight: 600,
        lineHeight: 1.3,
        maxWidth: 280,
        textAlign: 'center',
        transition: 'box-shadow 0.15s ease',
        cursor: 'grab',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 6, height: 6 }} />
      {label}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 6, height: 6 }} />
    </div>
  );
});
ONode.displayName = 'ONode';

// ===== 変換 =====

function toFlow(
  nodes: OViewNode[],
  edges: OViewEdge[],
  highlight: OHighlight | null,
): { fn: Node[]; fe: Edge[] } {
  const hl = highlight ? new Set([highlight.sourceId, highlight.targetId]) : new Set<string>();
  const fn: Node[] = nodes.map((n) => ({
    id: n.id,
    type: 'onode',
    position: n.position,
    data: {
      label: n.label,
      sentence: n.sentence,
      kind: n.kind,
      depth: n.depth,
      highlighted: hl.has(n.id),
    },
  }));

  const fe: Edge[] = edges.map((e) => {
    const isHl = !!highlight
      && e.kind === 'cross'
      && e.source === highlight.sourceId
      && e.target === highlight.targetId;
    let style: React.CSSProperties;
    if (e.kind === 'cross') {
      style = isHl
        ? { stroke: '#f59e0b', strokeWidth: 3 }
        : { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '6 4', opacity: 0.75 };
    } else if (e.kind === 'subject') {
      style = { stroke: '#5eead4', strokeWidth: 1.5, strokeDasharray: '5 3' };
    } else {
      style = { stroke: '#868e96', strokeWidth: 1.5 };
    }
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      animated: isHl,
      style,
      interactionWidth: 20,
    };
  });
  return { fn, fe };
}

// ===== 本体 =====

export const OutlookMapDisplay: React.FC<Props> = ({ nodes, edges, highlight }) => {
  const nodeTypes: NodeTypes = useMemo(() => ({ onode: ONode }), []);

  const initial = useMemo(() => toFlow(nodes, edges, highlight),
    // 初期化専用(以降は effect で同期)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(initial.fn);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(initial.fe);

  // ノード/エッジ本体の変更(科目切替など) → 位置ごと再構築
  useEffect(() => {
    const { fn, fe } = toFlow(nodes, edges, highlight);
    setFlowNodes(fn);
    setFlowEdges(fe);
    // highlight は下の effect で扱うため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, setFlowNodes, setFlowEdges]);

  // ハイライトのみ変更 → 位置(ドラッグ結果)は保持して data / style だけ更新
  useEffect(() => {
    const hl = highlight ? new Set([highlight.sourceId, highlight.targetId]) : new Set<string>();
    setFlowNodes((prev) => prev.map((n) => ({
      ...n,
      data: { ...n.data, highlighted: hl.has(n.id) },
    })));
    const edgeKind: Record<string, OViewEdge['kind']> = {};
    edges.forEach((e) => { edgeKind[e.id] = e.kind; });
    setFlowEdges((prev) => prev.map((fe) => {
      if (edgeKind[fe.id] !== 'cross') return fe;
      const isHl = !!highlight
        && fe.source === highlight.sourceId
        && fe.target === highlight.targetId;
      return {
        ...fe,
        animated: isHl,
        style: isHl
          ? { stroke: '#f59e0b', strokeWidth: 3 }
          : { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '6 4', opacity: 0.75 },
      };
    }));
  }, [highlight, edges, setFlowNodes, setFlowEdges]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodesDraggable
        nodesConnectable={false}
        zoomOnDoubleClick={false}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#dee2e6" />
        <Controls position="bottom-right" showInteractive={false}
          className="!rounded-xl !shadow-sm !border !border-surface-200" />
      </ReactFlow>
    </div>
  );
};

export default OutlookMapDisplay;
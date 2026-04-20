/**
 * MapNode / MapEdge ⇔ React Flow Node / Edge の変換
 *
 * 修正:
 * - isRelation ノードの status / data フィールドを保持
 * - relation エッジのスタイル（過去=青破線、未来=緑破線）
 */
import type { Node, Edge } from 'reactflow';
import type { MapNode, MapEdge, NodeStatus, SurroundingConceptsMap } from '@/types';

// ===== ハンドル位置定義 =====
const NODE_W = 160;
const NODE_H = 40;

interface HandleDef { name: string; dx: number; dy: number }

const HANDLE_POSITIONS: HandleDef[] = [
  { name: 'top',          dx: 0,            dy: -NODE_H / 2 },
  { name: 'top-right',    dx: NODE_W / 2,   dy: -NODE_H * 0.3 },
  { name: 'bottom-right', dx: NODE_W / 2,   dy: NODE_H * 0.3 },
  { name: 'bottom',       dx: 0,            dy: NODE_H / 2 },
  { name: 'bottom-left',  dx: -NODE_W / 2,  dy: NODE_H * 0.3 },
  { name: 'top-left',     dx: -NODE_W / 2,  dy: -NODE_H * 0.3 },
];

function findNearestHandles(
  srcPos: { x: number; y: number },
  tgtPos: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
  let minDist = Infinity;
  let bestSrc = 'bottom';
  let bestTgt = 'top';

  for (const sh of HANDLE_POSITIONS) {
    const sx = srcPos.x + sh.dx;
    const sy = srcPos.y + sh.dy;
    for (const th of HANDLE_POSITIONS) {
      const tx = tgtPos.x + th.dx;
      const ty = tgtPos.y + th.dy;
      const dist = (sx - tx) ** 2 + (sy - ty) ** 2;
      if (dist < minDist) {
        minDist = dist;
        bestSrc = sh.name;
        bestTgt = th.name;
      }
    }
  }
  return { sourceHandle: `s-${bestSrc}`, targetHandle: `t-${bestTgt}` };
}

// ===== 変換関数 =====

/** MapNode → React Flow Node */
export function toFlowNodes(
  mapNodes: MapNode[],
  statuses: Record<string, NodeStatus>,
  _surrounding: SurroundingConceptsMap,
): Node[] {
  return mapNodes.map((n) => {
    const label = n.label || n.data?.label || n.id;
    const isSat = n.data?.isSatellite ?? false;
    const isRel = n.data?.isRelation ?? false;

    // ★ status の決定ロジック:
    //   1. satellite → 'satellite'
    //   2. relation → ノード自身の status をそのまま保持（topic detection で上書きしない）
    //   3. 通常ノード → statuses マップから取得
    let status: NodeStatus;
    if (isSat) {
      status = 'satellite';
    } else if (isRel) {
      status = n.data?.status || 'default';
    } else {
      status = statuses[label] || statuses[n.id] || 'default';
    }

    return {
      id: n.id,
      type: 'custom',
      position: n.position || { x: 0, y: 0 },
      data: {
        label,
        sentence: n.sentence || n.data?.sentence || '',
        extend_query: n.extend_query || n.data?.extend_query || '',
        status,
        isSatellite: isSat,
        parentNodeId: n.data?.parentNodeId || '',
        satellites: [],
        // ★ 関連科目ノードの全フィールドを保持
        isRelation: isRel,
        relationDirection: n.data?.relationDirection,
        relationOriginId: n.data?.relationOriginId,
        relationSubjectName: n.data?.relationSubjectName,
        group: n.data?.group,
      },
    };
  });
}

/** MapEdge → React Flow Edge */
export function toFlowEdges(
  mapEdges: MapEdge[],
  nodePositions: Record<string, { x: number; y: number }>,
): Edge[] {
  return mapEdges.map((e) => {
    const isSat = e.isSatellite ?? false;
    const isRel = e.isRelation ?? false;

    let srcHandle = e.sourceHandle;
    let tgtHandle = e.targetHandle;

    if (!srcHandle || !tgtHandle) {
      const srcPos = nodePositions[e.source] || { x: 0, y: 0 };
      const tgtPos = nodePositions[e.target] || { x: 0, y: 0 };
      const nearest = findNearestHandles(srcPos, tgtPos);
      srcHandle = nearest.sourceHandle;
      tgtHandle = nearest.targetHandle;
    }

    // ★ エッジスタイルの決定
    let edgeStyle: React.CSSProperties;
    if (isSat) {
      edgeStyle = { stroke: '#bac8ff', strokeWidth: 1.5, strokeDasharray: '6 4', cursor: 'pointer' };
    } else if (isRel) {
      // 関連科目エッジ: source/target の名前からは判別できないので共通色を使用
      edgeStyle = { stroke: '#a0aec0', strokeWidth: 1.5, strokeDasharray: '5 3', cursor: 'pointer' };
    } else {
      edgeStyle = { stroke: '#868e96', strokeWidth: 1.5, cursor: 'pointer' };
    }

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: srcHandle,
      targetHandle: tgtHandle,
      label: '',
      data: { relationLabel: e.label || '', isRelation: isRel },
      animated: false,
      style: edgeStyle,
      interactionWidth: 20,
    };
  });
}

/** React Flow Node → MapNode */
export function fromFlowNodes(flowNodes: Node[]): MapNode[] {
  return flowNodes.map((n) => ({
    id: n.id,
    type: n.type || 'custom',
    position: n.position,
    data: n.data,
    label: n.data?.label,
    sentence: n.data?.sentence,
    extend_query: n.data?.extend_query,
  }));
}

/** React Flow Edge → MapEdge */
export function fromFlowEdges(flowEdges: Edge[]): MapEdge[] {
  return flowEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: (e.data as any)?.relationLabel || (typeof e.label === 'string' ? e.label : ''),
    isSatellite: e.style?.strokeDasharray === '6 4' ? true : undefined,
    isRelation: (e.data as any)?.isRelation || false,
    sourceHandle: e.sourceHandle || undefined,
    targetHandle: e.targetHandle || undefined,
  }));
}

export function recalculateEdgeHandles(
  mapEdges: MapEdge[],
  nodePositions: Record<string, { x: number; y: number }>,
): MapEdge[] {
  return mapEdges.map((e) => {
    const srcPos = nodePositions[e.source] || { x: 0, y: 0 };
    const tgtPos = nodePositions[e.target] || { x: 0, y: 0 };
    const { sourceHandle, targetHandle } = findNearestHandles(srcPos, tgtPos);
    return { ...e, sourceHandle, targetHandle };
  });
}
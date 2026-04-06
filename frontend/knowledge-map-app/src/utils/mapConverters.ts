/**
 * MapNode / MapEdge ⇔ React Flow Node / Edge の変換
 *
 * 修正:
 * - ハンドルIDを s-xxx / t-xxx 形式に（CustomNode の dual handle に対応）
 * - 全方向からのエッジ接続が可能
 * - エッジラベルを白背景付きで常時表示
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

/** 2ノード間で最も近いハンドルペアを返す */
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
  // CustomNode のハンドルIDは s-xxx (source), t-xxx (target)
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
    return {
      id: n.id,
      type: 'custom',
      position: n.position || { x: 0, y: 0 },
      data: {
        label,
        sentence: n.sentence || n.data?.sentence || '',
        extend_query: n.extend_query || n.data?.extend_query || '',
        status: isSat ? 'satellite' : (statuses[label] || statuses[n.id] || 'default'),
        isSatellite: isSat,
        parentNodeId: n.data?.parentNodeId || '',
        satellites: [],
      },
    };
  });
}

/** MapEdge → React Flow Edge（ハンドルは既存値を優先、未設定時のみ計算） */
export function toFlowEdges(
  mapEdges: MapEdge[],
  nodePositions: Record<string, { x: number; y: number }>,
): Edge[] {
  return mapEdges.map((e) => {
    const isSat = e.isSatellite ?? false;

    // ★ 既にハンドルが割り当てられている場合はそのまま使用
    //    未設定の場合のみ最近接ハンドルを計算
    let srcHandle = e.sourceHandle;
    let tgtHandle = e.targetHandle;

    if (!srcHandle || !tgtHandle) {
      const srcPos = nodePositions[e.source] || { x: 0, y: 0 };
      const tgtPos = nodePositions[e.target] || { x: 0, y: 0 };
      const nearest = findNearestHandles(srcPos, tgtPos);
      srcHandle = nearest.sourceHandle;
      tgtHandle = nearest.targetHandle;
    }

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: srcHandle,
      targetHandle: tgtHandle,
      label: '',
      data: { relationLabel: e.label || '' },
      animated: false,
      style: isSat
        ? { stroke: '#bac8ff', strokeWidth: 1.5, strokeDasharray: '6 4', cursor: 'pointer' }
        : { stroke: '#868e96', strokeWidth: 1.5, cursor: 'pointer' },
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

/** React Flow Edge → MapEdge（label は data.relationLabel から復元） */
export function fromFlowEdges(flowEdges: Edge[]): MapEdge[] {
  return flowEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: (e.data as any)?.relationLabel || (typeof e.label === 'string' ? e.label : ''),
    sourceHandle: e.sourceHandle || undefined,
    targetHandle: e.targetHandle || undefined,
  }));
}

/**
 * 全エッジのハンドルを強制再計算（ドラッグ完了時専用）
 * 既存のハンドル割り当てを無視し、現在のノード位置から最近接ペアを再計算
 */
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
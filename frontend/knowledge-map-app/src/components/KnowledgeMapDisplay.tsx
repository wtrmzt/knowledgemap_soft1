/**
 * 知識マップ表示コンポーネント
 *
 * 修正:
 * - エッジの再構築を mapEdges 変更時のみに限定（mapNodes 変更では再構築しない）
 *   → ノードクリック時のエッジ見た目変化バグを解消
 * - 位置マップを ref で保持し、エッジハンドル再計算は onNodeDragStop のみ
 * - ノード選択変更は mapNodes に伝播しない（位置変更のみ伝播）
 */
import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactFlow, {
  Controls, Background, MiniMap,
  useNodesState, useEdgesState, addEdge,
  type Connection, type Edge, type Node, type EdgeMouseHandler,
  type NodeChange,
  BackgroundVariant, type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Link2, X } from 'lucide-react';
import CustomNode from './CustomNode';
import { EdgeLabelDialog } from './EdgeLabelDialog';
import { toFlowNodes, toFlowEdges, fromFlowNodes, fromFlowEdges, generateId } from '@/utils';
import type { MapNode, MapEdge, NodeStatus, SurroundingConceptsMap } from '@/types';

interface Props {
  nodes: MapNode[];
  edges: MapEdge[];
  nodeStatuses: Record<string, NodeStatus>;
  surroundingConcepts: SurroundingConceptsMap;
  onNodesChange: (nodes: MapNode[]) => void;
  onEdgesChange: (edges: MapEdge[]) => void;
  onConnect: (source: string, target: string, label: string) => void;
  onAutoSave: () => void;
  onSatelliteAdd: (nodeId: string) => void;
}

interface EdgePopupInfo {
  edgeId: string; label: string;
  sourceLabel: string; targetLabel: string;
  x: number; y: number;
}

function buildPosMap(nodes: MapNode[] | Node[]): Record<string, { x: number; y: number }> {
  const m: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n: any) => { m[n.id] = n.position || { x: 0, y: 0 }; });
  return m;
}

// ===== エッジ関連性ポップアップ =====
const EdgeRelationPopup: React.FC<{ info: EdgePopupInfo; onClose: () => void }> = ({ info, onClose }) => {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.edge-relation-popup')) return;
      onClose();
    };
    const t = setTimeout(() => document.addEventListener('click', handler), 50);
    return () => { clearTimeout(t); document.removeEventListener('click', handler); };
  }, [onClose]);

  return createPortal(
    <div className="edge-relation-popup" style={{
      position: 'fixed', left: info.x, top: info.y,
      transform: 'translate(-50%, -100%)', marginTop: -12,
      minWidth: 200, maxWidth: 320, background: '#fff', borderRadius: 12,
      border: '1px solid #dee2e6', boxShadow: '0 12px 40px rgba(0,0,0,0.16)',
      zIndex: 9999, padding: '12px 16px', animation: 'popupFadeIn 0.15s ease-out', cursor: 'default',
    }} onClick={(e) => e.stopPropagation()}>
      <button onClick={onClose} style={{
        position: 'absolute', top: 6, right: 6, width: 24, height: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#adb5bd',
      }}><X size={12} /></button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Link2 size={12} color="#4263eb" />
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#868e96' }}>関係性</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12, color: '#1a1d23' }}>
        <span style={{ padding: '2px 8px', borderRadius: 6, background: '#f1f3f5', fontWeight: 600 }}>{info.sourceLabel}</span>
        <span style={{ color: '#adb5bd' }}>→</span>
        <span style={{ padding: '2px 8px', borderRadius: 6, background: '#f1f3f5', fontWeight: 600 }}>{info.targetLabel}</span>
      </div>
      {info.label ? (
        <p style={{ fontSize: 13, lineHeight: 1.6, color: '#495057', padding: '8px 10px', background: '#f8f9fa', borderRadius: 8, border: '1px solid #e9ecef', margin: 0 }}>{info.label}</p>
      ) : (
        <p style={{ fontSize: 12, color: '#adb5bd', fontStyle: 'italic', margin: 0 }}>関係性の説明はありません</p>
      )}
    </div>,
    document.body,
  );
};

// ===== メインコンポーネント =====

export const KnowledgeMapDisplay: React.FC<Props> = ({
  nodes: mapNodes, edges: mapEdges,
  nodeStatuses, surroundingConcepts,
  onNodesChange: setMapNodes, onEdgesChange: setMapEdges,
  onConnect: onExtConnect, onAutoSave, onSatelliteAdd,
}) => {
  const nodeTypes: NodeTypes = useMemo(() => ({ custom: CustomNode }), []);

  // ★ 位置マップを ref で保持（エッジ再構築のトリガーにしない）
  const posMapRef = useRef<Record<string, { x: number; y: number }>>(buildPosMap(mapNodes));

  const [flowNodes, setFlowNodes, onNChange] = useNodesState(
    toFlowNodes(mapNodes, nodeStatuses, surroundingConcepts),
  );
  const [flowEdges, setFlowEdges, onEChange] = useEdgesState(
    toFlowEdges(mapEdges, posMapRef.current),
  );

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingConn, setPendingConn] = useState<{
    source: string; target: string; sourceLabel: string; targetLabel: string;
  } | null>(null);
  const [edgePopup, setEdgePopup] = useState<EdgePopupInfo | null>(null);

  // ===== 外部ノード・エッジ更新 =====
  // ★ ノード更新時にもエッジのハンドル位置を再計算する
  //    （クリック等で再レンダリングされた際のハンドルずれ防止）
  useEffect(() => {
    posMapRef.current = buildPosMap(mapNodes);
    setFlowNodes(toFlowNodes(mapNodes, nodeStatuses, surroundingConcepts));
    setFlowEdges(toFlowEdges(mapEdges, posMapRef.current));
  }, [mapNodes, mapEdges, nodeStatuses, surroundingConcepts, setFlowNodes, setFlowEdges]);

  // satellite-add-to-map
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.nodeId) onSatelliteAdd(d.nodeId);
    };
    document.addEventListener('satellite-add-to-map', handler);
    return () => document.removeEventListener('satellite-add-to-map', handler);
  }, [onSatelliteAdd]);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onAutoSave, 3000);
  }, [onAutoSave]);

  // ★ ノード変更 — 位置変更のみ親に伝播。選択変更は無視。
  const handleNChange = useCallback((changes: NodeChange[]) => {
    onNChange(changes);

    // 位置変更があるかチェック
    const hasPositionChange = changes.some(
      (c) => c.type === 'position' && c.position
    );
    if (!hasPositionChange) return;

    // 位置変更があった場合のみ mapNodes を更新
    setTimeout(() => {
      setFlowNodes((nds) => {
        setMapNodes(fromFlowNodes(nds));
        posMapRef.current = buildPosMap(nds);
        return nds;
      });
    }, 0);
  }, [onNChange, setFlowNodes, setMapNodes]);

  // ★ ドラッグ完了時にエッジハンドルを再計算
  const handleNodeDragStop = useCallback((_: any, __: any, nodes: Node[]) => {
    const pm = buildPosMap(nodes);
    posMapRef.current = pm;
    // toFlowEdges が常に最近接ハンドルを計算するので、位置更新して再変換するだけでOK
    setFlowEdges((eds) => {
      const mapE = fromFlowEdges(eds);
      return toFlowEdges(mapE, pm);
    });
    schedule();
  }, [setFlowEdges, schedule]);

  // ★ エッジ変更 — 選択のみの変更は親に伝播しない（エッジ再構築を防止）
  const handleEChange = useCallback((changes: any[]) => {
    onEChange(changes);

    // select のみの変更は無視 → mapEdges を更新しない → useEffect 発火しない
    const hasRealChange = changes.some(
      (c: any) => c.type !== 'select'
    );
    if (!hasRealChange) return;

    setTimeout(() => {
      setFlowEdges((eds) => { setMapEdges(fromFlowEdges(eds)); return eds; });
      schedule();
    }, 0);
  }, [onEChange, setFlowEdges, setMapEdges, schedule]);

  // エッジクリック → ポップアップ
  const handleEdgeClick: EdgeMouseHandler = useCallback((event, edge) => {
    event.stopPropagation();
    const srcNode = mapNodes.find((n) => n.id === edge.source);
    const tgtNode = mapNodes.find((n) => n.id === edge.target);
    setEdgePopup({
      edgeId: edge.id,
      label: (edge.data as any)?.relationLabel || '',
      sourceLabel: srcNode?.label || srcNode?.data?.label || edge.source,
      targetLabel: tgtNode?.label || tgtNode?.data?.label || edge.target,
      x: event.clientX, y: event.clientY,
    });
  }, [mapNodes]);

  // 手動接続 → ラベル入力
  const handleConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target) return;
    const srcNode = mapNodes.find((n) => n.id === conn.source);
    const tgtNode = mapNodes.find((n) => n.id === conn.target);
    setPendingConn({
      source: conn.source, target: conn.target,
      sourceLabel: srcNode?.label || srcNode?.data?.label || conn.source,
      targetLabel: tgtNode?.label || tgtNode?.data?.label || conn.target,
    });
  }, [mapNodes]);

  const handleLabelConfirm = useCallback((label: string) => {
    if (!pendingConn) return;
    onExtConnect(pendingConn.source, pendingConn.target, label);
    const newMapEdge: MapEdge = {
      id: generateId('edge'),
      source: pendingConn.source, target: pendingConn.target,
      label: label || '',
    };
    const fEdge = toFlowEdges([newMapEdge], posMapRef.current)[0];
    if (fEdge) setFlowEdges((eds) => addEdge(fEdge, eds));
    setPendingConn(null);
    schedule();
  }, [pendingConn, onExtConnect, setFlowEdges, schedule]);

  const handleLabelCancel = useCallback(() => {
    if (pendingConn) handleLabelConfirm('');
  }, [pendingConn, handleLabelConfirm]);

  const handlePaneClick = useCallback(() => { setEdgePopup(null); }, []);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={flowNodes} edges={flowEdges}
        onNodesChange={handleNChange}
        onEdgesChange={handleEChange}
        onConnect={handleConnect}
        onNodeDragStop={handleNodeDragStop}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        elevateNodesOnSelect={false}
        elevateEdgesOnSelect={false}
        fitView fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2} maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#dee2e6" />
        <Controls position="bottom-right" showInteractive={false}
          className="!rounded-xl !shadow-sm !border !border-surface-200" />
        <MiniMap position="bottom-left" pannable zoomable
          nodeColor={(n) => {
            const s = n.data?.status;
            if (s === 'described') return '#40c057';
            if (s === 'currently_writing') return '#f59f00';
            if (s === 'suggested') return '#748ffc';
            if (s === 'satellite') return '#bac8ff';
            return '#dbe4ff';
          }}
          maskColor="rgba(248,249,251,.85)"
          className="!rounded-xl !shadow-sm !border !border-surface-200"
        />
      </ReactFlow>

      {pendingConn && (
        <EdgeLabelDialog
          sourceLabel={pendingConn.sourceLabel}
          targetLabel={pendingConn.targetLabel}
          onConfirm={handleLabelConfirm}
          onCancel={handleLabelCancel}
        />
      )}
      {edgePopup && (
        <EdgeRelationPopup info={edgePopup} onClose={() => setEdgePopup(null)} />
      )}
    </div>
  );
};
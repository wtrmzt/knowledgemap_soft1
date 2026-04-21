/**
 * 知識マップ表示コンポーネント
 *
 * 操作モデル:
 *   左クリック   → ポップアップ（CustomNode 側で処理）
 *   中央クリック → ノードのドラッグ移動（node-middle-down イベントを受けて本コンポーネントで処理）
 *   nodesDraggable={false} で React Flow の左クリックドラッグを無効化
 */
import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Controls, Background, MiniMap,
  useNodesState, useEdgesState, addEdge,
  type Connection, type Edge, type Node,
  BackgroundVariant, type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
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

function buildPosMap(nodes: MapNode[] | Node[]): Record<string, { x: number; y: number }> {
  const m: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n: any) => { m[n.id] = n.position || { x: 0, y: 0 }; });
  return m;
}

export const KnowledgeMapDisplay: React.FC<Props> = ({
  nodes: mapNodes, edges: mapEdges,
  nodeStatuses, surroundingConcepts,
  onNodesChange: setMapNodes, onEdgesChange: setMapEdges,
  onConnect: onExtConnect, onAutoSave, onSatelliteAdd,
}) => {
  const nodeTypes: NodeTypes = useMemo(() => ({ custom: CustomNode }), []);

  // 初回レンダリング用のエッジ（ハンドル計算済み）
  const initPosMap = useMemo(() => buildPosMap(mapNodes), [mapNodes]);
  const [flowNodes, setFlowNodes, onNChange] = useNodesState(
    toFlowNodes(mapNodes, nodeStatuses, surroundingConcepts),
  );
  const [flowEdges, setFlowEdges, onEChange] = useEdgesState(
    toFlowEdges(mapEdges, initPosMap),
  );

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // エッジラベル入力ダイアログ
  const [pendingConn, setPendingConn] = useState<{
    source: string; target: string; sourceLabel: string; targetLabel: string;
  } | null>(null);

  // ===== 外部ノード更新 =====
  useEffect(() => {
    setFlowNodes(toFlowNodes(mapNodes, nodeStatuses, surroundingConcepts));
  }, [mapNodes, nodeStatuses, surroundingConcepts, setFlowNodes]);

  // ===== 外部エッジ更新（ハンドル計算込み） =====
  useEffect(() => {
    const pm = buildPosMap(mapNodes);
    setFlowEdges(toFlowEdges(mapEdges, pm));
  }, [mapEdges, mapNodes, setFlowEdges]);

  // ===== satellite-add-to-map =====
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.nodeId) onSatelliteAdd(d.nodeId);
    };
    document.addEventListener('satellite-add-to-map', handler);
    return () => document.removeEventListener('satellite-add-to-map', handler);
  }, [onSatelliteAdd]);

  // ===== 自動保存デバウンス =====
  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onAutoSave, 3000);
  }, [onAutoSave]);

  // ===== ノード変更（選択変更等） =====
  const handleNChange = useCallback((c: any) => {
    onNChange(c);
    setTimeout(() => {
      setFlowNodes((nds) => {
        setMapNodes(fromFlowNodes(nds));
        return nds;
      });
    }, 0);
  }, [onNChange, setFlowNodes, setMapNodes]);

  // ===== ★ 中央クリック ドラッグ処理 =====
  const flowNodesRef = useRef(flowNodes);
  useEffect(() => { flowNodesRef.current = flowNodes; }, [flowNodes]);

  const dragRef = useRef<{
    nodeId: string; startX: number; startY: number;
    startNodeX: number; startNodeY: number; zoom: number;
  } | null>(null);

  useEffect(() => {
    const handleDown = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const node = flowNodesRef.current.find((n: Node) => n.id === d.nodeId);
      if (!node) return;
      dragRef.current = {
        nodeId: d.nodeId,
        startX: d.clientX, startY: d.clientY,
        startNodeX: node.position.x, startNodeY: node.position.y,
        zoom: d.zoom || 1,
      };
      document.body.style.cursor = 'grabbing';
    };

    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      e.preventDefault();
      const { nodeId, startX, startY, startNodeX, startNodeY, zoom } = dragRef.current;
      const dx = (e.clientX - startX) / zoom;
      const dy = (e.clientY - startY) / zoom;
      setFlowNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, position: { x: startNodeX + dx, y: startNodeY + dy } }
            : n
        )
      );
    };

    const handleUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = '';
      // 位置を親に同期 + エッジハンドル再計算 + 自動保存
      setFlowNodes((nds) => {
        setMapNodes(fromFlowNodes(nds));
        const pm = buildPosMap(nds);
        setFlowEdges((eds) => {
          const mapE = fromFlowEdges(eds);
          return toFlowEdges(mapE, pm);
        });
        return nds;
      });
      schedule();
    };

    document.addEventListener('node-middle-down', handleDown);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('node-middle-down', handleDown);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [setFlowNodes, setFlowEdges, setMapNodes, schedule]);

  const handleEChange = useCallback((c: any) => {
    onEChange(c);
    setTimeout(() => {
      setFlowEdges((eds) => { setMapEdges(fromFlowEdges(eds)); return eds; });
      schedule();
    }, 0);
  }, [onEChange, setFlowEdges, setMapEdges, schedule]);

  // ===== 手動接続 → ラベル入力ダイアログ =====
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

  // ===== ラベル確定 → 両方に反映 =====
  const handleLabelConfirm = useCallback((label: string) => {
    if (!pendingConn) return;
    // ★ 親の handleConnect で mapEdges に追加
    onExtConnect(pendingConn.source, pendingConn.target, label);
    // ★ 即座に flowEdges にも追加（UX のため）
    const pm = buildPosMap(mapNodes);
    const newMapEdge: MapEdge = {
      id: generateId('edge'),
      source: pendingConn.source, target: pendingConn.target,
      label: label || '',
    };
    const fEdge = toFlowEdges([newMapEdge], pm)[0];
    if (fEdge) setFlowEdges((eds) => addEdge(fEdge, eds));
    setPendingConn(null);
    schedule();
  }, [pendingConn, mapNodes, onExtConnect, setFlowEdges, schedule]);

  const handleLabelCancel = useCallback(() => {
    if (pendingConn) handleLabelConfirm('');
  }, [pendingConn, handleLabelConfirm]);

  // ===== キャンバス背景クリック → ポップアップを閉じる =====
  const handlePaneClick = useCallback(() => {
    document.dispatchEvent(new CustomEvent('pane-clicked'));
  }, []);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={flowNodes} edges={flowEdges}
        onNodesChange={handleNChange}
        onEdgesChange={handleEChange}
        onConnect={handleConnect}
        onPaneClick={handlePaneClick}
        nodesDraggable={false}
        nodeTypes={nodeTypes}
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
            if (s === 'relation_past' || s === 'relation_past_candidate') return '#63b3ed';
            if (s === 'relation_future' || s === 'relation_future_candidate') return '#68d391';
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
    </div>
  );
};
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
  // ※ 機能2は「エッジ上のアイコン方式」を廃止し、画面下部の EdgeHighlightsPanel に移行した。

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

  // 最新値を ref で保持（位置保持の再構築に使用）
  const nodeStatusesRef = useRef(nodeStatuses);
  useEffect(() => { nodeStatusesRef.current = nodeStatuses; }, [nodeStatuses]);
  const surroundingRef = useRef(surroundingConcepts);
  useEffect(() => { surroundingRef.current = surroundingConcepts; }, [surroundingConcepts]);
  const mapNodesRef = useRef(mapNodes);
  useEffect(() => { mapNodesRef.current = mapNodes; }, [mapNodes]);
  // ドラッグ中フラグ（true の間はノードの作り直しを止めて位置を死守）
  const isDraggingRef = useRef(false);

  // ===== 外部ノード更新（構造・位置）: 生成/追加/ロールバック/ドラッグ確定時 =====
  useEffect(() => {
    if (isDraggingRef.current) return; // ドラッグ中は再構築しない
    setFlowNodes(toFlowNodes(mapNodes, nodeStatusesRef.current, surroundingRef.current));
  }, [mapNodes, setFlowNodes]);

  // ===== ステータス/周辺概念のみ更新: 位置は保持しデータだけ差し替え =====
  useEffect(() => {
    if (isDraggingRef.current) return; // ドラッグ中は触らない（位置巻き戻し防止）
    setFlowNodes((prev) => {
      const built = toFlowNodes(mapNodesRef.current, nodeStatuses, surroundingConcepts);
      const dataById: Record<string, any> = {};
      built.forEach((n) => { dataById[n.id] = n.data; });
      return prev.map((n) => (dataById[n.id] ? { ...n, data: dataById[n.id] } : n));
    });
  }, [nodeStatuses, surroundingConcepts, setFlowNodes]);

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

  // ===== ★ FB2: つながりのフォーカス（該当ノード・エッジを発光）=====
  const hlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const labelOf = (id: string) => {
      const n = mapNodesRef.current.find((m) => m.id === id);
      return n?.label || n?.data?.label || '';
    };
    const clear = () => {
      setFlowNodes((nds) => nds.map((n) =>
        (n.data as any)?._hl ? { ...n, data: { ...n.data, _hl: false } } : n));
      setFlowEdges((eds) => eds.map((e) =>
        (e.data as any)?._hl
          ? { ...e, animated: false, style: undefined, data: { ...e.data, _hl: false } }
          : e));
    };
    const onFocus = (ev: Event) => {
      const { source, target } = (ev as CustomEvent).detail || {};
      if (!source || !target) return;
      const focusLabels = new Set([source, target]);

      setFlowNodes((nds) => nds.map((n) => {
        const lb = n.data?.label || '';
        const hit = focusLabels.has(lb);
        return { ...n, data: { ...n.data, _hl: hit } };
      }));

      setFlowEdges((eds) => eds.map((e) => {
        const s = labelOf(e.source);
        const t = labelOf(e.target);
        const hit = (s === source && t === target) || (s === target && t === source);
        return hit
          ? {
              ...e, animated: true,
              style: { stroke: '#7c3aed', strokeWidth: 3 },
              data: { ...e.data, _hl: true },
            }
          : { ...e, animated: false, style: undefined, data: { ...(e.data || {}), _hl: false } };
      }));

      if (hlTimerRef.current) clearTimeout(hlTimerRef.current);
      hlTimerRef.current = setTimeout(clear, 3000); // 3秒で解除
    };
    document.addEventListener('edge-highlight-focus', onFocus);
    return () => {
      document.removeEventListener('edge-highlight-focus', onFocus);
      if (hlTimerRef.current) clearTimeout(hlTimerRef.current);
    };
  }, [setFlowNodes, setFlowEdges]);

  // ===== 自動保存デバウンス =====
  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onAutoSave, 3000);
  }, [onAutoSave]);

  // 親state同期用に最新の flow ノード/エッジを ref で保持（更新関数内で親を更新しない）
  const flowNodesRef = useRef(flowNodes);
  useEffect(() => { flowNodesRef.current = flowNodes; }, [flowNodes]);
  const flowEdgesRef = useRef(flowEdges);
  useEffect(() => { flowEdgesRef.current = flowEdges; }, [flowEdges]);

  // ===== ノード変更（選択変更・ドラッグ移動等） =====
  const handleNChange = useCallback((c: any) => {
    onNChange(c); // まず React Flow 内部状態へ反映（ドラッグ追従はこちらで滑らかに）
    const arr = Array.isArray(c) ? c : [];
    const dragging = arr.some((ch: any) => ch.type === 'position' && ch.dragging === true);
    const dragEnded = arr.some((ch: any) => ch.type === 'position' && ch.dragging === false);
    if (dragging) { isDraggingRef.current = true; return; } // ドラッグ中は親へ同期しない
    // 親stateへの同期は次tickで（描画中の setState を避ける＝警告防止）
    setTimeout(() => { setMapNodes(fromFlowNodes(flowNodesRef.current)); }, 0);
    if (dragEnded) { isDraggingRef.current = false; schedule(); } // 確定で保存・再構築解禁
  }, [onNChange, setMapNodes, schedule]);

  // ===== ★ 中央クリック ドラッグ処理 =====
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
      // 位置を親に同期 + エッジハンドル再計算 + 自動保存（更新関数の外で親stateを更新）
      const nds = flowNodesRef.current;
      setMapNodes(fromFlowNodes(nds));
      const pm = buildPosMap(nds);
      setFlowEdges((eds) => toFlowEdges(fromFlowEdges(eds), pm));
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
      setMapEdges(fromFlowEdges(flowEdgesRef.current));
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
        nodesDraggable={true}
        nodeDragThreshold={6}
        connectionRadius={36}
        zoomOnDoubleClick={false}
        elevateNodesOnSelect
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
/**
 * ダッシュボードのビジネスロジック（Phase 3 v2）
 *
 * 変更点:
 * - マップ生成後に全ノードの関連科目を非同期取得し、
 *   過去（基礎）・未来（発展）それぞれ1件の科目マップをノードとして表示
 * - 関連ノードは topic detection / auto-save / realNodeCount から除外
 * - 全ての ref 経由で最新値を参照（クロージャの古い値問題を排除）
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  isAuthenticated, isAdmin, logout, getCurrentUserId,
  memoService, mapService, loggingService,
} from '@/services';
import { computeRadialLayout, generateId } from '@/utils';
import type {
  AppMode, ReflectionPhase, MapNode, MapEdge, Memo,
  NodeStatus, SurroundingConceptsMap, WritingSuggestion,
  TemporalRelationResponse, RelationSubMap,
} from '@/types';

// =============================================
// ユーティリティ関数
// =============================================

/** satellite ノードの位置計算 */
function placeSatellitePos(
  parentPos: { x: number; y: number }, count: number, index: number,
): { x: number; y: number } {
  const r = 130;
  const a = ((2 * Math.PI) / Math.max(count, 1)) * index - Math.PI / 2;
  return { x: parentPos.x + Math.cos(a) * r, y: parentPos.y + Math.sin(a) * r };
}

/**
 * 関連科目のサブマップを MapNode[] と MapEdge[] に変換してレイアウトする。
 *
 * @param subMap      バックエンドの past_map or future_map
 * @param originId    メインマップ上のノードID（接続元）
 * @param originPos   接続元ノードの位置
 * @param direction   'past' | 'future'
 * @param prefix      ID の衝突回避用プレフィクス
 */
function layoutRelationBranch(
  subMap: RelationSubMap,
  originId: string,
  originPos: { x: number; y: number },
  direction: 'past' | 'future',
  prefix: string,
): { nodes: MapNode[]; edges: MapEdge[] } {
  // Input グループのノードは除外（メインマップのノードそのもの）
  const branchNodes = subMap.nodes.filter((n) => n.group !== 'Input');
  if (branchNodes.length === 0) return { nodes: [], edges: [] };

  // Input ノードの ID を特定（エッジのリマップ用）
  const inputNode = subMap.nodes.find((n) => n.group === 'Input');
  const inputId = inputNode?.id || '';

  // 方向に応じたオフセット
  const xDir = direction === 'past' ? -1 : 1;
  const yBase = direction === 'past' ? 100 : -100;
  const spacing = 160;

  // ノードを作成
  const mapNodes: MapNode[] = branchNodes.map((n, i) => ({
    id: `${prefix}_${n.id}`,
    type: 'custom',
    position: {
      x: originPos.x + (i + 1) * spacing * xDir,
      y: originPos.y + yBase + (i % 2 === 0 ? 0 : 40),
    },
    data: {
      label: n.label,
      sentence: n.sentence || '',
      extend_query: '',
      status: (direction === 'past' ? 'relation_past' : 'relation_future') as NodeStatus,
      isSatellite: false,
      isRelation: true,
      relationDirection: direction,
      relationOriginId: originId,
      group: n.group || '',
      satellites: [],
    },
    label: n.label,
    sentence: n.sentence || '',
  }));

  // エッジを作成（Input ノードへの参照をメインマップのノードIDにリマップ）
  const mapEdges: MapEdge[] = subMap.edges
    .map((e) => {
      const src = e.source === inputId ? originId : `${prefix}_${e.source}`;
      const tgt = e.target === inputId ? originId : `${prefix}_${e.target}`;
      // 自己ループを除外
      if (src === tgt) return null;
      return {
        id: generateId('rel'),
        source: src,
        target: tgt,
        label: '',
        isSatellite: false,
        isRelation: true,
      };
    })
    .filter(Boolean) as MapEdge[];

  return { nodes: mapNodes, edges: mapEdges };
}

// =============================================
// メインフック
// =============================================

export function useDashboard() {
  const navigate = useNavigate();
  useEffect(() => { if (!isAuthenticated()) navigate('/login'); }, [navigate]);

  // ===== Core state =====
  const [mode, setMode]               = useState<AppMode>('reflection');
  const [phase, setPhase]             = useState<ReflectionPhase>('write');
  const [memoContent, setMemoContent] = useState('');
  const [currentMemo, setCurrentMemo] = useState<Memo | null>(null);
  const [nodes, setNodes]             = useState<MapNode[]>([]);
  const [edges, setEdges]             = useState<MapEdge[]>([]);
  const [loading, setLoading]         = useState(false);
  const [saveStatus, setSaveStatus]   = useState<'idle' | 'saving' | 'saved'>('idle');

  // refs で常に最新値を参照
  const edgesRef = useRef(edges);      useEffect(() => { edgesRef.current = edges; }, [edges]);
  const nodesRef = useRef(nodes);      useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const memoRef  = useRef(currentMemo); useEffect(() => { memoRef.current = currentMemo; }, [currentMemo]);

  const surroundingConcepts: SurroundingConceptsMap = {};

  // ===== 記述支援 state =====
  const [nodeStatuses, setNodeStatuses]       = useState<Record<string, NodeStatus>>({});
  const [describedLabels, setDescribedLabels] = useState<string[]>([]);
  const [currentlyWriting, setCurrWriting]    = useState<string | null>(null);
  const [nextSuggestions, setNextSugg]        = useState<WritingSuggestion[]>([]);
  const [detectingTopics, setDetecting]       = useState(false);

  // ===== パネル =====
  const [selectedNodeLabel, setSelectedNodeLabel] = useState<string | null>(null);
  const [showHistory, setShowHistory]             = useState(false);

  // ===== トピック検知 — デバウンスタイマー =====
  const topicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 通常ノード（satellite・relation 除外）のラベル一覧 */
  const getLatestRealLabels = useCallback((): string[] => {
    return nodesRef.current
      .filter((n) => !n.data?.isSatellite && !n.data?.isRelation)
      .map((n) => n.label || n.data?.label || n.id);
  }, []);

  // ===== トピック検知の実行（内部用） =====
  const runTopicDetection = useCallback(async (text: string) => {
    const labels = getLatestRealLabels();
    if (labels.length === 0 || !text.trim()) return;

    setDetecting(true);
    try {
      const r = await mapService.detectTopics(text, labels);
      const st: Record<string, NodeStatus> = {};
      labels.forEach((l) => (st[l] = 'default'));
      (r.described || []).forEach((l: string) => {
        if (st[l] !== undefined) st[l] = 'described';
      });
      if (r.currently_writing && st[r.currently_writing] !== undefined) {
        st[r.currently_writing] = 'currently_writing';
      }
      (r.next_suggestions || []).forEach((s: WritingSuggestion) => {
        if (st[s.node_label] === 'default') st[s.node_label] = 'suggested';
      });

      // ★ 関連ノードのステータスを保持（topic detection で上書きしない）
      nodesRef.current.forEach((n) => {
        if (n.data?.isRelation && n.data.status) {
          const lbl = n.label || n.data.label;
          if (lbl) st[lbl] = n.data.status;
        }
      });

      setNodeStatuses(st);
      setDescribedLabels(r.described || []);
      setCurrWriting(r.currently_writing || null);
      setNextSugg(r.next_suggestions || []);
    } catch (e) {
      console.error('トピック検知エラー:', e);
    } finally {
      setDetecting(false);
    }
  }, [getLatestRealLabels]);

  // ===== テキスト変更 → デバウンスでトピック検知 =====
  const handleTopicDetection = useCallback((text: string) => {
    if (topicTimerRef.current) clearTimeout(topicTimerRef.current);
    topicTimerRef.current = setTimeout(() => {
      runTopicDetection(text);
    }, 1500);
  }, [runTopicDetection]);

  // クリーンアップ
  useEffect(() => {
    return () => { if (topicTimerRef.current) clearTimeout(topicTimerRef.current); };
  }, []);

  // ===== モード切替 =====
  const handleModeChange = useCallback((m: AppMode) => {
    loggingService.logActivity('mode_switch', { from: mode, to: m }, memoRef.current?.id);
    setMode(m);
  }, [mode]);

  // =============================================
  // 関連科目取得 — マップ生成後に非同期で呼び出す
  // =============================================

  const fetchRelationsForNodes = useCallback(async (realNodes: MapNode[]) => {
    try {
      // 全ノードに対して並列で関連科目を取得
      const promises = realNodes.map((node) =>
        mapService
          .getTemporalRelations({
            label: node.label || node.data?.label || '',
            sentence: node.sentence || node.data?.sentence || '',
            id: node.id,
          })
          .catch(() => null),
      );

      const results = await Promise.all(promises);

      // 最初の有効な過去/未来結果を採用
      let pastResult: RelationSubMap | null = null;
      let futureResult: RelationSubMap | null = null;
      let pastOriginNode: MapNode | null = null;
      let futureOriginNode: MapNode | null = null;

      for (let i = 0; i < results.length; i++) {
        const r = results[i] as TemporalRelationResponse | null;
        if (!r) continue;

        if (
          !pastResult &&
          r.past_map?.nodes?.length > 1 // >1 は Input ノード以外が存在する場合
        ) {
          pastResult = r.past_map;
          pastOriginNode = realNodes[i];
        }
        if (
          !futureResult &&
          r.future_map?.nodes?.length > 1
        ) {
          futureResult = r.future_map;
          futureOriginNode = realNodes[i];
        }
        if (pastResult && futureResult) break;
      }

      // 関連ブランチをレイアウト
      const relNodes: MapNode[] = [];
      const relEdges: MapEdge[] = [];

      if (pastResult && pastOriginNode) {
        const branch = layoutRelationBranch(
          pastResult,
          pastOriginNode.id,
          pastOriginNode.position,
          'past',
          'rpast',
        );
        relNodes.push(...branch.nodes);
        relEdges.push(...branch.edges);
      }

      if (futureResult && futureOriginNode) {
        const branch = layoutRelationBranch(
          futureResult,
          futureOriginNode.id,
          futureOriginNode.position,
          'future',
          'rfut',
        );
        relNodes.push(...branch.nodes);
        relEdges.push(...branch.edges);
      }

      if (relNodes.length > 0) {
        setNodes((prev) => [...prev, ...relNodes]);
        setEdges((prev) => {
          const ne = [...prev, ...relEdges];
          edgesRef.current = ne;
          return ne;
        });
      }
    } catch (e) {
      console.warn('関連科目取得失敗:', e);
    }
  }, []);

  // =============================================
  // マップ生成
  // =============================================

  const handleGenerateMap = useCallback(async (content: string) => {
    setLoading(true);
    try {
      const { memo, map } = await memoService.createMemoWithMap(content, mode);
      setCurrentMemo(memo);

      const raw: MapNode[] = (map.nodes || []).map((n: any) => ({
        id: n.id,
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          label: n.label || n.data?.label || n.id,
          sentence: n.sentence || n.data?.sentence || '',
          extend_query: n.extend_query || n.data?.extend_query || '',
          status: 'default' as NodeStatus,
          isSatellite: false,
          isRelation: false,
          satellites: [],
        },
        label: n.label || n.data?.label,
        sentence: n.sentence || n.data?.sentence,
        extend_query: n.extend_query || n.data?.extend_query,
      }));
      const rawEdges: MapEdge[] = (map.edges || []).map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label || '',
        isSatellite: false,
        isRelation: false,
      }));

      const layout = computeRadialLayout(raw, rawEdges);
      setNodes(layout);
      setEdges(rawEdges);
      edgesRef.current = rawEdges;
      nodesRef.current = layout;
      setPhase('revise');
      loggingService.logActivity('map_generate', { node_count: layout.length }, memo.id);

      // ===== 非同期タスク: 周辺概念 + 関連科目を同時取得 =====

      // (A) 周辺概念 → satellite ノード+エッジ
      mapService
        .getSurroundingConcepts(layout)
        .then((surrounding) => {
          const satN: MapNode[] = [];
          const satE: MapEdge[] = [];
          const cur = nodesRef.current;
          for (const [parentLabel, concepts] of Object.entries(surrounding)) {
            const parent = cur.find((n) => (n.label || n.data?.label) === parentLabel);
            if (!parent) continue;
            concepts.forEach((c, ci) => {
              const sid = generateId('sat');
              satN.push({
                id: sid,
                type: 'custom',
                position: placeSatellitePos(parent.position, concepts.length, ci),
                data: {
                  label: c.label,
                  sentence: c.relation,
                  extend_query: '',
                  status: 'satellite' as NodeStatus,
                  isSatellite: true,
                  parentNodeId: parent.id,
                  isRelation: false,
                  satellites: [],
                },
                label: c.label,
                sentence: c.relation,
                extend_query: '',
              });
              satE.push({
                id: generateId('sedge'),
                source: parent.id,
                target: sid,
                label: c.relation,
                isSatellite: true,
                isRelation: false,
              });
            });
          }
          if (satN.length > 0) {
            setNodes((p) => [...p, ...satN]);
            setEdges((p) => {
              const ne = [...p, ...satE];
              edgesRef.current = ne;
              return ne;
            });
          }
        })
        .catch((e) => console.warn('周辺概念取得失敗:', e));

      // (B) ★ 関連科目 → relation ノード+エッジ（同時に開始）
      fetchRelationsForNodes(layout);
    } catch (e) {
      console.error('マップ生成エラー:', e);
    } finally {
      setLoading(false);
    }
  }, [mode, fetchRelationsForNodes]);

  // ===== ノード手動追加 =====
  const handleAddNode = useCallback(async (keyword: string) => {
    try {
      const r = await mapService.createManualNode(keyword);
      const nn: MapNode = {
        id: r.id || generateId('manual'),
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          label: r.label || keyword,
          sentence: r.sentence || '',
          extend_query: r.extend_query || '',
          status: 'default' as NodeStatus,
          isSatellite: false,
          isRelation: false,
          satellites: [],
        },
        label: r.label || keyword,
        sentence: r.sentence || '',
        extend_query: r.extend_query || '',
      };
      setNodes((prev) => {
        const real = prev.filter((n) => !n.data?.isSatellite && !n.data?.isRelation);
        const others = prev.filter((n) => n.data?.isSatellite || n.data?.isRelation);
        return [...computeRadialLayout([...real, nn], edgesRef.current), ...others];
      });
      loggingService.logActivity('node_add_ai', { keyword }, memoRef.current?.id);
    } catch (e) {
      console.error('ノード追加エラー:', e);
    }
  }, []);

  // ===== Satellite → 通常ノードに変換 =====
  const handleSatelliteAdd = useCallback((satNodeId: string) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === satNodeId
          ? { ...n, data: { ...n.data!, isSatellite: false, status: 'default' as NodeStatus } }
          : n,
      ),
    );
    setEdges((prev) => {
      const ne = prev.map((e) =>
        e.target === satNodeId && e.isSatellite ? { ...e, isSatellite: false } : e,
      );
      edgesRef.current = ne;
      return ne;
    });
    loggingService.logActivity(
      'node_add_ai',
      { from_satellite: true, nodeId: satNodeId },
      memoRef.current?.id,
    );
  }, []);

  // ===== 手動エッジ接続（ラベル付き） =====
  const handleConnect = useCallback((src: string, tgt: string, label: string) => {
    const newEdge: MapEdge = {
      id: generateId('edge'),
      source: src,
      target: tgt,
      label: label || '',
      isSatellite: false,
      isRelation: false,
    };
    setEdges((prev) => {
      const ne = [...prev, newEdge];
      edgesRef.current = ne;
      return ne;
    });
    loggingService.logActivity(
      'edge_connect',
      { source: src, target: tgt, label },
      memoRef.current?.id,
    );
  }, []);

  // ===== 自動保存（satellite・relation を除外） =====
  const handleAutoSave = useCallback(async () => {
    if (!memoRef.current) return;
    setSaveStatus('saving');
    try {
      const realN = nodesRef.current.filter((n) => !n.data?.isSatellite && !n.data?.isRelation);
      const realE = edgesRef.current.filter((e) => !e.isSatellite && !e.isRelation);
      await mapService.updateMap(memoRef.current.id, realN, realE);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    }
  }, []);

  // ===== ロールバック =====
  const handleRollback = useCallback(async (version: number) => {
    if (!memoRef.current) return;
    try {
      const m = await mapService.rollbackMap(memoRef.current.id, version);
      const ne = m.edges || [];
      setEdges(ne);
      edgesRef.current = ne;
      setNodes(computeRadialLayout(m.nodes || [], ne));
      setShowHistory(false);
      loggingService.logActivity('map_rollback', { version }, memoRef.current.id);
    } catch (e) {
      console.error('ロールバックエラー:', e);
    }
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [navigate]);

  // 通常ノード数（satellite・relation を除外）
  const realNodeCount = nodes.filter((n) => !n.data?.isSatellite && !n.data?.isRelation).length;

  return {
    mode,
    phase,
    memoContent,
    setMemoContent,
    currentMemo,
    nodes,
    setNodes,
    edges,
    setEdges,
    loading,
    saveStatus,
    surroundingConcepts,
    nodeStatuses,
    describedLabels,
    currentlyWriting: currentlyWriting,
    nextSuggestions,
    detectingTopics,
    selectedNodeLabel,
    setSelectedNodeLabel,
    showHistory,
    setShowHistory,
    isAdminUser: isAdmin(),
    userId: getCurrentUserId(),
    realNodeCount,
    handleModeChange,
    handleGenerateMap,
    handleTopicDetection,
    handleAddNode,
    handleSatelliteAdd,
    handleConnect,
    handleAutoSave,
    handleRollback,
    handleLogout,
    navigate,
  };
}
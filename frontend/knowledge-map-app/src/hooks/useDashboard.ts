/**
 * ダッシュボードのビジネスロジック（最終修正版）
 *
 * 修正:
 * - ノード配置の重なり防止（resolveOverlaps）
 * - satellite: 上半分、relation候補: 下半分（過去=左、未来=右）
 * - 展開ノード: 候補位置から外側へ直線的に配置
 * - selectedYear → API に渡す
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
  TemporalRelationResponse, RelationMapNode, RelationMapEdge,
  RelationSubGraphCache,
} from '@/types';

// =============================================
// 配置ユーティリティ
// =============================================

const NODE_W = 230;  // ノードの想定幅（重なり判定用）
const NODE_H = 90;   // ノードの想定高さ（重なり判定用）

/** satellite を親ノードの上半分（-160°〜-20°）に配置 */
function placeSatellitePos(
  parentPos: { x: number; y: number }, count: number, index: number,
): { x: number; y: number } {
  const r = 100;
  const startDeg = -160;
  const endDeg = -20;
  const spread = endDeg - startDeg;
  const step = count > 1 ? spread / (count - 1) : 0;
  const deg = startDeg + step * index;
  const a = (deg * Math.PI) / 180;
  return { x: parentPos.x + Math.cos(a) * r, y: parentPos.y + Math.sin(a) * r };
}

/** 関連科目候補を配置（過去=左、未来=右に明確分離） */
function placeRelationCandidatePos(
  parentPos: { x: number; y: number },
  direction: 'past' | 'future',
  index: number,
  total: number,
): { x: number; y: number } {
  const r = 350;
  // 過去: 真左（180°）を中心に上下に展開
  // 未来: 真右（0°）を中心に上下に展開
  const centerDeg = direction === 'past' ? 180 : 0;
  const spread = 60;
  const offset = total > 1 ? (index - (total - 1) / 2) * (spread / Math.max(total - 1, 1)) : 0;
  const deg = centerDeg + offset;
  const a = (deg * Math.PI) / 180;
  return { x: parentPos.x + Math.cos(a) * r, y: parentPos.y + Math.sin(a) * r };
}

/** 2ノードが重なっているか判定 */
function isOverlapping(
  a: { x: number; y: number }, b: { x: number; y: number },
  minDistX = NODE_W, minDistY = NODE_H,
): boolean {
  return Math.abs(a.x - b.x) < minDistX && Math.abs(a.y - b.y) < minDistY;
}

/** 配置済みノード群に対して重なりを解消する（新規ノード群をずらす） */
function resolveOverlaps(
  newNodes: MapNode[],
  existingNodes: MapNode[],
): MapNode[] {
  const allPositions = existingNodes.map((n) => ({ ...n.position }));
  const resolved = newNodes.map((node) => {
    let pos = { ...node.position };
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      const overlaps = allPositions.some((ep) => isOverlapping(pos, ep));
      if (!overlaps) break;
      // 放射方向にずらす
      const angle = Math.atan2(pos.y, pos.x || 0.01);
      pos = {
        x: pos.x + Math.cos(angle) * 70,
        y: pos.y + Math.sin(angle) * 70,
      };
      attempts++;
    }

    allPositions.push(pos);
    return { ...node, position: pos };
  });

  return resolved;
}

/** ノードIDから科目名を推定: "アルゴリズム論第二_0" → "アルゴリズム論第二" */
function extractSubjectFromId(id: string): string {
  if (!id || id.startsWith('input_')) return '';
  const match = id.match(/^(.+)_\d+$/);
  return match ? match[1] : '';
}

/** レスポンスのノード群を科目ごとにグルーピング */
function groupBySubject(
  nodes: RelationMapNode[],
  edges: RelationMapEdge[],
): Map<string, { nodes: RelationMapNode[]; edges: RelationMapEdge[] }> {
  const groups = new Map<string, { nodes: RelationMapNode[]; edges: RelationMapEdge[] }>();
  const nodeIdToGroup = new Map<string, string>();

  for (const n of nodes) {
    if (n.group === 'Input') continue;
    if (!n.label && !n.id) continue;
    const g = n.group || extractSubjectFromId(n.id) || n.label || '（関連科目）';
    nodeIdToGroup.set(n.id, g);
    if (!groups.has(g)) groups.set(g, { nodes: [], edges: [] });
    groups.get(g)!.nodes.push(n);
  }

  for (const e of edges) {
    const g = nodeIdToGroup.get(e.source) || nodeIdToGroup.get(e.target);
    if (g && groups.has(g)) groups.get(g)!.edges.push(e);
  }

  return groups;
}

/** 候補ノードの展開: サブグラフを MapNode/MapEdge に変換 */
function expandSubGraph(
  cache: RelationSubGraphCache,
  candidatePos: { x: number; y: number },
  existingNodes: MapNode[],
): { nodes: MapNode[]; edges: MapEdge[] } {
  const { nodes: rawNodes, edges: rawEdges, direction, originNodeId, subjectName } = cache;
  if (rawNodes.length === 0) return { nodes: [], edges: [] };

  const xDir = direction === 'past' ? -1 : 1;
  const spacing = 350;
  const status: NodeStatus = direction === 'past' ? 'relation_past' : 'relation_future';

  // ★ 候補ノードの位置を起点に、外側へ直線的に並べる
  const rawMapped: MapNode[] = rawNodes.map((n, i) => ({
    id: generateId('rn'),
    type: 'custom',
    position: {
      x: candidatePos.x + (i + 1) * spacing * xDir,
      y: candidatePos.y + (i % 2 === 0 ? 0 : 70) * (i % 4 < 2 ? 1 : -1),
    },
    data: {
      label: n.label || n.id || '（不明）',
      sentence: n.sentence || '',
      extend_query: '',
      status,
      isSatellite: false,
      isRelation: true,
      relationDirection: direction,
      relationOriginId: originNodeId,
      group: subjectName,
      satellites: [],
    },
    label: n.label || n.id || '（不明）',
    sentence: n.sentence || '',
  }));

  // 重なり解消
  const nodes = resolveOverlaps(rawMapped, existingNodes);

  // IDマッピング（旧→新）
  const oldToNew = new Map<string, string>();
  rawNodes.forEach((n, i) => { oldToNew.set(n.id, nodes[i].id); });

  const edges: MapEdge[] = [];

  // 起点ノード → 最初の展開ノードへ接続
  if (nodes.length > 0) {
    edges.push({
      id: generateId('rle'), source: originNodeId, target: nodes[0].id,
      label: '', isSatellite: false, isRelation: true,
    });
  }

  // 展開ノード間のエッジ
  for (const e of rawEdges) {
    const src = oldToNew.get(e.source);
    const tgt = oldToNew.get(e.target);
    if (src && tgt && src !== tgt) {
      edges.push({
        id: generateId('rle'), source: src, target: tgt,
        label: '', isSatellite: false, isRelation: true,
      });
    }
  }

  return { nodes, edges };
}

// =============================================
// メインフック
// =============================================

export function useDashboard() {
  const navigate = useNavigate();
  useEffect(() => { if (!isAuthenticated()) navigate('/login'); }, [navigate]);

  const [mode, setMode] = useState<AppMode>('reflection');
  const [phase, setPhase] = useState<ReflectionPhase>('write');
  const [memoContent, setMemoContent] = useState('');
  const [currentMemo, setCurrentMemo] = useState<Memo | null>(null);
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [edges, setEdges] = useState<MapEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [selectedYear, setSelectedYear] = useState<number>(3);

  const edgesRef = useRef(edges);     useEffect(() => { edgesRef.current = edges; }, [edges]);
  const nodesRef = useRef(nodes);     useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const memoRef = useRef(currentMemo); useEffect(() => { memoRef.current = currentMemo; }, [currentMemo]);
  const yearRef = useRef(selectedYear); useEffect(() => { yearRef.current = selectedYear; }, [selectedYear]);

  const surroundingConcepts: SurroundingConceptsMap = {};

  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
  const [describedLabels, setDescribedLabels] = useState<string[]>([]);
  const [currentlyWriting, setCurrWriting] = useState<string | null>(null);
  const [nextSuggestions, setNextSugg] = useState<WritingSuggestion[]>([]);
  const [detectingTopics, setDetecting] = useState(false);

  const [selectedNodeLabel, setSelectedNodeLabel] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const relationCacheRef = useRef<Map<string, RelationSubGraphCache>>(new Map());
  const topicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getLatestRealLabels = useCallback((): string[] => {
    return nodesRef.current
      .filter((n) => !n.data?.isSatellite && !n.data?.isRelation)
      .map((n) => n.label || n.data?.label || n.id);
  }, []);

  const runTopicDetection = useCallback(async (text: string) => {
    const labels = getLatestRealLabels();
    if (labels.length === 0 || !text.trim()) return;
    setDetecting(true);
    try {
      const r = await mapService.detectTopics(text, labels);
      const st: Record<string, NodeStatus> = {};
      labels.forEach((l) => (st[l] = 'default'));
      (r.described || []).forEach((l: string) => { if (st[l] !== undefined) st[l] = 'described'; });
      if (r.currently_writing && st[r.currently_writing] !== undefined) st[r.currently_writing] = 'currently_writing';
      (r.next_suggestions || []).forEach((s: WritingSuggestion) => { if (st[s.node_label] === 'default') st[s.node_label] = 'suggested'; });
      nodesRef.current.forEach((n) => {
        if (n.data?.isRelation && n.data.status) {
          const lbl = n.label || n.data.label;
          if (lbl) st[lbl] = n.data.status;
        }
      });
      setNodeStatuses(st); setDescribedLabels(r.described || []);
      setCurrWriting(r.currently_writing || null); setNextSugg(r.next_suggestions || []);
    } catch (e) { console.error('トピック検知エラー:', e); } finally { setDetecting(false); }
  }, [getLatestRealLabels]);

  const handleTopicDetection = useCallback((text: string) => {
    if (topicTimerRef.current) clearTimeout(topicTimerRef.current);
    topicTimerRef.current = setTimeout(() => runTopicDetection(text), 1500);
  }, [runTopicDetection]);

  useEffect(() => { return () => { if (topicTimerRef.current) clearTimeout(topicTimerRef.current); }; }, []);

  const handleModeChange = useCallback((m: AppMode) => {
    loggingService.logActivity('mode_switch', { from: mode, to: m }, memoRef.current?.id);
    setMode(m);
  }, [mode]);

  // =============================================
  // 関連科目: 候補ノード作成
  // =============================================

  const fetchRelationsForNodes = useCallback(async (realNodes: MapNode[]) => {
    const year = yearRef.current;
    try {
      const promises = realNodes.map((node) =>
        mapService.getTemporalRelations({
          label: node.label || node.data?.label || '',
          sentence: node.sentence || node.data?.sentence || '',
          id: node.id, year,
        })
          .then((r) => (r.error ? null : r))
          .catch(() => null),
      );

      const results = await Promise.all(promises);
      const candidateNodes: MapNode[] = [];
      const candidateEdges: MapEdge[] = [];

      for (let i = 0; i < results.length; i++) {
        const r = results[i] as TemporalRelationResponse | null;
        if (!r) continue;

        const origin = realNodes[i];
        const oId = origin.id;
        const oPos = origin.position;

        // --- 過去 ---
        const pastNodes = r.past_map?.nodes;
        if (Array.isArray(pastNodes) && pastNodes.length > 0) {
          const groups = groupBySubject(pastNodes, r.past_map?.edges || []);
          let idx = 0;
          const total = Math.min(groups.size, 3);
          for (const [subjectName, sg] of groups) {
            if (idx >= 3) break;
            const cid = generateId('rpc');
            relationCacheRef.current.set(cid, {
              subjectName, direction: 'past', originNodeId: oId,
              nodes: sg.nodes, edges: sg.edges,
            });
            candidateNodes.push({
              id: cid, type: 'custom',
              position: placeRelationCandidatePos(oPos, 'past', idx, total),
              data: {
                label: subjectName,
                sentence: `基礎科目 — ${sg.nodes.length} 概念`,
                extend_query: '', status: 'relation_past_candidate' as NodeStatus,
                isSatellite: false, isRelation: true,
                relationDirection: 'past', relationOriginId: oId,
                relationSubjectName: subjectName, group: subjectName, satellites: [],
              },
              label: subjectName,
            });
            candidateEdges.push({
              id: generateId('rpce'), source: oId, target: cid,
              label: '', isSatellite: false, isRelation: true,
            });
            idx++;
          }
        }

        // --- 未来 ---
        const futureNodes = r.future_map?.nodes;
        if (Array.isArray(futureNodes) && futureNodes.length > 0) {
          const groups = groupBySubject(futureNodes, r.future_map?.edges || []);
          let idx = 0;
          const total = Math.min(groups.size, 3);
          for (const [subjectName, sg] of groups) {
            if (idx >= 3) break;
            const cid = generateId('rfc');
            relationCacheRef.current.set(cid, {
              subjectName, direction: 'future', originNodeId: oId,
              nodes: sg.nodes, edges: sg.edges,
            });
            candidateNodes.push({
              id: cid, type: 'custom',
              position: placeRelationCandidatePos(oPos, 'future', idx, total),
              data: {
                label: subjectName,
                sentence: `発展科目 — ${sg.nodes.length} 概念`,
                extend_query: '', status: 'relation_future_candidate' as NodeStatus,
                isSatellite: false, isRelation: true,
                relationDirection: 'future', relationOriginId: oId,
                relationSubjectName: subjectName, group: subjectName, satellites: [],
              },
              label: subjectName,
            });
            candidateEdges.push({
              id: generateId('rfce'), source: oId, target: cid,
              label: '', isSatellite: false, isRelation: true,
            });
            idx++;
          }
        }
      }

      if (candidateNodes.length > 0) {
        // ★ 重なり解消してから追加
        const resolved = resolveOverlaps(candidateNodes, nodesRef.current);
        setNodes((prev) => [...prev, ...resolved]);
        setEdges((prev) => { const ne = [...prev, ...candidateEdges]; edgesRef.current = ne; return ne; });
      }
    } catch (e) {
      console.warn('関連科目候補取得失敗:', e);
    }
  }, []);

  // =============================================
  // 関連科目: 候補を展開（「詳細を表示」）
  // =============================================

  const handleExpandRelation = useCallback((candidateNodeId: string) => {
    const cache = relationCacheRef.current.get(candidateNodeId);
    if (!cache) return;

    // 候補ノードの位置を取得（展開の起点とする）
    const candidateNode = nodesRef.current.find((n) => n.id === candidateNodeId);
    const candidatePos = candidateNode?.position || { x: 0, y: 0 };

    // 候補ノードを除いた既存ノード一覧（重なり判定用）
    const existing = nodesRef.current.filter((n) => n.id !== candidateNodeId);

    const { nodes: expNodes, edges: expEdges } = expandSubGraph(cache, candidatePos, existing);

    setNodes((prev) => [...prev.filter((n) => n.id !== candidateNodeId), ...expNodes]);
    setEdges((prev) => {
      const ne = [
        ...prev.filter((e) => e.source !== candidateNodeId && e.target !== candidateNodeId),
        ...expEdges,
      ];
      edgesRef.current = ne;
      return ne;
    });

    relationCacheRef.current.delete(candidateNodeId);
    loggingService.logActivity('relation_expanded', {
      subject: cache.subjectName, direction: cache.direction,
      expanded_nodes: expNodes.length,
    }, memoRef.current?.id);
  }, []);

  // relation-expand イベント（CustomNode から発火）
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.nodeId) handleExpandRelation(d.nodeId);
    };
    document.addEventListener('relation-expand', handler);
    return () => document.removeEventListener('relation-expand', handler);
  }, [handleExpandRelation]);

  // =============================================
  // マップ生成
  // =============================================

  const handleGenerateMap = useCallback(async (content: string) => {
    setLoading(true);
    relationCacheRef.current.clear();
    try {
      const { memo, map } = await memoService.createMemoWithMap(content, mode);
      setCurrentMemo(memo);

      const raw: MapNode[] = (map.nodes || []).map((n: any) => ({
        id: n.id, type: 'custom', position: { x: 0, y: 0 },
        data: {
          label: n.label || n.data?.label || n.id,
          sentence: n.sentence || n.data?.sentence || '',
          extend_query: n.extend_query || n.data?.extend_query || '',
          status: 'default' as NodeStatus,
          isSatellite: false, isRelation: false, satellites: [],
        },
        label: n.label || n.data?.label, sentence: n.sentence || n.data?.sentence,
        extend_query: n.extend_query || n.data?.extend_query,
      }));
      const rawEdges: MapEdge[] = (map.edges || []).map((e: any) => ({
        id: e.id, source: e.source, target: e.target,
        label: e.label || '', isSatellite: false, isRelation: false,
      }));

      const layout = computeRadialLayout(raw, rawEdges);
      setNodes(layout); setEdges(rawEdges);
      edgesRef.current = rawEdges; nodesRef.current = layout;
      setPhase('revise');
      loggingService.logActivity('map_generate', { node_count: layout.length }, memo.id);

      // (A) 周辺概念 → satellite（上半分に配置）
      mapService.getSurroundingConcepts(layout)
        .then((surrounding) => {
          const satN: MapNode[] = []; const satE: MapEdge[] = [];
          const cur = nodesRef.current;
          for (const [parentLabel, concepts] of Object.entries(surrounding)) {
            const parent = cur.find((n) => (n.label || n.data?.label) === parentLabel);
            if (!parent) continue;
            concepts.forEach((c, ci) => {
              const sid = generateId('sat');
              satN.push({ id: sid, type: 'custom',
                position: placeSatellitePos(parent.position, concepts.length, ci),
                data: { label: c.label, sentence: c.relation, extend_query: '',
                  status: 'satellite' as NodeStatus, isSatellite: true, parentNodeId: parent.id,
                  isRelation: false, satellites: [] },
                label: c.label, sentence: c.relation,
              });
              satE.push({ id: generateId('sedge'), source: parent.id, target: sid,
                label: c.relation, isSatellite: true, isRelation: false });
            });
          }
          if (satN.length > 0) {
            // ★ satellite は親ノードに近接配置するため、重なり解消しない
            setNodes((p) => [...p, ...satN]);
            setEdges((p) => { const ne = [...p, ...satE]; edgesRef.current = ne; return ne; });
          }
        })
        .catch((e) => console.warn('周辺概念取得失敗:', e));

      // (B) 関連科目候補（下半分に配置）
      fetchRelationsForNodes(layout);
    } catch (e) {
      console.error('マップ生成エラー:', e);
    } finally {
      setLoading(false);
    }
  }, [mode, fetchRelationsForNodes]);

  // ===== その他ハンドラ =====

  const handleAddNode = useCallback(async (keyword: string) => {
    try {
      const r = await mapService.createManualNode(keyword);
      const nn: MapNode = {
        id: r.id || generateId('manual'), type: 'custom', position: { x: 0, y: 0 },
        data: { label: r.label || keyword, sentence: r.sentence || '',
          extend_query: r.extend_query || '', status: 'default' as NodeStatus,
          isSatellite: false, isRelation: false, satellites: [] },
        label: r.label || keyword, sentence: r.sentence, extend_query: r.extend_query,
      };
      setNodes((prev) => {
        const real = prev.filter((n) => !n.data?.isSatellite && !n.data?.isRelation);
        const others = prev.filter((n) => n.data?.isSatellite || n.data?.isRelation);
        return [...computeRadialLayout([...real, nn], edgesRef.current), ...others];
      });
    } catch (e) { console.error('ノード追加エラー:', e); }
  }, []);

  const handleSatelliteAdd = useCallback((satNodeId: string) => {
    setNodes((prev) => prev.map((n) =>
      n.id === satNodeId ? { ...n, data: { ...n.data!, isSatellite: false, status: 'default' as NodeStatus } } : n));
    setEdges((prev) => {
      const ne = prev.map((e) => (e.target === satNodeId && e.isSatellite) ? { ...e, isSatellite: false } : e);
      edgesRef.current = ne; return ne;
    });
  }, []);

  const handleConnect = useCallback((src: string, tgt: string, label: string) => {
    const ne: MapEdge = { id: generateId('edge'), source: src, target: tgt, label: label || '', isSatellite: false, isRelation: false };
    setEdges((prev) => { const nw = [...prev, ne]; edgesRef.current = nw; return nw; });
  }, []);

  const handleAutoSave = useCallback(async () => {
    if (!memoRef.current) return;
    setSaveStatus('saving');
    try {
      const realN = nodesRef.current.filter((n) => !n.data?.isSatellite && !n.data?.isRelation);
      const realE = edgesRef.current.filter((e) => !e.isSatellite && !e.isRelation);
      await mapService.updateMap(memoRef.current.id, realN, realE);
      setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 2000);
    } catch { setSaveStatus('idle'); }
  }, []);

  const handleRollback = useCallback(async (version: number) => {
    if (!memoRef.current) return;
    try {
      const m = await mapService.rollbackMap(memoRef.current.id, version);
      const ne = m.edges || [];
      setEdges(ne); edgesRef.current = ne;
      setNodes(computeRadialLayout(m.nodes || [], ne));
      setShowHistory(false); relationCacheRef.current.clear();
    } catch (e) { console.error('ロールバックエラー:', e); }
  }, []);

  const handleLogout = useCallback(() => { logout(); navigate('/login'); }, [navigate]);

  const realNodeCount = nodes.filter((n) => !n.data?.isSatellite && !n.data?.isRelation).length;

  return {
    mode, phase, memoContent, setMemoContent, currentMemo,
    nodes, setNodes, edges, setEdges, loading, saveStatus,
    surroundingConcepts, nodeStatuses,
    describedLabels, currentlyWriting: currentlyWriting,
    nextSuggestions, detectingTopics,
    selectedNodeLabel, setSelectedNodeLabel,
    selectedYear, setSelectedYear,
    showHistory, setShowHistory,
    isAdminUser: isAdmin(), userId: getCurrentUserId(),
    realNodeCount,
    handleModeChange, handleGenerateMap, handleTopicDetection,
    handleAddNode, handleSatelliteAdd, handleConnect,
    handleAutoSave, handleRollback, handleLogout,
    handleExpandRelation, navigate,
  };
}
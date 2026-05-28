/**
 * ダッシュボードのビジネスロジック (v3.2.1 完全マージ版)
 *
 * 既存ロジック(関連科目・周辺概念・トピック検知・ロールバック等)は完全保持.
 *
 * v3.2.1 で追加:
 *   - memoTitle state とタイトル変更時の自動保存
 *   - memoContent 変更時の自動保存(以前は保存されなかった)
 *   - handleAutoSave をマップ+メモ+タイトルの並列保存に拡張
 *   - handleCreateBlankMemo (新しいマップボタン用、二重実行ガード付き)
 *   - loadExistingMemo (マップ一覧から既存マップを開く)
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
// 配置ユーティリティ(既存のまま、無変更)
// =============================================

const NODE_W = 230;
const NODE_H = 90;

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

function findClosestNode(
  nodes: MapNode[],
  targetX: number,
  targetY: number,
): MapNode {
  let closest = nodes[0];
  let minDist = Infinity;
  for (const n of nodes) {
    const dx = n.position.x - targetX;
    const dy = n.position.y - targetY;
    const d = dx * dx + dy * dy;
    if (d < minDist) { minDist = d; closest = n; }
  }
  return closest;
}

function isOverlapping(
  a: { x: number; y: number }, b: { x: number; y: number },
  minDistX = NODE_W, minDistY = NODE_H,
): boolean {
  return Math.abs(a.x - b.x) < minDistX && Math.abs(a.y - b.y) < minDistY;
}

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

function extractSubjectFromId(id: string): string {
  if (!id || id.startsWith('input_')) return '';
  const match = id.match(/^(.+)_\d+$/);
  return match ? match[1] : '';
}

function groupBySubject(
  nodes: RelationMapNode[],
  edges: RelationMapEdge[],
): Map<string, { nodes: RelationMapNode[]; edges: RelationMapEdge[] }> {
  const groups = new Map<string, { nodes: RelationMapNode[]; edges: RelationMapEdge[] }>();
  const nodeIdToGroup = new Map<string, string>();

  for (const n of nodes) {
    if (n.group === 'Input') continue;
    if (!n.label && !n.id) continue;
    const g = n.group || extractSubjectFromId(n.id) || n.label || '(関連科目)';
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

  const rawMapped: MapNode[] = rawNodes.map((n, i) => ({
    id: generateId('rn'),
    type: 'custom',
    position: {
      x: candidatePos.x + (i + 1) * spacing * xDir,
      y: candidatePos.y + (i % 2 === 0 ? 0 : 70) * (i % 4 < 2 ? 1 : -1),
    },
    data: {
      label: n.label || n.id || '(不明)',
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
    label: n.label || n.id || '(不明)',
    sentence: n.sentence || '',
  }));

  const nodes = resolveOverlaps(rawMapped, existingNodes);

  const oldToNew = new Map<string, string>();
  rawNodes.forEach((n, i) => { oldToNew.set(n.id, nodes[i].id); });

  const edges: MapEdge[] = [];
  if (nodes.length > 0) {
    edges.push({
      id: generateId('rle'), source: originNodeId, target: nodes[0].id,
      label: '', isSatellite: false, isRelation: true,
    });
  }
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

/**
 * getMap など各種 API が返す「マップ」データから nodes/edges を取り出して正規化する.
 * 戻り構造のゆれ(map でラップ / knowledge_map / JSON 文字列 など)を吸収する.
 */
function extractNodesEdges(raw: any): { nodes: any[]; edges: any[] } {
  if (!raw) return { nodes: [], edges: [] };

  // ラップを順にほどく
  let obj = raw;
  // よくあるラッパーキーを探索
  const wrapKeys = ['map', 'knowledge_map', 'knowledgeMap', 'data', 'result'];
  for (const k of wrapKeys) {
    if (obj && typeof obj === 'object' && obj[k] && typeof obj[k] === 'object') {
      // ラッパーの中に nodes/edges があればそちらを優先
      if (obj[k].nodes !== undefined || obj[k].edges !== undefined ||
          obj[k].nodes_json !== undefined || obj[k].edges_json !== undefined) {
        obj = obj[k];
        break;
      }
    }
  }

  // nodes/edges を取り出す(別名・JSON文字列にも対応)
  let nodes: any = obj.nodes ?? obj.nodes_json ?? obj.node_list ?? [];
  let edges: any = obj.edges ?? obj.edges_json ?? obj.edge_list ?? [];

  // JSON 文字列で入っている場合はパース
  if (typeof nodes === 'string') {
    try { nodes = JSON.parse(nodes); } catch { nodes = []; }
  }
  if (typeof edges === 'string') {
    try { edges = JSON.parse(edges); } catch { edges = []; }
  }

  if (!Array.isArray(nodes)) nodes = [];
  if (!Array.isArray(edges)) edges = [];

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

  // ★★★ v3.2.1 追加: タイトル ★★★
  const [memoTitle, setMemoTitle] = useState<string>('');

  const edgesRef = useRef(edges);     useEffect(() => { edgesRef.current = edges; }, [edges]);
  const nodesRef = useRef(nodes);     useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const memoRef = useRef(currentMemo); useEffect(() => { memoRef.current = currentMemo; }, [currentMemo]);
  const yearRef = useRef(selectedYear); useEffect(() => { yearRef.current = selectedYear; }, [selectedYear]);

  // ★★★ v3.2.1 追加: タイトル・本文の最新値を ref で保持 ★★★
  const titleRef = useRef(memoTitle);
  useEffect(() => { titleRef.current = memoTitle; }, [memoTitle]);
  const contentRef = useRef(memoContent);
  useEffect(() => { contentRef.current = memoContent; }, [memoContent]);

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

  // ★★★ v3.2.1 追加: 自動保存のデバウンスタイマー ★★★
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ★★★ v3.2.1 追加: handleCreateBlankMemo の二重実行ガード ★★★
  const isCreatingBlankRef = useRef<boolean>(false);

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

  useEffect(() => {
    return () => {
      if (topicTimerRef.current) clearTimeout(topicTimerRef.current);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const handleModeChange = useCallback((m: AppMode) => {
    loggingService.logActivity('mode_switch', { from: mode, to: m }, memoRef.current?.id);
    setMode(m);
  }, [mode]);

  // =============================================
  // 関連科目: マップ全体から候補を算出(既存のまま)
  // =============================================

  const fetchRelationsForMap = useCallback(async (realNodes: MapNode[]) => {
    if (realNodes.length === 0) return;
    const year = yearRef.current;

    try {
      const combinedLabel = realNodes
        .map((n) => n.label || n.data?.label || '')
        .filter(Boolean)
        .join('、');
      const combinedSentence = realNodes
        .map((n) => n.sentence || n.data?.sentence || '')
        .filter(Boolean)
        .join(' ');

      const r = await mapService
        .getTemporalRelations({
          label: combinedLabel,
          sentence: combinedSentence,
          year,
        })
        .catch(() => null);

      if (!r || r.error) {
        console.warn('関連科目取得エラー:', r?.error);
        return;
      }

      const xs = realNodes.map((n) => n.position.x);
      const ys = realNodes.map((n) => n.position.y);
      const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
      const mapWidth = Math.max(...xs) - Math.min(...xs);
      const offsetX = Math.max(mapWidth / 2, 300) + 450;

      const candidateNodes: MapNode[] = [];
      const candidateEdges: MapEdge[] = [];

      // 過去(基礎)科目
      const pastNodes = r.past_map?.nodes;
      if (Array.isArray(pastNodes) && pastNodes.length > 0) {
        const groups = groupBySubject(pastNodes, r.past_map?.edges || []);
        const total = Math.min(groups.size, 3);
        if (total > 0) {
          const headerId = generateId('rph');
          candidateNodes.push({
            id: headerId, type: 'custom',
            position: { x: centerX - offsetX, y: centerY - (total * 60) - 30 },
            data: {
              label: '📘 過去の関連科目',
              sentence: '', extend_query: '',
              status: 'relation_past' as NodeStatus,
              isSatellite: false, isRelation: true,
              relationDirection: 'past', group: '', satellites: [],
            },
            label: '📘 過去の関連科目',
          });

          let idx = 0;
          for (const [subjectName, sg] of groups) {
            if (idx >= 3) break;
            const cid = generateId('rpc');
            const closestNode = findClosestNode(realNodes, centerX - offsetX, centerY);
            relationCacheRef.current.set(cid, {
              subjectName, direction: 'past',
              originNodeId: closestNode.id,
              nodes: sg.nodes, edges: sg.edges,
            });
            const yOffset = (idx - (total - 1) / 2) * 120;
            candidateNodes.push({
              id: cid, type: 'custom',
              position: { x: centerX - offsetX, y: centerY + yOffset },
              data: {
                label: subjectName,
                sentence: `基礎科目 — ${sg.nodes.length} 概念`,
                extend_query: '', status: 'relation_past_candidate' as NodeStatus,
                isSatellite: false, isRelation: true,
                relationDirection: 'past', relationOriginId: closestNode.id,
                relationSubjectName: subjectName, group: subjectName, satellites: [],
              },
              label: subjectName,
            });
            candidateEdges.push({
              id: generateId('rphe'), source: headerId, target: cid,
              label: '', isSatellite: false, isRelation: true,
            });
            idx++;
          }
        }
      }

      // 未来(発展)科目
      const futureNodes = r.future_map?.nodes;
      if (Array.isArray(futureNodes) && futureNodes.length > 0) {
        const groups = groupBySubject(futureNodes, r.future_map?.edges || []);
        const total = Math.min(groups.size, 3);
        if (total > 0) {
          const headerId = generateId('rfh');
          candidateNodes.push({
            id: headerId, type: 'custom',
            position: { x: centerX + offsetX, y: centerY - (total * 60) - 30 },
            data: {
              label: '📗 未来の関連科目',
              sentence: '', extend_query: '',
              status: 'relation_future' as NodeStatus,
              isSatellite: false, isRelation: true,
              relationDirection: 'future', group: '', satellites: [],
            },
            label: '📗 未来の関連科目',
          });

          let idx = 0;
          for (const [subjectName, sg] of groups) {
            if (idx >= 3) break;
            const cid = generateId('rfc');
            const closestNode = findClosestNode(realNodes, centerX + offsetX, centerY);
            relationCacheRef.current.set(cid, {
              subjectName, direction: 'future',
              originNodeId: closestNode.id,
              nodes: sg.nodes, edges: sg.edges,
            });
            const yOffset = (idx - (total - 1) / 2) * 120;
            candidateNodes.push({
              id: cid, type: 'custom',
              position: { x: centerX + offsetX, y: centerY + yOffset },
              data: {
                label: subjectName,
                sentence: `発展科目 — ${sg.nodes.length} 概念`,
                extend_query: '', status: 'relation_future_candidate' as NodeStatus,
                isSatellite: false, isRelation: true,
                relationDirection: 'future', relationOriginId: closestNode.id,
                relationSubjectName: subjectName, group: subjectName, satellites: [],
              },
              label: subjectName,
            });
            candidateEdges.push({
              id: generateId('rfhe'), source: headerId, target: cid,
              label: '', isSatellite: false, isRelation: true,
            });
            idx++;
          }
        }
      }

      if (candidateNodes.length > 0) {
        const resolved = resolveOverlaps(candidateNodes, nodesRef.current);
        setNodes((prev) => [...prev, ...resolved]);
        setEdges((prev) => { const ne = [...prev, ...candidateEdges]; edgesRef.current = ne; return ne; });
      }
    } catch (e) {
      console.warn('関連科目候補取得失敗:', e);
    }
  }, []);

  // =============================================
  // 関連科目: 候補を展開(既存のまま)
  // =============================================

  const handleExpandRelation = useCallback((candidateNodeId: string) => {
    const cache = relationCacheRef.current.get(candidateNodeId);
    if (!cache) return;
    const candidateNode = nodesRef.current.find((n) => n.id === candidateNodeId);
    const candidatePos = candidateNode?.position || { x: 0, y: 0 };
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

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.nodeId) handleExpandRelation(d.nodeId);
    };
    document.addEventListener('relation-expand', handler);
    return () => document.removeEventListener('relation-expand', handler);
  }, [handleExpandRelation]);

  // =============================================
  // ★★★ 追加: ノード単位の周辺概念オンデマンド取得(再帰利用可)★★★
  //   マップ生成時の一括取得(handleGenerateMap 内)はそのまま残す.
  //   ここではユーザーが任意のノードを指定し、その周辺概念だけを
  //   satellite ノードとして追加する. 追加された satellite を
  //   「マップに追加」で通常ノードへ昇格させれば、そのノードからさらに
  //   本ハンドラを呼べるため、周辺概念の再帰的な探索が可能になる.
  // =============================================

  const handleFetchSurrounding = useCallback(async (nodeId: string) => {
    const cur = nodesRef.current;
    const parent = cur.find((n) => n.id === nodeId);
    if (!parent) return;
    const parentLabel = parent.label || parent.data?.label || '';
    if (!parentLabel) return;

    // 既にマップ上にあるラベル(重複追加を防ぐ)
    const existingLabels = new Set(
      cur.map((n) => (n.label || n.data?.label || '')).filter(Boolean),
    );

    try {
      const surrounding = await mapService.getSurroundingConcepts([parent]);
      // キーは親ラベルのはずだが、バックエンドのキー揺れに備えフォールバック
      const concepts: { label: string; relation: string }[] =
        (surrounding as any)[parentLabel] ??
        (Object.values(surrounding)[0] as any) ??
        [];

      const fresh = concepts.filter((c) => c.label && !existingLabels.has(c.label));
      if (fresh.length === 0) {
        loggingService.logActivity('surrounding_fetch_empty' as any, { parent: parentLabel }, memoRef.current?.id);
        return;
      }

      const rawSat: MapNode[] = fresh.map((c, ci) => {
        const sid = generateId('sat');
        return {
          id: sid, type: 'custom',
          position: placeSatellitePos(parent.position, fresh.length, ci),
          data: {
            label: c.label, sentence: c.relation, extend_query: '',
            status: 'satellite' as NodeStatus, isSatellite: true,
            parentNodeId: parent.id, isRelation: false, satellites: [],
          },
          label: c.label, sentence: c.relation,
        };
      });
      // 既存ノード(関連科目・他衛星含む)との重なりを解消してから配置
      const satN = resolveOverlaps(rawSat, cur);
      const satE: MapEdge[] = satN.map((s) => ({
        id: generateId('sedge'), source: parent.id, target: s.id,
        label: s.data?.sentence || '', isSatellite: true, isRelation: false,
      }));

      setNodes((p) => { const nn = [...p, ...satN]; nodesRef.current = nn; return nn; });
      setEdges((p) => { const ne = [...p, ...satE]; edgesRef.current = ne; return ne; });
      loggingService.logActivity('surrounding_fetch' as any, { parent: parentLabel, count: satN.length }, memoRef.current?.id);
    } catch (e) {
      console.warn('周辺概念の追加取得失敗:', e);
    }
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.nodeId) handleFetchSurrounding(d.nodeId);
    };
    document.addEventListener('node-fetch-surrounding', handler);
    return () => document.removeEventListener('node-fetch-surrounding', handler);
  }, [handleFetchSurrounding]);

  // =============================================
  // ★★★ v3.2.1 追加: 自動保存(タイトル + 本文 + マップ)★★★
  // =============================================

  /** 即時保存. ノード/エッジ自動保存(KnowledgeMapDisplay 経由) からも呼ばれる. */
  const handleAutoSave = useCallback(async () => {
    if (!memoRef.current) return;
    setSaveStatus('saving');
    try {
      const realN = nodesRef.current.filter((n) => !n.data?.isSatellite && !n.data?.isRelation);
      const realE = edgesRef.current.filter((e) => !e.isSatellite && !e.isRelation);

      const tasks: Promise<unknown>[] = [];

      // ★★★ 重要な修正 ★★★
      // ノードが 0 件のときはマップを保存しない。
      // write フェーズ・空メモ作成直後・本文/タイトル編集時にもデバウンス
      // 自動保存が走るため、従来は生成済みマップを nodes:[] で上書きしてしまい、
      // 「再読込するとマップが消える(getMap が nodes:[] を返す)」事象の原因に
      // なっていた。空のときはマップ保存をスキップし、本文・タイトルのみ保存する。
      if (realN.length > 0) {
        tasks.push(mapService.updateMap(memoRef.current.id, realN, realE));
      }

      // patchMemo は memoService に追加された関数. 失敗してもマップ保存だけは進める
      try {
        tasks.push(
          memoService.patchMemo(memoRef.current.id, {
            title: titleRef.current,
            content: contentRef.current,
          }),
        );
      } catch (e) {
        // patchMemo が無い旧 memoService の場合は無視
      }

      if (tasks.length > 0) await Promise.all(tasks);

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.warn('autosave failed:', e);
      setSaveStatus('idle');
    }
  }, []);

  /** タイトル・本文の変更時のデバウンス自動保存 (1.5 秒) */
  const handleAutoSaveRef = useRef(handleAutoSave);
  useEffect(() => { handleAutoSaveRef.current = handleAutoSave; }, [handleAutoSave]);

  const triggerAutoSaveDebounced = useCallback(() => {
    if (!memoRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      void handleAutoSaveRef.current();
    }, 1500);
  }, []);

  // memoContent 変更で発火 (currentMemo がある時のみ)
  useEffect(() => {
    if (!currentMemo) return;
    triggerAutoSaveDebounced();
  }, [memoContent, currentMemo, triggerAutoSaveDebounced]);

  // memoTitle 変更で発火 (currentMemo がある時のみ)
  useEffect(() => {
    if (!currentMemo) return;
    triggerAutoSaveDebounced();
  }, [memoTitle, currentMemo, triggerAutoSaveDebounced]);

  // =============================================
  // マップ生成
  //   - currentMemo がある(?new=1 のブランクメモ等)場合は、そのメモに対して
  //     生成・上書き保存する → 本文・タイトル・マップが同一メモに揃う
  //   - currentMemo が無い場合は従来どおり createMemoWithMap で新規作成
  // =============================================

  const handleGenerateMap = useCallback(async (content: string) => {
    setLoading(true);
    relationCacheRef.current.clear();
    try {
      // ★ 修正: 既にメモがあるなら新規作成せず、そのメモにマップを生成する
      //   従来は常に createMemoWithMap を呼んでおり、ブランクメモ運用だと
      //   「本文はメモA / マップはメモB」という二重化が発生していた.
      let memo: Memo;
      let map: any;
      if (memoRef.current) {
        const r = await memoService.generateMapForMemo(memoRef.current.id, content, mode);
        memo = r.memo as Memo;
        map = r.map;
      } else {
        const r = await memoService.createMemoWithMap(content, mode);
        memo = r.memo as Memo;
        map = r.map;
      }
      setCurrentMemo(memo);

      // ★ サーバが付けたタイトルがあれば反映するが、ユーザーが既に編集していた
      //   場合は上書きしない(編集中の値を保持).
      const serverTitle = (memo as any).title;
      if (serverTitle && !titleRef.current) {
        setMemoTitle(serverTitle);
      }

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

      // (A) 周辺概念 → satellite
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
            setNodes((p) => [...p, ...satN]);
            setEdges((p) => { const ne = [...p, ...satE]; edgesRef.current = ne; return ne; });
          }
        })
        .catch((e) => console.warn('周辺概念取得失敗:', e));

      // (B) 関連科目候補
      fetchRelationsForMap(layout);
    } catch (e) {
      console.error('マップ生成エラー:', e);
    } finally {
      setLoading(false);
    }
  }, [mode, fetchRelationsForMap]);

  // =============================================
  // ★★★ v3.2.1 追加: 新規空メモ作成(二重実行防止) ★★★
  // =============================================

  const handleCreateBlankMemo = useCallback(async (): Promise<Memo | null> => {
    // React 18 StrictMode で useEffect が 2 回呼ばれてもメモが 2 つ作られないようガード
    if (isCreatingBlankRef.current) return null;
    if (memoRef.current) return memoRef.current;  // 既にメモがある時は新規作成しない

    isCreatingBlankRef.current = true;
    try {
      const memo = await memoService.createBlankMemo(mode, '新しい振り返り');
      setCurrentMemo(memo);
      setMemoTitle((memo as any).title || '新しい振り返り');
      setMemoContent('');
      setNodes([]);
      setEdges([]);
      nodesRef.current = [];
      edgesRef.current = [];
      setNodeStatuses({});
      setDescribedLabels([]);
      setCurrWriting(null);
      setNextSugg([]);
      setPhase('write');
      return memo;
    } catch (e) {
      console.error('空メモ作成失敗:', e);
      return null;
    } finally {
      // フラグは少し遅らせて解放(StrictMode 2回目を確実に弾く)
      setTimeout(() => { isCreatingBlankRef.current = false; }, 1000);
    }
  }, [mode]);

  // =============================================
  // ★★★ v3.2.1 追加: 既存メモを開く ★★★
  // =============================================

  const loadExistingMemo = useCallback(async (memoId: number): Promise<void> => {
    if (memoRef.current?.id === memoId) return;
    setLoading(true);
    relationCacheRef.current.clear();
    try {
      const memo = await memoService.getMemo(memoId);
      setCurrentMemo(memo);
      setMemoTitle((memo as any).title || '');
      setMemoContent(memo.content || '');
      setMode(memo.mode);

      const rawMap = await mapService.getMap(memoId).catch((err) => {
        console.warn('getMap 失敗:', err);
        return null;
      });

      // ★ デバッグ: getMap が実際に返した構造を確認(問題解決後は削除可)
      console.log('🔍 getMap raw response:', rawMap);

      // ★ getMap の戻り構造を正規化(A〜E どのパターンでも nodes/edges を取り出す)
      const { nodes: rawNodes, edges: rawEdgesData } = extractNodesEdges(rawMap);

      console.log('🔍 normalized nodes/edges count:', rawNodes.length, rawEdgesData.length);

      if (rawNodes.length > 0) {
        const raw: MapNode[] = rawNodes.map((n: any) => ({
          id: n.id ?? generateId('n'),
          type: 'custom',
          position: n.position || { x: n.x ?? 0, y: n.y ?? 0 },
          data: {
            label: n.label || n.data?.label || n.id,
            sentence: n.sentence || n.data?.sentence || '',
            extend_query: n.extend_query || n.data?.extend_query || '',
            status: 'default' as NodeStatus,
            isSatellite: false, isRelation: false, satellites: [],
          },
          label: n.label || n.data?.label || n.id,
          sentence: n.sentence || n.data?.sentence || '',
          extend_query: n.extend_query || n.data?.extend_query || '',
        }));
        const rawEdges: MapEdge[] = rawEdgesData.map((e: any) => ({
          id: e.id ?? generateId('e'),
          source: e.source ?? e.from,
          target: e.target ?? e.to,
          label: e.label || '', isSatellite: false, isRelation: false,
        }));

        const hasPos = raw.every((n) => n.position.x !== 0 || n.position.y !== 0);
        const layout = hasPos ? raw : computeRadialLayout(raw, rawEdges);
        setNodes(layout);
        setEdges(rawEdges);
        nodesRef.current = layout;
        edgesRef.current = rawEdges;
        setPhase('revise');

        fetchRelationsForMap(layout);
      } else {
        // マップがまだ無い(空メモ等)
        setNodes([]);
        setEdges([]);
        nodesRef.current = [];
        edgesRef.current = [];
        setPhase('write');
      }
    } catch (e) {
      console.error('既存メモ読み込み失敗:', e);
    } finally {
      setLoading(false);
    }
  }, [fetchRelationsForMap]);

  // =============================================
  // その他ハンドラ(既存のまま)
  // =============================================

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
    handleExpandRelation, handleFetchSurrounding, navigate,

    // ★★★ v3.2.1 追加 ★★★
    memoTitle, setMemoTitle,
    handleCreateBlankMemo,
    loadExistingMemo,
  };
}
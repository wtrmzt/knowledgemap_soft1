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
  memoService, mapService, loggingService, settingsService,
} from '@/services';
import { computeRadialLayout, generateId } from '@/utils';
import { relationMeta } from '@/utils/relationMeta';
import type {
  AppMode, ReflectionPhase, FlowPhase, MapNode, MapEdge, Memo,
  NodeStatus, SurroundingConceptsMap, WritingSuggestion,
  TemporalRelationResponse, RelationMapNode, RelationMapEdge,
  RelationSubGraphCache, PublicSettings, EnabledModes, InterventionLevels,
} from '@/types';
import { FLOW_PHASE_ORDER } from '@/types';

const DEFAULT_SETTINGS: PublicSettings = {
  enabled_modes: { reflection: true, research: true, idea: true },
  intervention: { topic_detection: 3, satellite: 3, relation: 3 },
};

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

  // ★ 項目2: 「根（科目名 = 接続の入口ノード = rawNodes[0]）」からの距離(深さ)を
  //   無向BFSで算出。根に近いほど depth が小さい。
  const depthMap = new Map<string, number>();
  if (rawNodes.length > 0) {
    const adjacency = new Map<string, string[]>();
    rawNodes.forEach((n) => adjacency.set(n.id, []));
    for (const e of rawEdges) {
      if (adjacency.has(e.source)) adjacency.get(e.source)!.push(e.target);
      if (adjacency.has(e.target)) adjacency.get(e.target)!.push(e.source);
    }
    const rootId = rawNodes[0].id;
    depthMap.set(rootId, 0);
    let frontier = [rootId];
    while (frontier.length > 0) {
      const nextF: string[] = [];
      for (const cur of frontier) {
        const d = depthMap.get(cur) ?? 0;
        for (const nb of adjacency.get(cur) || []) {
          if (!depthMap.has(nb)) { depthMap.set(nb, d + 1); nextF.push(nb); }
        }
      }
      frontier = nextF;
    }
    // 未接続ノードは末端扱い
    rawNodes.forEach((n) => { if (!depthMap.has(n.id)) depthMap.set(n.id, rawNodes.length); });
  }

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
      relationDepth: depthMap.get(n.id) ?? 0,
      group: subjectName,
      satellites: [],
      origin: 'relation',  // ★ 収集データ3
    },
    label: n.label || n.id || '(不明)',
    sentence: n.sentence || '',
  }));

  const nodes = resolveOverlaps(rawMapped, existingNodes);

  // ★ FB2: 変換で data.relationDepth が落ちても効くよう、ストアにも深さを保存
  //   ★ 収集データ3: origin もストアに保存
  rawNodes.forEach((rn, i) => {
    if (nodes[i]) {
      relationMeta.setDepth(nodes[i].id, depthMap.get(rn.id) ?? 0);
      relationMeta.setOrigin(nodes[i].id, 'relation');
    }
  });

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
  // ★★★ 項目3: 作業フローのフェーズ ★★★
  const [flowPhase, setFlowPhase] = useState<FlowPhase>('create');
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
  // ★ 収集データ1: 直近で編集イベントを記録した本文（重複記録防止）
  const lastSavedContentRef = useRef<string | null>(null);

  const surroundingConcepts: SurroundingConceptsMap = {};

  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
  const [describedLabels, setDescribedLabels] = useState<string[]>([]);
  const [currentlyWriting, setCurrWriting] = useState<string | null>(null);
  const [nextSuggestions, setNextSugg] = useState<WritingSuggestion[]>([]);
  const [detectingTopics, setDetecting] = useState(false);

  const [selectedNodeLabel, setSelectedNodeLabel] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // ★ A対策: 接続フェーズで候補0件のとき理由を出す通知（無言で終わらせない）
  const [relationNotice, setRelationNotice] = useState<string | null>(null);

  const relationCacheRef = useRef<Map<string, RelationSubGraphCache>>(new Map());
  const topicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ★★★ 項目3: flowPhase の最新値 ref + 関連科目APIレスポンスのキャッシュ ★★★
  const flowPhaseRef = useRef(flowPhase);
  useEffect(() => { flowPhaseRef.current = flowPhase; }, [flowPhase]);
  const relationApiCacheRef = useRef<{ key: string; data: TemporalRelationResponse } | null>(null);

  // ★★★ 管理者機能D: 公開設定（モードON/OFF・介入度）★★★
  const [settings, setSettings] = useState<PublicSettings>(DEFAULT_SETTINGS);
  const interventionRef = useRef<InterventionLevels>(DEFAULT_SETTINGS.intervention);
  useEffect(() => { interventionRef.current = settings.intervention; }, [settings]);
  useEffect(() => {
    settingsService.getPublicSettings().then(setSettings).catch(() => {});
  }, []);

  // 関連科目 Lv1 のときは「科目接続フェーズ」を流れから外す
  const flowPhases: FlowPhase[] =
    settings.intervention.relation <= 1 ? ['create', 'edit'] : FLOW_PHASE_ORDER;
  const effectiveOrderRef = useRef<FlowPhase[]>(FLOW_PHASE_ORDER);
  useEffect(() => {
    effectiveOrderRef.current =
      interventionRef.current.relation <= 1 ? ['create', 'edit'] : FLOW_PHASE_ORDER;
  }, [settings]);

  // 現在のモードが無効化されたら、有効な先頭モードへ自動切替
  useEffect(() => {
    const em = settings.enabled_modes;
    if (!em[mode]) {
      const fallback = (['reflection', 'research', 'idea'] as AppMode[]).find((m) => em[m]);
      if (fallback) setMode(fallback);
    }
  }, [settings, mode]);

  // ★★★ v3.2.1 追加: 自動保存のデバウンスタイマー ★★★
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ★★★ v3.2.1 追加: handleCreateBlankMemo の二重実行ガード ★★★
  const isCreatingBlankRef = useRef<boolean>(false);

  // ★★★ 項目6: どのハンドラからも呼べる安定した保存スケジューラ ★★★
  //   handleAutoSave 本体はこの下で定義されるため、ref 経由で最新版を呼ぶ。
  const autoSaveFnRef = useRef<() => void | Promise<void>>(() => {});
  const scheduleAutoSave = useCallback(() => {
    if (!memoRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { void autoSaveFnRef.current(); }, 1200);
  }, []);

  const getLatestRealLabels = useCallback((): string[] => {
    return nodesRef.current
      .filter((n) => !n.data?.isSatellite && !n.data?.isRelation)
      .map((n) => n.label || n.data?.label || n.id);
  }, []);

  const runTopicDetection = useCallback(async (text: string) => {
    // ★ 管理者機能D: トピック検知の介入度
    const level = interventionRef.current.topic_detection;
    if (level <= 1) {
      // Lv1: 可視化なし。入力と連動しない（状態・提案を出さない）。
      return;
    }
    const labels = getLatestRealLabels();
    if (labels.length === 0 || !text.trim()) return;
    setDetecting(true);
    try {
      const r = await mapService.detectTopics(text, labels);
      const st: Record<string, NodeStatus> = {};
      labels.forEach((l) => (st[l] = 'default'));
      (r.described || []).forEach((l: string) => { if (st[l] !== undefined) st[l] = 'described'; });
      if (r.currently_writing && st[r.currently_writing] !== undefined) st[r.currently_writing] = 'currently_writing';
      // Lv3 のみ「次に書く提案(suggested)」のノード強調を付ける
      if (level >= 3) {
        (r.next_suggestions || []).forEach((s: WritingSuggestion) => { if (st[s.node_label] === 'default') st[s.node_label] = 'suggested'; });
      }
      nodesRef.current.forEach((n) => {
        if (n.data?.isRelation && n.data.status) {
          const lbl = n.label || n.data.label;
          if (lbl) st[lbl] = n.data.status;
        }
      });
      setNodeStatuses(st);
      setDescribedLabels(r.described || []);
      setCurrWriting(r.currently_writing || null);
      // Lv2: 状態の可視化のみ → 提案カードは出さない。Lv3: フル。
      setNextSugg(level >= 3 ? (r.next_suggestions || []) : []);
    } catch (e) { console.error('トピック検知エラー:', e); } finally { setDetecting(false); }
  }, [getLatestRealLabels]);

  const handleTopicDetection = useCallback((text: string) => {
    if (interventionRef.current.topic_detection <= 1) return; // Lv1: 何もしない
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
  // 関連科目: 候補ノードの除去（フェーズ切替時の掃除）
  //   transientCandidate=true のヘッダ/候補ノードのみ除去。
  //   既に「詳細を表示」で展開済みの関連ノードは残す。
  // =============================================

  const removeTransientRelationNodes = useCallback(() => {
    const removeIds = new Set(
      nodesRef.current.filter((n) => (n.data as any)?.transientCandidate).map((n) => n.id),
    );
    if (removeIds.size === 0) return;
    setNodes((prev) => {
      const nn = prev.filter((n) => !removeIds.has(n.id));
      nodesRef.current = nn;
      return nn;
    });
    setEdges((prev) => {
      const ne = prev.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target));
      edgesRef.current = ne;
      return ne;
    });
    // 候補キャッシュも掃除
    removeIds.forEach((id) => relationCacheRef.current.delete(id));
  }, []);

  // =============================================
  // 関連科目: 指定方向(past/future)の候補だけを算出して表示（項目3）
  //   - APIレスポンスは同一マップ内でキャッシュし、過去→未来の往復で再取得しない
  //   - 候補ノードに relationPreview(接続される概念ラベル) を付与（項目1）
  // =============================================

  const fetchRelationCandidates = useCallback(async (
    realNodes: MapNode[],
    direction: 'past' | 'future',
  ) => {
    if (realNodes.length === 0) return;
    // ★ 管理者機能D: 関連科目の介入度
    const relLevel = interventionRef.current.relation;
    if (relLevel <= 1) return; // Lv1: 非表示
    const year = yearRef.current;

    const dirLabel = direction === 'past' ? '過去（基礎）' : '未来（発展）';

    try {
      const combinedLabel = realNodes
        .map((n) => n.label || n.data?.label || '')
        .filter(Boolean)
        .join('、');
      const combinedSentence = realNodes
        .map((n) => n.sentence || n.data?.sentence || '')
        .filter(Boolean)
        .join(' ');

      const cacheKey = `${year}::${combinedLabel}`;
      let r: TemporalRelationResponse | null = null;
      if (relationApiCacheRef.current?.key === cacheKey) {
        r = relationApiCacheRef.current.data;
      } else {
        r = await mapService
          .getTemporalRelations({ label: combinedLabel, sentence: combinedSentence, year })
          .catch(() => null);
        if (r && !r.error) relationApiCacheRef.current = { key: cacheKey, data: r };
      }

      if (!r || r.error) {
        console.warn('関連科目取得エラー:', r?.error);
        setRelationNotice(`関連科目の取得に失敗しました（${r?.error || '通信エラー'}）。`);
        return;
      }

      const xs = realNodes.map((n) => n.position.x);
      const ys = realNodes.map((n) => n.position.y);
      const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
      const mapWidth = Math.max(...xs) - Math.min(...xs);
      const offsetX = Math.max(mapWidth / 2, 300) + 450;

      const isPast = direction === 'past';
      const srcNodes = isPast ? r.past_map?.nodes : r.future_map?.nodes;
      const srcEdges = (isPast ? r.past_map?.edges : r.future_map?.edges) || [];
      if (!Array.isArray(srcNodes) || srcNodes.length === 0) {
        setRelationNotice(
          `${dirLabel}の関連科目は見つかりませんでした。`
          + `（現在の学年の${isPast ? '1つ下' : '1つ上'}に該当する科目データが無い可能性があります）`
        );
        return;
      }

      const groups = groupBySubject(srcNodes, srcEdges);
      const total = Math.min(groups.size, 3);
      if (total === 0) {
        setRelationNotice(`${dirLabel}の関連科目は見つかりませんでした。`);
        return;
      }

      const sideX = isPast ? centerX - offsetX : centerX + offsetX;
      const candidateStatus: NodeStatus = isPast
        ? 'relation_past_candidate' : 'relation_future_candidate';
      const candidateNodes: MapNode[] = [];
      const candidateEdges: MapEdge[] = [];

      const headerId = generateId(isPast ? 'rph' : 'rfh');
      candidateNodes.push({
        id: headerId, type: 'custom',
        position: { x: sideX, y: centerY - (total * 60) - 30 },
        data: {
          label: isPast ? '📘 過去の関連科目' : '📗 未来の関連科目',
          sentence: '', extend_query: '',
          status: (isPast ? 'relation_past' : 'relation_future') as NodeStatus,
          isSatellite: false, isRelation: true,
          relationDirection: direction, group: '', satellites: [],
          transientCandidate: true,
        },
        label: isPast ? '📘 過去の関連科目' : '📗 未来の関連科目',
      });

      let idx = 0;
      for (const [subjectName, sg] of groups) {
        if (idx >= 3) break;
        const cid = generateId(isPast ? 'rpc' : 'rfc');
        const closestNode = findClosestNode(realNodes, sideX, centerY);
        relationCacheRef.current.set(cid, {
          subjectName, direction,
          originNodeId: closestNode.id,
          nodes: sg.nodes, edges: sg.edges,
        });
        const preview = sg.nodes
          .map((n) => n.label || n.id)
          .filter(Boolean)
          .slice(0, 10);
        relationMeta.setPreview(cid, preview); // ★ FB1: 変換非依存で確実に渡す
        const yOffset = (idx - (total - 1) / 2) * 120;
        candidateNodes.push({
          id: cid, type: 'custom',
          position: { x: sideX, y: centerY + yOffset },
          data: {
            label: subjectName,
            sentence: relLevel >= 3
              ? `${isPast ? '基礎' : '発展'}科目 — ${sg.nodes.length} 概念`
              : `${isPast ? '基礎' : '発展'}科目`,
            extend_query: '', status: candidateStatus,
            isSatellite: false, isRelation: true,
            relationDirection: direction, relationOriginId: closestNode.id,
            relationSubjectName: subjectName, group: subjectName,
            relationPreview: relLevel >= 3 ? preview : [],
            relationLevel: relLevel,  // ★ Lv2: 科目名のみ（展開不可）
            transientCandidate: true,
            satellites: [],
          },
          label: subjectName,
        });
        candidateEdges.push({
          id: generateId(isPast ? 'rphe' : 'rfhe'), source: headerId, target: cid,
          label: '', isSatellite: false, isRelation: true,
        });
        idx++;
      }

      if (candidateNodes.length > 0) {
        const resolved = resolveOverlaps(candidateNodes, nodesRef.current);
        setNodes((prev) => { const nn = [...prev, ...resolved]; nodesRef.current = nn; return nn; });
        setEdges((prev) => { const ne = [...prev, ...candidateEdges]; edgesRef.current = ne; return ne; });
        // 候補が出た場合は (idx>0) のときだけ通知クリア。ヘッダのみ(idx===0)なら空扱い。
        if (idx > 0) setRelationNotice(null);
        else setRelationNotice(`${dirLabel}の関連科目は見つかりませんでした。`);
      }
    } catch (e) {
      console.warn('関連科目候補取得失敗:', e);
      setRelationNotice('関連科目の取得中にエラーが発生しました。');
    }
  }, []);

  // =============================================
  // ★★★ 項目3: フェーズ遷移 ★★★
  //   create → edit → connect_past → connect_future
  //   連続表示で混乱しないよう、フェーズに応じて候補を出し分ける。
  // =============================================

  const goToPhase = useCallback((target: FlowPhase) => {
    setRelationNotice(null); // フェーズ移動時は通知をリセット
    // まず現在の候補(transient)を掃除
    const real = nodesRef.current.filter(
      (n) => !n.data?.isSatellite && !n.data?.isRelation,
    );
    removeTransientRelationNodes();

    setFlowPhase(target);
    // ReflectionSheet 用の write/revise を同期
    setPhase(target === 'create' ? 'write' : 'revise');

    if ((target === 'connect_past' || target === 'connect_future') && real.length > 0) {
      void fetchRelationCandidates(real, target === 'connect_past' ? 'past' : 'future');
    }
  }, [removeTransientRelationNodes, fetchRelationCandidates]);

  const handleNextPhase = useCallback(() => {
    const order = effectiveOrderRef.current;
    const i = order.indexOf(flowPhaseRef.current);
    if (i < 0 || i >= order.length - 1) return;
    // create フェーズはマップ生成で edit に進む(直接スキップさせない)
    if (flowPhaseRef.current === 'create' && nodesRef.current.length === 0) return;
    goToPhase(order[i + 1]);
  }, [goToPhase]);

  const handlePrevPhase = useCallback(() => {
    const order = effectiveOrderRef.current;
    const i = order.indexOf(flowPhaseRef.current);
    if (i <= 0) return;
    goToPhase(order[i - 1]);
  }, [goToPhase]);

  const handleExpandRelation = useCallback((candidateNodeId: string) => {
    // ★ 管理者機能D: 部分木のドッキングは Lv3 のみ
    if (interventionRef.current.relation < 3) return;
    const cache = relationCacheRef.current.get(candidateNodeId);
    if (!cache) return;
    const candidateNode = nodesRef.current.find((n) => n.id === candidateNodeId);
    const candidatePos = candidateNode?.position || { x: 0, y: 0 };
    const existing = nodesRef.current.filter((n) => n.id !== candidateNodeId);
    const { nodes: expNodes, edges: expEdges } = expandSubGraph(cache, candidatePos, existing);
    setNodes((prev) => {
      const nn = [...prev.filter((n) => n.id !== candidateNodeId), ...expNodes];
      nodesRef.current = nn; return nn;
    });
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
    scheduleAutoSave(); // ★ 項目6
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
    // ★ 管理者機能D: 周辺概念の介入度
    const satLevel = interventionRef.current.satellite;
    if (satLevel <= 1) return; // Lv1: 取得しない
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
        // Lv2 はラベルのみ（関係性を隠す）
        const rel = satLevel >= 3 ? c.relation : '';
        return {
          id: sid, type: 'custom',
          position: placeSatellitePos(parent.position, fresh.length, ci),
          data: {
            label: c.label, sentence: rel, extend_query: '',
            status: 'satellite' as NodeStatus, isSatellite: true,
            parentNodeId: parent.id, isRelation: false, satellites: [],
            origin: 'satellite',  // ★ 収集データ3
          },
          label: c.label, sentence: rel,
        };
      });
      rawSat.forEach((s) => relationMeta.setOrigin(s.id, 'satellite')); // ★ 収集データ3
      // 既存ノード(関連科目・他衛星含む)との重なりを解消してから配置
      const satN = resolveOverlaps(rawSat, cur);
      const satE: MapEdge[] = satN.map((s) => ({
        id: generateId('sedge'), source: parent.id, target: s.id,
        label: s.data?.sentence || '', isSatellite: true, isRelation: false,
      }));

      setNodes((p) => { const nn = [...p, ...satN]; nodesRef.current = nn; return nn; });
      setEdges((p) => { const ne = [...p, ...satE]; edgesRef.current = ne; return ne; });
      // ★ 収集データ2: 提示した周辺概念（採用の母集団）を記録
      loggingService.logActivity('satellite_suggested' as any, {
        parent: parentLabel,
        labels: satN.map((s) => s.label).filter(Boolean),
        count: satN.length,
        source: 'manual_fetch',
      }, memoRef.current?.id);
      scheduleAutoSave(); // ★ 項目6
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
      // ★ FB4: 保存対象を拡張。
      //   通常ノードに加え、サジェスト（周辺概念=衛星）・科目間関連ノード（展開済み）も保存する。
      //   ただしフェーズ用の一時候補（transientCandidate: 科目選択ボタン/ヘッダ）は
      //   APIから都度再生成するため保存しない。
      const isTransient = (n: MapNode) => !!(n.data as any)?.transientCandidate;
      const savableNodes = nodesRef.current
        .filter((n) => !isTransient(n))
        .map((n) => {
          const extra: Record<string, unknown> = {};
          // ★ 関連ノードは変換で落ちた relationDepth をストアから補完して保存
          if (n.data?.isRelation) {
            const depth = relationMeta.getDepth(n.id);
            if (typeof depth === 'number') extra.relationDepth = depth;
          }
          // ★ 収集データ3: ノードの由来フラグ origin を保存マップに永続化
          //   昇格済み周辺概念も origin='satellite' を保持 → 採用/非採用の判別に使える
          const origin = relationMeta.getOrigin(n.id)
            || (n.data as any)?.origin
            || (n.data?.isSatellite ? 'satellite'
              : n.data?.isRelation ? 'relation'
              : undefined);
          if (origin) extra.origin = origin;
          return Object.keys(extra).length ? { ...n, data: { ...n.data, ...extra } } : n;
        });
      const savableIds = new Set(savableNodes.map((n) => n.id));
      const savableEdges = edgesRef.current.filter(
        (e) => savableIds.has(e.source) && savableIds.has(e.target),
      );

      // ★ 収集データ1: メモ本文が前回保存から変わっていれば編集イベントを記録
      //   （件数=編集回数 / created_at の時系列=文字数推移）
      const content = contentRef.current || '';
      if (content !== lastSavedContentRef.current) {
        lastSavedContentRef.current = content;
        const realCount = nodesRef.current.filter(
          (n) => !n.data?.isSatellite && !n.data?.isRelation && !isTransient(n),
        ).length;
        loggingService.logActivity('memo_edit' as any, {
          char_count: content.length,
          node_count: savableNodes.length,
          real_node_count: realCount,
          edge_count: savableEdges.length,
        }, memoRef.current.id);
      }

      const tasks: Promise<unknown>[] = [];

      // ノードが 0 件のときはマップを保存しない（生成前/空メモの誤上書き防止）。
      if (savableNodes.length > 0) {
        // Ensure nodes conform to MapNode typings (e.g. data.label must be string)
        const nodesForSave = savableNodes.map((n) => ({
          ...n,
          data: {
            ...(n.data || {}),
            label: (n.data && n.data.label) ? n.data.label : '',
          },
        })) as any; // cast to satisfy MapNode[] expected by updateMap

        tasks.push(mapService.updateMap(memoRef.current.id, nodesForSave, savableEdges));
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
  useEffect(() => {
    handleAutoSaveRef.current = handleAutoSave;
    autoSaveFnRef.current = handleAutoSave; // ★ 項目6: スケジューラ用にも反映
  }, [handleAutoSave]);

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
          origin: 'ai',  // ★ 収集データ3: AI生成ノード
        },
        label: n.label || n.data?.label, sentence: n.sentence || n.data?.sentence,
        extend_query: n.extend_query || n.data?.extend_query,
      }));
      // ★ 収集データ3: 変換非依存ストアにも由来を記録
      raw.forEach((n) => relationMeta.setOrigin(n.id, 'ai'));
      const rawEdges: MapEdge[] = (map.edges || []).map((e: any) => ({
        id: e.id, source: e.source, target: e.target,
        label: e.label || '', isSatellite: false, isRelation: false,
      }));

      const layout = computeRadialLayout(raw, rawEdges);
      setNodes(layout); setEdges(rawEdges);
      edgesRef.current = rawEdges; nodesRef.current = layout;
      setPhase('revise');
      setFlowPhase('edit'); // ★ 項目3: 初期マップ作成 → マップ編集へ
      lastSavedContentRef.current = content; // 生成直後の本文を基準に
      loggingService.logActivity('map_generate', {
        node_count: layout.length,
        edge_count: rawEdges.length,
        char_count: (content || '').length,
        ai_labels: raw.map((n) => n.label).filter(Boolean),
      }, memo.id);

      // (A) 周辺概念 → satellite
      // ★ 管理者機能D: 周辺概念の介入度（Lv1: 取得しない / Lv2: ラベルのみ / Lv3: フル）
      const satLevel = interventionRef.current.satellite;
      if (satLevel >= 2) {
      mapService.getSurroundingConcepts(layout)
        .then((surrounding) => {
          const satN: MapNode[] = []; const satE: MapEdge[] = [];
          const cur = nodesRef.current;
          // ★ 項目5: 既にマップ上にあるラベル + この一括追加内で既出のラベルを除外
          const usedLabels = new Set(
            cur.map((n) => (n.label || n.data?.label || '')).filter(Boolean),
          );
          for (const [parentLabel, concepts] of Object.entries(surrounding)) {
            const parent = cur.find((n) => (n.label || n.data?.label) === parentLabel);
            if (!parent) continue;
            const fresh = concepts.filter((c) => c.label && !usedLabels.has(c.label));
            fresh.forEach((c, ci) => {
              usedLabels.add(c.label); // 兄弟・他親との重複も防ぐ
              const sid = generateId('sat');
              // Lv2 はラベルのみ（関係性 relation は隠す）
              const rel = satLevel >= 3 ? c.relation : '';
              satN.push({ id: sid, type: 'custom',
                position: placeSatellitePos(parent.position, fresh.length, ci),
                data: { label: c.label, sentence: rel, extend_query: '',
                  status: 'satellite' as NodeStatus, isSatellite: true, parentNodeId: parent.id,
                  isRelation: false, satellites: [], origin: 'satellite' },
                label: c.label, sentence: rel,
              });
              relationMeta.setOrigin(sid, 'satellite'); // ★ 収集データ3
              satE.push({ id: generateId('sedge'), source: parent.id, target: sid,
                label: rel, isSatellite: true, isRelation: false });
            });
          }
          if (satN.length > 0) {
            setNodes((p) => { const nn = [...p, ...satN]; nodesRef.current = nn; return nn; });
            setEdges((p) => { const ne = [...p, ...satE]; edgesRef.current = ne; return ne; });
            // ★ 収集データ2: 提示した周辺概念（採用の母集団）を記録
            loggingService.logActivity('satellite_suggested' as any, {
              labels: satN.map((s) => s.label).filter(Boolean),
              count: satN.length,
              source: 'bulk',
            }, memoRef.current?.id);
          }
        })
        .catch((e) => console.warn('周辺概念取得失敗:', e));
      } // end if satLevel >= 2

      // (B) 関連科目候補は「過去/未来の科目接続」フェーズで取得する（項目3）
      //     ここでは自動取得しない。
    } catch (e) {
      console.error('マップ生成エラー:', e);
    } finally {
      setLoading(false);
    }
  }, [mode]);

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
      setFlowPhase('create'); // ★ 項目3
      relationApiCacheRef.current = null;
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
        const raw: MapNode[] = rawNodes.map((n: any) => {
          const dIn = n.data || {};
          const nodeId = n.id ?? generateId('n');
          const label = dIn.label || n.label || n.id;
          const sentence = dIn.sentence || n.sentence || '';
          const extendQuery = dIn.extend_query || n.extend_query || '';
          // ★ FB4: 保存済みの状態（周辺概念=衛星 / 科目間関連 / 深さ 等）を復元
          const isSatellite = dIn.isSatellite ?? false;
          const isRelation = dIn.isRelation ?? false;
          const relationDepth = dIn.relationDepth;
          if (isRelation && typeof relationDepth === 'number') {
            relationMeta.setDepth(nodeId, relationDepth);
          }
          // ★ 収集データ3: 保存済み origin を復元（無ければ種別から推定）
          const origin = dIn.origin
            || (isSatellite ? 'satellite' : isRelation ? 'relation' : 'ai');
          relationMeta.setOrigin(nodeId, origin);
          return {
            id: nodeId,
            type: 'custom',
            position: n.position || { x: n.x ?? 0, y: n.y ?? 0 },
            data: {
              label, sentence, extend_query: extendQuery,
              status: (dIn.status as NodeStatus) || 'default',
              isSatellite,
              parentNodeId: dIn.parentNodeId,
              isRelation,
              relationDirection: dIn.relationDirection,
              relationOriginId: dIn.relationOriginId,
              relationDepth,
              group: dIn.group,
              origin,
              satellites: dIn.satellites || [],
            },
            label, sentence, extend_query: extendQuery,
          };
        });
        const rawEdges: MapEdge[] = rawEdgesData.map((e: any) => ({
          id: e.id ?? generateId('e'),
          source: e.source ?? e.from,
          target: e.target ?? e.to,
          label: e.label || '',
          // ★ FB4: 衛星/関連エッジの種別も復元
          isSatellite: e.isSatellite ?? false,
          isRelation: e.isRelation ?? false,
        }));

        const hasPos = raw.every((n) => n.position.x !== 0 || n.position.y !== 0);
        const layout = hasPos ? raw : computeRadialLayout(raw, rawEdges);
        setNodes(layout);
        setEdges(rawEdges);
        nodesRef.current = layout;
        edgesRef.current = rawEdges;
        setPhase('revise');
        setFlowPhase('edit'); // ★ 項目3: 既存マップは編集フェーズで開く
        relationApiCacheRef.current = null; // 別マップなので関連科目キャッシュを破棄
      } else {
        // マップがまだ無い(空メモ等)
        setNodes([]);
        setEdges([]);
        nodesRef.current = [];
        edgesRef.current = [];
        setPhase('write');
        setFlowPhase('create');
      }
    } catch (e) {
      console.error('既存メモ読み込み失敗:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // =============================================
  // その他ハンドラ(既存のまま)
  // =============================================

  const handleAddNode = useCallback(async (keyword: string) => {
    try {
      const r = await mapService.createManualNode(keyword);
      // ★ FB-E: バックエンド/LLM が返す id（例 "node_1"）が重複すると
      //   React Flow が「ノードIDが一意でない」で落ちるため、常にフロントで一意IDを採番する。
      const uniqueId = generateId('manual');
      const nn: MapNode = {
        id: uniqueId, type: 'custom', position: { x: 0, y: 0 },
        data: { label: r.label || keyword, sentence: r.sentence || '',
          extend_query: r.extend_query || '', status: 'default' as NodeStatus,
          isSatellite: false, isRelation: false, satellites: [],
          origin: 'manual' },  // ★ 収集データ3: 手動追加ノード
        label: r.label || keyword, sentence: r.sentence || '', extend_query: r.extend_query || '',
      };
      relationMeta.setOrigin(uniqueId, 'manual'); // ★ 収集データ3
      setNodes((prev) => {
        // 念のため既存IDと衝突しないことを保証
        if (prev.some((p) => p.id === nn.id)) { nn.id = generateId('manual2'); relationMeta.setOrigin(nn.id, 'manual'); }
        const real = prev.filter((n) => !n.data?.isSatellite && !n.data?.isRelation);
        const others = prev.filter((n) => n.data?.isSatellite || n.data?.isRelation);
        const nn2 = [...computeRadialLayout([...real, nn], edgesRef.current), ...others];
        nodesRef.current = nn2;
        return nn2;
      });
      loggingService.logActivity('node_add_manual' as any, {
        node_id: nn.id, label: nn.data!.label, keyword,
      }, memoRef.current?.id);
      scheduleAutoSave(); // ★ 項目6
    } catch (e) { console.error('ノード追加エラー:', e); }
  }, [scheduleAutoSave]);

  const handleSatelliteAdd = useCallback((satNodeId: string) => {
    let adoptedLabel = '';
    setNodes((prev) => {
      const nn = prev.map((n) => {
        if (n.id === satNodeId) {
          adoptedLabel = n.label || n.data?.label || '';
          // 採用後も origin='satellite' を保持（採用/非採用の区別のため）
          return { ...n, data: { ...n.data!, isSatellite: false, status: 'default' as NodeStatus, origin: 'satellite' } };
        }
        return n;
      });
      nodesRef.current = nn; return nn;
    });
    setEdges((prev) => {
      const ne = prev.map((e) => (e.target === satNodeId && e.isSatellite) ? { ...e, isSatellite: false } : e);
      edgesRef.current = ne; return ne;
    });
    relationMeta.setOrigin(satNodeId, 'satellite');
    // ★ 収集データ2: 周辺概念の「採用」を記録（非採用 = 提示 − 採用 で算出）
    loggingService.logActivity('satellite_adopted' as any, {
      node_id: satNodeId, label: adoptedLabel,
    }, memoRef.current?.id);
    scheduleAutoSave(); // ★ 項目6: 衛星をマップに昇格 → 保存
  }, [scheduleAutoSave]);

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

    // ★★★ 項目3: フェーズ制 ★★★
    flowPhase, goToPhase, handleNextPhase, handlePrevPhase,

    // ★ A対策: 関連科目の通知（候補0件など）
    relationNotice, clearRelationNotice: () => setRelationNotice(null),

    // ★★★ 管理者機能D: 設定（モードON/OFF・介入度） ★★★
    settings,
    enabledModes: settings.enabled_modes,
    intervention: settings.intervention,
    flowPhases,
  };
}
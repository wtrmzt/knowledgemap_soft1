/**
 * レイアウトエンジン
 *
 * 1. BFS放射状レイアウトで初期配置
 * 2. 力学シミュレーション（force-directed）で調整:
 *    - 接続ノード間のバネ引力（近づける）
 *    - 全ノード間の斥力（重なり防止）
 */
import type { MapNode, MapEdge } from '@/types';

const CENTER_X = 450;
const CENTER_Y = 320;
const BASE_RADIUS = 180;
const MIN_ARC_PX = 160;

// 力学パラメータ
const SPRING_LENGTH = 180;    // バネの自然長（接続ノード間の理想距離）
const SPRING_K = 0.05;        // バネ定数
const REPULSION_K = 8000;     // 斥力定数
const MIN_DIST = 120;         // ノード間の最小距離（重なり防止）
const ITERATIONS = 60;        // シミュレーション反復回数
const DAMPING = 0.85;         // 速度減衰

export function computeRadialLayout(
  nodes: MapNode[],
  edges: MapEdge[],
): MapNode[] {
  if (nodes.length === 0) return nodes;
  if (nodes.length === 1) {
    return [{ ...nodes[0], position: { x: CENTER_X, y: CENTER_Y } }];
  }

  // ===== Phase 1: BFS 放射状初期配置 =====
  const degree: Record<string, number> = {};
  nodes.forEach((n) => (degree[n.id] = 0));
  edges.forEach((e) => {
    if (degree[e.source] !== undefined) degree[e.source]++;
    if (degree[e.target] !== undefined) degree[e.target]++;
  });
  const sorted = [...nodes].sort((a, b) => (degree[b.id] || 0) - (degree[a.id] || 0));
  const rootId = sorted[0].id;

  const adj: Record<string, string[]> = {};
  nodes.forEach((n) => (adj[n.id] = []));
  edges.forEach((e) => {
    if (adj[e.source]) adj[e.source].push(e.target);
    if (adj[e.target]) adj[e.target].push(e.source);
  });

  const pos: Record<string, { x: number; y: number }> = {};
  pos[rootId] = { x: CENTER_X, y: CENTER_Y };

  const visited = new Set<string>([rootId]);
  const parentOf: Record<string, string> = {};
  const layers: string[][] = [];
  let queue = [rootId];

  while (queue.length > 0) {
    const next: string[] = [];
    const layer: string[] = [];
    for (const nid of queue) {
      for (const nb of adj[nid] || []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          parentOf[nb] = nid;
          layer.push(nb);
          next.push(nb);
        }
      }
    }
    if (layer.length > 0) layers.push(layer);
    queue = next;
  }

  const orphans: string[] = [];
  sorted.forEach((n) => { if (!visited.has(n.id)) orphans.push(n.id); });
  if (orphans.length > 0) layers.push(orphans);

  const angleOf: Record<string, number> = {};
  angleOf[rootId] = 0;

  layers.forEach((layer, li) => {
    const minR = BASE_RADIUS * (li + 1);
    const circumNeeded = layer.length * MIN_ARC_PX;
    const radius = Math.max(minR, circumNeeded / (2 * Math.PI));

    const groups: Record<string, string[]> = {};
    layer.forEach((nid) => {
      const pid = parentOf[nid] || '__orphan__';
      if (!groups[pid]) groups[pid] = [];
      groups[pid].push(nid);
    });

    const groupKeys = Object.keys(groups).sort((a, b) => (angleOf[a] ?? 0) - (angleOf[b] ?? 0));
    const step = (2 * Math.PI) / Math.max(layer.length, 1);
    const layerOffset = li % 2 === 0 ? 0 : step / 2;
    let idx = 0;

    for (const pid of groupKeys) {
      const children = groups[pid];
      const startAngle = -Math.PI / 2 + layerOffset + idx * step;
      const childStep = (step * children.length) / children.length;
      children.forEach((nid, ci) => {
        const angle = startAngle + ci * childStep;
        pos[nid] = {
          x: CENTER_X + Math.cos(angle) * radius,
          y: CENTER_Y + Math.sin(angle) * radius,
        };
        angleOf[nid] = angle;
      });
      idx += children.length;
    }
  });

  // ===== Phase 2: 力学シミュレーション =====
  const ids = nodes.map((n) => n.id);
  const vel: Record<string, { vx: number; vy: number }> = {};
  ids.forEach((id) => { vel[id] = { vx: 0, vy: 0 }; });

  // 接続セットを事前構築
  const connected = new Set<string>();
  edges.forEach((e) => {
    connected.add(`${e.source}|${e.target}`);
    connected.add(`${e.target}|${e.source}`);
  });

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const force: Record<string, { fx: number; fy: number }> = {};
    ids.forEach((id) => { force[id] = { fx: 0, fy: 0 }; });

    // --- 斥力（全ペア） ---
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j];
        const pa = pos[a], pb = pos[b];
        let dx = pb.x - pa.x;
        let dy = pb.y - pa.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) { dx = 1; dy = 0; dist = 1; }

        // 斥力: 近いほど強い
        const repF = REPULSION_K / (dist * dist);
        const fx = (dx / dist) * repF;
        const fy = (dy / dist) * repF;
        force[a].fx -= fx;
        force[a].fy -= fy;
        force[b].fx += fx;
        force[b].fy += fy;

        // 重なり防止: 最小距離以下なら強い反発
        if (dist < MIN_DIST) {
          const overlap = (MIN_DIST - dist) * 0.5;
          const ox = (dx / dist) * overlap;
          const oy = (dy / dist) * overlap;
          force[a].fx -= ox;
          force[a].fy -= oy;
          force[b].fx += ox;
          force[b].fy += oy;
        }
      }
    }

    // --- バネ引力（接続ペア） ---
    edges.forEach((e) => {
      const pa = pos[e.source], pb = pos[e.target];
      if (!pa || !pb) return;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;

      // フックの法則: F = k * (dist - naturalLength)
      const displacement = dist - SPRING_LENGTH;
      const springF = SPRING_K * displacement;
      const fx = (dx / dist) * springF;
      const fy = (dy / dist) * springF;
      force[e.source].fx += fx;
      force[e.source].fy += fy;
      force[e.target].fx -= fx;
      force[e.target].fy -= fy;
    });

    // --- 位置更新 ---
    ids.forEach((id) => {
      vel[id].vx = (vel[id].vx + force[id].fx) * DAMPING;
      vel[id].vy = (vel[id].vy + force[id].fy) * DAMPING;
      pos[id].x += vel[id].vx;
      pos[id].y += vel[id].vy;
    });
  }

  return nodes.map((n) => ({
    ...n,
    position: pos[n.id] || n.position || { x: CENTER_X, y: CENTER_Y },
  }));
}
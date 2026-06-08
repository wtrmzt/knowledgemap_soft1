/**
 * 関連科目ノードのメタ情報ストア（FB1, FB2）
 *
 * React Flow への変換（toFlowNodes）で data の独自フィールドが
 * 欠落しても、ノードID基準で「接続プレビュー」「根からの深さ」を
 * 取り出せるようにするための、変換非依存の軽量ストア。
 *
 * - setPreview/getPreview: 候補ノードが展開時に接続する概念ラベル一覧
 * - setDepth/getDepth    : 展開済み関連ノードの根（科目名）からの距離
 */

const previewStore = new Map<string, string[]>();
const depthStore = new Map<string, number>();
const originStore = new Map<string, string>(); // ノード由来: 'ai' | 'manual' | 'satellite' | 'relation'

export const relationMeta = {
  setPreview(nodeId: string, labels: string[]): void {
    previewStore.set(nodeId, labels);
  },
  getPreview(nodeId: string): string[] | undefined {
    return previewStore.get(nodeId);
  },
  setDepth(nodeId: string, depth: number): void {
    depthStore.set(nodeId, depth);
  },
  getDepth(nodeId: string): number | undefined {
    return depthStore.get(nodeId);
  },
  // ★ 収集データ3: ノードの由来（手動/AI/周辺概念/関連科目）を変換非依存で保持
  setOrigin(nodeId: string, origin: string): void {
    originStore.set(nodeId, origin);
  },
  getOrigin(nodeId: string): string | undefined {
    return originStore.get(nodeId);
  },
  clear(): void {
    previewStore.clear();
    depthStore.clear();
    originStore.clear();
  },
};
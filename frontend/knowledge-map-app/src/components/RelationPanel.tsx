/**
 * 関連科目パネル（Phase 3）
 *
 * Phase 2 バックエンドの新レスポンス形式に対応:
 *   { future_map: { nodes, edges }, past_map: { nodes, edges }, method, response_time_ms }
 *
 * 変更点:
 *   - ノードを科目（group）ごとにグルーピングして表示
 *   - 各ノードの説明文（sentence）を表示
 *   - Google 検索リンク
 *   - セッション内キャッシュ（同じノードの再問い合わせ防止）
 *   - ローディングスケルトン
 *   - method / 応答時間の表示
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, X, Search,
  Loader2, ExternalLink, Zap, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { mapService } from '@/services';
import type {
  TemporalRelationResponse,
  TemporalRelationRequest,
  RelationMapNode,
} from '../types';

// =============================================
// Props
// =============================================

interface RelationPanelProps {
  selectedNodeLabel: string | null;
  /** 選択中ノードの完全データを取得する関数 */
  getNodeRequestData: () => TemporalRelationRequest | null;
  onClose: () => void;
}

// =============================================
// セッションキャッシュ（コンポーネント外に置くことで再マウントでも保持）
// =============================================

const responseCache = new Map<string, TemporalRelationResponse>();

// =============================================
// サブコンポーネント
// =============================================

/** ノードを group（科目名）でグルーピング */
function groupNodesBySubject(nodes: RelationMapNode[]): Map<string, RelationMapNode[]> {
  const groups = new Map<string, RelationMapNode[]>();
  for (const node of nodes) {
    // "Input" グループはスキップ（入力ノード自身）
    if (node.group === 'Input') continue;
    const key = node.group || '（未分類）';
    const list = groups.get(key) || [];
    list.push(node);
    groups.set(key, list);
  }
  return groups;
}

/** ローディングスケルトン */
const LoadingSkeleton: React.FC = () => (
  <div className="space-y-3 animate-pulse">
    {[1, 2].map((section) => (
      <div key={section} className="space-y-2">
        <div className="h-3 w-20 bg-surface-200 rounded" />
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-2.5 bg-white rounded-lg border border-surface-100">
              <div className="h-3 w-3/4 bg-surface-200 rounded mb-1.5" />
              <div className="h-2.5 w-full bg-surface-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

/** 1つの関連ノードカード */
const NodeCard: React.FC<{
  node: RelationMapNode;
  direction: 'past' | 'future';
}> = ({ node, direction }) => {
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(node.label)}`;
  const dotColor = direction === 'past' ? 'bg-blue-400' : 'bg-emerald-400';

  return (
    <div className="p-2.5 bg-white rounded-lg border border-surface-200 hover:border-surface-300 transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />
          <div className="min-w-0">
            <p className="text-xs font-medium text-surface-700 leading-snug">
              {node.label}
            </p>
            {node.sentence && (
              <p className="text-[10px] text-surface-400 leading-relaxed mt-0.5 line-clamp-2">
                {node.sentence}
              </p>
            )}
          </div>
        </div>
        <a
          href={searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
          title="Google で検索"
        >
          <ExternalLink size={11} className="text-surface-300 hover:text-primary-600" />
        </a>
      </div>
    </div>
  );
};

/** 科目グループ（発展/基礎の中の1科目分） */
const SubjectGroup: React.FC<{
  subjectName: string;
  nodes: RelationMapNode[];
  direction: 'past' | 'future';
}> = ({ subjectName, nodes, direction }) => {
  const borderColor = direction === 'past'
    ? 'border-l-blue-300'
    : 'border-l-emerald-300';

  return (
    <div className={`pl-3 border-l-2 ${borderColor} space-y-1.5`}>
      <p className="text-[10px] font-semibold text-surface-500 tracking-wide uppercase">
        {subjectName}
      </p>
      {nodes.map((node, i) => (
        <NodeCard key={node.id || i} node={node} direction={direction} />
      ))}
    </div>
  );
};

/** セクション（基礎 or 発展） */
const RelationSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  nodes: RelationMapNode[];
  direction: 'past' | 'future';
  colorClass: string;
}> = ({ title, icon, nodes, direction, colorClass }) => {
  const groups = groupNodesBySubject(nodes);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <p className={`text-[11px] font-semibold ${colorClass}`}>
          {title}
        </p>
        {nodes.length > 0 && (
          <span className="text-[9px] text-surface-400 ml-auto">
            {groups.size} 科目 · {nodes.filter(n => n.group !== 'Input').length} 概念
          </span>
        )}
      </div>
      {groups.size === 0 ? (
        <p className="text-[11px] text-surface-400 pl-3">該当する科目が見つかりませんでした</p>
      ) : (
        <div className="space-y-3">
          {Array.from(groups.entries()).map(([subject, groupNodes]) => (
            <SubjectGroup
              key={subject}
              subjectName={subject}
              nodes={groupNodes}
              direction={direction}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================
// メインコンポーネント
// =============================================

export const RelationPanel: React.FC<RelationPanelProps> = ({
  selectedNodeLabel,
  getNodeRequestData,
  onClose,
}) => {
  const [result, setResult] = useState<TemporalRelationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastFetchedLabel = useRef<string | null>(null);

  const fetchRelation = useCallback(async () => {
    if (!selectedNodeLabel) return;

    // セッションキャッシュの確認
    const cached = responseCache.get(selectedNodeLabel);
    if (cached) {
      setResult(cached);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const requestData = getNodeRequestData();
      if (!requestData) {
        setError('ノードデータを取得できません');
        return;
      }

      const data = await mapService.getTemporalRelations(requestData);

      // エラーチェック
      if (data.error) {
        setError(data.error);
        return;
      }

      setResult(data);
      lastFetchedLabel.current = selectedNodeLabel;

      // セッションキャッシュに保存
      responseCache.set(selectedNodeLabel, data);
    } catch (e: any) {
      setError(e.message || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [selectedNodeLabel, getNodeRequestData]);

  // 選択ノードが変わったらリセット
  if (selectedNodeLabel !== lastFetchedLabel.current && result !== null) {
    const cached = responseCache.get(selectedNodeLabel || '');
    if (cached) {
      setResult(cached);
      lastFetchedLabel.current = selectedNodeLabel;
    } else {
      setResult(null);
      setError('');
    }
  }

  if (!selectedNodeLabel) return null;

  const hasFuture = (result?.future_map?.nodes?.length ?? 0) > 0;
  const hasPast = (result?.past_map?.nodes?.length ?? 0) > 0;

  return (
    <div className="absolute top-3 right-3 w-80 max-h-[calc(100vh-120px)] bg-surface-50 rounded-xl shadow-lg border border-surface-200 z-10 animate-slide-in-right flex flex-col">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-surface-200 shrink-0">
        <span className="text-xs font-semibold text-surface-700 truncate pr-2">
          「{selectedNodeLabel}」の関連科目
        </span>
        <button
          onClick={onClose}
          className="text-surface-400 hover:text-surface-600 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* ===== Content ===== */}
      <div className="p-3 space-y-3 overflow-y-auto flex-1">
        {/* 検索ボタン（未取得時のみ表示） */}
        {!result && !loading && (
          <Button
            size="sm"
            variant="secondary"
            onClick={fetchRelation}
            className="w-full"
          >
            <Search size={13} />
            関連科目を検索
          </Button>
        )}

        {/* ローディング */}
        {loading && <LoadingSkeleton />}

        {/* エラー */}
        {error && (
          <div className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
            {error}
          </div>
        )}

        {/* 結果表示 */}
        {result && !loading && (
          <>
            {/* 基礎（過去） */}
            <RelationSection
              title="基礎（過去）"
              icon={<ArrowDownLeft size={13} className="text-blue-500" />}
              nodes={result.past_map?.nodes || []}
              direction="past"
              colorClass="text-blue-600"
            />

            {/* 区切り線 */}
            <div className="border-t border-surface-200" />

            {/* 発展（未来） */}
            <RelationSection
              title="発展（未来）"
              icon={<ArrowUpRight size={13} className="text-emerald-500" />}
              nodes={result.future_map?.nodes || []}
              direction="future"
              colorClass="text-emerald-600"
            />

            {/* 結果がどちらも空の場合 */}
            {!hasFuture && !hasPast && (
              <p className="text-[11px] text-surface-400 text-center py-2">
                関連する科目が見つかりませんでした
              </p>
            )}

            {/* 再検索ボタン */}
            <button
              onClick={() => {
                responseCache.delete(selectedNodeLabel);
                setResult(null);
                setError('');
                lastFetchedLabel.current = null;
              }}
              className="text-[10px] text-surface-400 hover:text-surface-600 transition-colors w-full text-center pt-1"
            >
              再検索する
            </button>
          </>
        )}
      </div>

      {/* ===== Footer: メタ情報 ===== */}
      {result && !loading && (
        <div className="px-3 py-1.5 border-t border-surface-100 flex items-center gap-2 text-[9px] text-surface-400 shrink-0">
          {result.method && (
            <span className="flex items-center gap-0.5">
              <Zap size={8} />
              {result.method === 'lightweight' ? '高速' :
               result.method === 'heavy' || result.method === 'heavy_direct' ? '標準' : '—'}
            </span>
          )}
          {result.response_time_ms != null && (
            <span className="flex items-center gap-0.5">
              <Clock size={8} />
              {result.response_time_ms}ms
            </span>
          )}
        </div>
      )}
    </div>
  );
};
/**
 * 管理者ページ
 * 統合マップ・個別インスペクター・統計・CSVエクスポート
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Users, FileText, Map, Activity,
  Download, Eye, BarChart3, Loader2, SlidersHorizontal, Save,
} from 'lucide-react';
import ReactFlow, {
  Background, Controls, BackgroundVariant,
  type Node, type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui';
import { OutlookSettingsPanel } from '@/components/OutlookSettingsPanel';  // ★ 見通す機能 追加
import { isAuthenticated, isAdmin } from '@/services/authService';
import { adminService } from '@/services';
import type {
  AdminStats, User, MapNode, MapEdge, Memo, KnowledgeMapData,
  AppSettingsData, InterventionLevel,
} from '../types';

// ===== Sub-components =====

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number | string }> = ({
  icon, label, value,
}) => (
  <div className="bg-white rounded-xl border border-surface-200 p-4 flex items-center gap-3">
    <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
      {icon}
    </div>
    <div>
      <p className="text-[11px] text-surface-400">{label}</p>
      <p className="text-lg font-bold font-display text-surface-700">{value}</p>
    </div>
  </div>
);

const CombinedMapView: React.FC<{ nodes: MapNode[]; edges: MapEdge[] }> = ({ nodes, edges }) => {
  const flowNodes: Node[] = nodes.map((n, i) => ({
    id: `${n._memo_id}_${n.id}`,
    position: n.position || { x: (i % 6) * 220, y: Math.floor(i / 6) * 180 },
    data: { label: n.label || n.data?.label || n.id },
    style: {
      background: '#fff',
      border: '1px solid #dee2e6',
      borderRadius: 10,
      padding: '6px 10px',
      fontSize: 11,
    },
  }));
  const flowEdges: Edge[] = edges.map((e) => ({
    id: `${e._memo_id}_${e.id}`,
    source: `${e._memo_id}_${e.source}`,
    target: `${e._memo_id}_${e.target}`,
    label: e.label || '',
    style: { stroke: '#adb5bd' },
    labelStyle: { fontSize: 9, fill: '#868e96' },
  }));

  return (
    <div className="h-[500px] bg-surface-50 rounded-xl border border-surface-200 overflow-hidden">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#dee2e6" />
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>
    </div>
  );
};

// ===== Settings Panel（管理者機能D）=====

const FEATURE_META: {
  key: keyof AppSettingsData['intervention'];
  title: string;
  levels: Record<InterventionLevel, string>;
}[] = [
  {
    key: 'topic_detection',
    title: 'リアルタイムトピック検知＆記述提案',
    levels: {
      1: 'Lv1 可視化なし：入力との連動なし。マップは静的なまま。',
      2: 'Lv2 気づき刺激：執筆中ノードの発光・記述済みのチェックなど状態の視覚化のみ。',
      3: 'Lv3 プロンプト提示：提案カード（接続詞＋書き出し）を表示・挿入できる（フル）。',
    },
  },
  {
    key: 'satellite',
    title: '周辺概念（Satellite）の自動提案',
    levels: {
      1: 'Lv1 完全非表示：周辺概念ボタンは一切表示しない。',
      2: 'Lv2 キーワードのみ：関連する言葉（ラベル）だけ表示。関係性は隠す。',
      3: 'Lv3 フル提示：関係性ラベルも明示し、クリックで半自動的に取り込み（フル）。',
    },
  },
  {
    key: 'relation',
    title: '関連科目推薦エンジン',
    levels: {
      1: 'Lv1 非表示：カリキュラム連携を無効化（科目接続フェーズなし）。',
      2: 'Lv2 科目名のみ：関連科目の名前だけをテキストで提示。',
      3: 'Lv3 部分木接続：関連科目の部分木を今のマップにドッキング（フル）。',
    },
  },
  {
    key: 'edge_explanation',
    title: 'エッジの説明（アイコン＋ポップオーバー）',
    levels: {
      1: 'Lv1 OFF：エッジにアイコンを表示しない。',
      2: 'Lv2 単語のみ：吹き出しに関係を表す短い語句のみ表示。',
      3: 'Lv3 説明文：吹き出しに2概念の関係の説明文を表示（フル）。',
    },
  },
];

const SettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<AppSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminService.getSettings()
      .then(setSettings)
      .catch((e) => { console.error(e); setError('設定の取得に失敗しました'); })
      .finally(() => setLoading(false));
  }, []);

  const update = useCallback((patch: Partial<AppSettingsData>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const handleSave = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await adminService.updateSettings(settings);
      setSettings(saved);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    } catch (e) {
      console.error(e);
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [settings]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={24} className="animate-spin text-surface-400" />
      </div>
    );
  }
  if (!settings) {
    return <p className="text-xs text-red-500">{error || '設定を読み込めませんでした'}</p>;
  }

  return (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      {/* モード ON/OFF */}
      <section className="bg-white rounded-xl border border-surface-200 p-4">
        <h3 className="text-sm font-semibold text-surface-700 mb-3">モードの有効/無効</h3>
        <div className="flex flex-wrap gap-2">
          {([
            ['reflection', '振り返り'],
            ['research', '調べ物'],
            ['idea', 'アイデア'],
          ] as const).map(([key, label]) => {
            const on = settings.enabled_modes[key];
            return (
              <button
                key={key}
                onClick={() => update({
                  enabled_modes: { ...settings.enabled_modes, [key]: !on },
                })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  on
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-surface-400 border-surface-200'
                }`}
              >
                {label}：{on ? 'ON' : 'OFF'}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-surface-400 mt-2">※ 最低1つは ON が必要です（全OFFは保存時に自動補正）。</p>
      </section>

      {/* 介入度（比較実験） */}
      <section className="bg-white rounded-xl border border-surface-200 p-4">
        <h3 className="text-sm font-semibold text-surface-700 mb-3">機能の介入度（比較実験）</h3>
        <div className="space-y-4">
          {FEATURE_META.map((f) => {
            const cur = settings.intervention[f.key];
            return (
              <div key={f.key}>
                <p className="text-xs font-medium text-surface-700 mb-1.5">{f.title}</p>
                <div className="flex gap-1.5 mb-1.5">
                  {([1, 2, 3] as InterventionLevel[]).map((lv) => (
                    <button
                      key={lv}
                      onClick={() => update({
                        intervention: { ...settings.intervention, [f.key]: lv },
                      })}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        cur === lv
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-surface-500 border-surface-200 hover:bg-surface-50'
                      }`}
                    >
                      Lv.{lv}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-surface-500 leading-relaxed bg-surface-50 rounded-lg px-2.5 py-1.5">
                  {f.levels[cur]}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* プロンプト調整 */}
      <section className="bg-white rounded-xl border border-surface-200 p-4">
        <h3 className="text-sm font-semibold text-surface-700 mb-1">プロンプト調整</h3>
        <p className="text-[11px] text-surface-400 mb-3">
          空欄の場合は既定プロンプトを使用します。入力した内容は既定プロンプトの前に追記されます。
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-surface-600">初期マップ生成</label>
            <textarea
              value={settings.prompts.map_generation}
              onChange={(e) => update({
                prompts: { ...settings.prompts, map_generation: e.target.value },
              })}
              rows={4}
              placeholder="（例）専門用語は中学生にも分かる言葉で言い換えてください。"
              className="mt-1 w-full text-xs rounded-lg border border-surface-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-surface-600">周辺知識収集</label>
            <textarea
              value={settings.prompts.surrounding}
              onChange={(e) => update({
                prompts: { ...settings.prompts, surrounding: e.target.value },
              })}
              rows={4}
              placeholder="（例）学習者がまだ知らなそうな発展的概念を優先してください。"
              className="mt-1 w-full text-xs rounded-lg border border-surface-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-surface-600">エッジの説明</label>
            <textarea
              value={settings.prompts.edge_explanation}
              onChange={(e) => update({
                prompts: { ...settings.prompts, edge_explanation: e.target.value },
              })}
              rows={4}
              placeholder="（例）2つの概念の因果関係や順序に注目して説明してください。"
              className="mt-1 w-full text-xs rounded-lg border border-surface-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
          </div>
        </div>
      </section>

      {/* 表示機能のON/OFF */}
      <section className="bg-white rounded-xl border border-surface-200 p-4">
        <h3 className="text-sm font-semibold text-surface-700 mb-3">表示機能のON/OFF</h3>
        <div className="flex flex-wrap gap-2">
          {(() => {
            const on = settings.features?.relation_note ?? true;
            return (
              <button
                onClick={() => update({
                  features: { ...settings.features, relation_note: !on },
                })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  on
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-surface-400 border-surface-200'
                }`}
              >
                過去・未来の記述項目：{on ? 'ON' : 'OFF'}
              </button>
            );
          })()}
        </div>
        <p className="text-[11px] text-surface-400 mt-2">
          学習者の左メモパネル下部にある「過去・未来の科目とのつながり」記述欄の表示を切り替えます。
        </p>
      </section>

      {/* 見通す(関連性接続把握)設定 — 保存は本体設定と独立 ★追加 */}
      <OutlookSettingsPanel />

      {/* 保存 */}
      <div className="flex items-center gap-3">
        <Button variant="default" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          設定を保存
        </Button>
        {savedAt && <span className="text-xs text-accent-600">保存しました</span>}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
};

// ===== Main Page =====

type Tab = 'stats' | 'combined' | 'inspector' | 'settings';

const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('settings');
  // ★ ようこそバナー（ログイン直後に表示。セッション中1回）
  const [welcomeOpen, setWelcomeOpen] = useState<boolean>(() => {
    try { return sessionStorage.getItem('kmap_admin_welcomed') !== '1'; }
    catch { return true; }
  });
  const dismissWelcome = useCallback(() => {
    setWelcomeOpen(false);
    try { sessionStorage.setItem('kmap_admin_welcomed', '1'); } catch { /* noop */ }
  }, []);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [combinedNodes, setCombinedNodes] = useState<MapNode[]>([]);
  const [combinedEdges, setCombinedEdges] = useState<MapEdge[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userMaps, setUserMaps] = useState<{ memo: Memo; map: KnowledgeMapData | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 認証チェック
  useEffect(() => {
    if (!isAuthenticated() || !isAdmin()) {
      navigate('/dashboard');
    }
  }, [navigate]);

  // 統計ロード
  useEffect(() => {
    adminService.getStats().then(setStats).catch(console.error);
    adminService.getUsers().then(setUsers).catch(console.error);
  }, []);

  // 統合マップロード
  useEffect(() => {
    if (tab === 'combined') {
      setLoading(true);
      adminService.getCombinedMap()
        .then((data) => {
          setCombinedNodes(data.nodes);
          setCombinedEdges(data.edges);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [tab]);

  // ユーザー選択時のマップロード
  const handleSelectUser = useCallback(async (user: User) => {
    setSelectedUser(user);
    setLoading(true);
    try {
      const data = await adminService.getUserMaps(user.id);
      setUserMaps(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // CSVエクスポート
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await adminService.exportCsv();
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  }, []);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'stats', label: '統計', icon: <BarChart3 size={14} /> },
    { key: 'combined', label: '統合マップ', icon: <Map size={14} /> },
    { key: 'inspector', label: '個別インスペクター', icon: <Eye size={14} /> },
    { key: 'settings', label: '設定', icon: <SlidersHorizontal size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Header */}
      <header className="h-13 flex items-center justify-between px-4 border-b border-surface-200 bg-white">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={15} />
          </Button>
          <span className="text-sm font-bold font-display text-surface-700">管理者ツール</span>
        </div>
        <Button variant="secondary" size="sm" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          CSV/ZIP エクスポート
        </Button>
      </header>

      {/* ★ ようこそバナー（ログイン → ようこそ → 管理者ダッシュボード） */}
      {welcomeOpen && (
        <div className="flex items-start justify-between gap-3 px-5 py-3 bg-primary-50 border-b border-primary-200">
          <div>
            <p className="text-sm font-bold text-primary-800">ようこそ管理者様</p>
            <p className="text-[12px] text-primary-700 mt-0.5 leading-relaxed">
              ここは管理者ダッシュボードです。「設定」タブでモードのON/OFF・機能の介入度（Lv.1〜3）・
              プロンプトを変更できます。学習者の画面を確認するには、左上の戻る矢印からダッシュボードへ移動できます。
            </p>
          </div>
          <button
            onClick={dismissWelcome}
            className="text-[11px] text-primary-600 hover:text-primary-900 px-2 py-1 rounded-md hover:bg-primary-100 transition-colors shrink-0"
          >
            閉じる
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 pt-4 pb-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              tab === t.key
                ? 'bg-primary-700 text-white shadow-sm'
                : 'text-surface-500 hover:bg-surface-100'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-4 pb-8">
        {/* Stats Tab */}
        {tab === 'stats' && stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in">
            <StatCard icon={<Users size={18} />} label="ユーザー数" value={stats.user_count} />
            <StatCard icon={<FileText size={18} />} label="メモ数" value={stats.memo_count} />
            <StatCard icon={<Map size={18} />} label="マップ数" value={stats.map_count} />
            <StatCard icon={<Activity size={18} />} label="操作ログ" value={stats.log_count} />
          </div>
        )}

        {/* Combined Map Tab */}
        {tab === 'combined' && (
          <div className="animate-fade-in">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 size={24} className="animate-spin text-surface-400" />
              </div>
            ) : (
              <CombinedMapView nodes={combinedNodes} edges={combinedEdges} />
            )}
          </div>
        )}

        {/* Inspector Tab */}
        {tab === 'inspector' && (
          <div className="flex gap-4 animate-fade-in">
            {/* User list */}
            <div className="w-64 shrink-0 space-y-1">
              <p className="text-[11px] font-medium text-surface-500 mb-2">ユーザー一覧</p>
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleSelectUser(u)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                    selectedUser?.id === u.id
                      ? 'bg-primary-50 text-primary-700 border border-primary-200'
                      : 'bg-white border border-surface-200 text-surface-600 hover:bg-surface-50'
                  }`}
                >
                  <span className="font-medium">{u.user_id}</span>
                  {u.is_admin && (
                    <span className="ml-1.5 text-[10px] text-primary-500">(管理者)</span>
                  )}
                </button>
              ))}
            </div>

            {/* User detail */}
            <div className="flex-1 space-y-3">
              {selectedUser && (
                <>
                  <p className="text-sm font-semibold text-surface-700">
                    {selectedUser.user_id} のデータ
                  </p>
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 size={20} className="animate-spin text-surface-400" />
                    </div>
                  ) : userMaps.length === 0 ? (
                    <p className="text-xs text-surface-400">データがありません</p>
                  ) : (
                    userMaps.map(({ memo, map }, i) => (
                      <div
                        key={memo.id}
                        className="bg-white rounded-xl border border-surface-200 p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-surface-700">
                            メモ #{memo.id}
                          </span>
                          <span className="text-[10px] text-surface-400">
                            {memo.mode} · {memo.created_at ? new Date(memo.created_at).toLocaleDateString('ja-JP') : ''}
                          </span>
                        </div>
                        <p className="text-xs text-surface-600 leading-relaxed bg-surface-50 rounded-lg p-2">
                          {memo.content.length > 200
                            ? memo.content.slice(0, 200) + '...'
                            : memo.content}
                        </p>
                        {map && (
                          <p className="text-[10px] text-surface-400">
                            ノード: {map.nodes?.length || 0} · エッジ: {map.edges?.length || 0}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </>
              )}
              {!selectedUser && (
                <p className="text-xs text-surface-400 py-8 text-center">
                  左のリストからユーザーを選択してください
                </p>
              )}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {tab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  );
};

export default AdminPage;
/**
 * 管理者ページ
 * 統合マップ・個別インスペクター・統計・CSVエクスポート
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Users, FileText, Map, Activity,
  Download, Eye, BarChart3, Loader2,
} from 'lucide-react';
import ReactFlow, {
  Background, Controls, BackgroundVariant,
  type Node, type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui';
import { isAuthenticated, isAdmin } from '@/services/authService';
import { adminService } from '@/services';
import type { AdminStats, User, MapNode, MapEdge, Memo, KnowledgeMapData } from '../types';

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

// ===== Main Page =====

type Tab = 'stats' | 'combined' | 'inspector';

const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('stats');
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
      </div>
    </div>
  );
};

export default AdminPage;

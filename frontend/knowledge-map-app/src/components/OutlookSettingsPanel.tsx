/**
 * OutlookSettingsPanel.tsx — 管理者向け「見通す」機能設定
 * 配置先: frontend/knowledge-map-app/src/components/OutlookSettingsPanel.tsx
 *
 * AdminPage の SettingsPanel 内に <OutlookSettingsPanel /> を1行追加するだけで動く。
 * 保存は本体設定とは独立(専用API /api/admin/outlook/settings)。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Telescope, Download } from 'lucide-react';
import * as outlookService from '@/services/outlookService';
import type { OutlookAdminSettings, OutlookEngineStatus } from '@/types/outlook';

export const OutlookSettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<OutlookAdminSettings | null>(null);
  const [engine, setEngine] = useState<OutlookEngineStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    outlookService.getAdminSettings()
      .then((d) => { setSettings(d.settings); setEngine(d.engine); })
      .catch(() => setError('「見通す」設定の取得に失敗しました'));
  }, []);

  const handleSave = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    try {
      const saved = await outlookService.updateAdminSettings(settings);
      setSettings(saved);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    } catch {
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try { await outlookService.exportOutlookCsv(); } catch { /* noop */ }
    setExporting(false);
  }, []);

  if (!settings) {
    return (
      <section className="bg-white rounded-xl border border-surface-200 p-4">
        <h3 className="text-sm font-semibold text-surface-700 mb-2 flex items-center gap-1.5">
          <Telescope size={14} /> 見通す(関連性接続把握)
        </h3>
        {error
          ? <p className="text-xs text-red-500">{error}</p>
          : <Loader2 size={16} className="animate-spin text-surface-400" />}
      </section>
    );
  }

  return (
    <section className="bg-white rounded-xl border border-surface-200 p-4">
      <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-1.5">
        <Telescope size={14} /> 見通す(関連性接続把握)
      </h3>

      <div className="space-y-3">
        {/* ON/OFF */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              settings.enabled
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-surface-400 border-surface-200'
            }`}
          >
            機能: {settings.enabled ? 'ON' : 'OFF'}
          </button>
          <span className="text-[11px] text-surface-400">
            OFF時はAPIも403で拒否されます(ボタン非表示+バックエンド強制)。
          </span>
        </div>

        {/* 閾値 */}
        <div>
          <label className="text-[11px] font-medium text-surface-600">
            類似度閾値(これ未満のつながりは説明を出さない): {settings.similarity_threshold.toFixed(2)}
          </label>
          <input
            type="range" min={0} max={1} step={0.01}
            value={settings.similarity_threshold}
            onChange={(e) => setSettings({
              ...settings, similarity_threshold: parseFloat(e.target.value),
            })}
            className="w-full mt-1 accent-primary-600"
          />
        </div>

        {/* 最大ノード数 */}
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-medium text-surface-600">
            説明を出す振り返りノードの上限
          </label>
          <input
            type="number" min={1} max={30}
            value={settings.max_nodes}
            onChange={(e) => setSettings({
              ...settings, max_nodes: parseInt(e.target.value || '10', 10),
            })}
            className="w-16 text-xs rounded-lg border border-surface-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-400"
          />
          <span className="text-[11px] text-surface-400">件(既定 10)</span>
        </div>

        {/* エンジン状態 */}
        {engine && (
          <p className="text-[11px] text-surface-400 bg-surface-50 rounded-lg px-2.5 py-1.5">
            エンジン: {engine.loaded
              ? `ロード済み(科目 ${engine.subject_count} 件 / マップ ${engine.map_count} 件)`
              : engine.load_error
                ? `ロード失敗: ${engine.load_error}`
                : '未ロード(初回リクエスト時にロード)'}
          </p>
        )}

        {/* 保存・エクスポート */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            見通す設定を保存
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-surface-200 text-surface-600 hover:bg-surface-50 disabled:opacity-40"
          >
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            回答・説明CSV
          </button>
          {savedAt && <span className="text-xs text-accent-600">保存しました</span>}
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      </div>
    </section>
  );
};

export default OutlookSettingsPanel;
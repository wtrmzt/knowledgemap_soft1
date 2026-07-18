/**
 * アプリケーション ルーティング設定
 *
 * v3 変更点:
 * - /maps ルートを追加(マップ閲覧画面)
 * - 既存ルート(login / consent / dashboard / admin)は完全保持
 *
 * v3.1 変更点:
 * - /auth/callback ルートを追加(Supabase Google OAuth コールバック処理)
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from '@/pages/LoginPage';
import ConsentPage from '@/pages/ConsentPage';
import DashboardPage from '@/pages/DashboardPage';
import AdminPage from '@/pages/AdminPage';
import MapsListPage from '@/pages/MapsListPage';              // ★ v3 追加
import AuthCallbackPage from '@/pages/AuthCallbackPage';      // ★ v3.1 追加
import OutlookPage from '@/pages/OutlookPage';                // ★ 見通す機能 追加

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />  {/* ★ v3.1 追加 */}
        <Route path="/consent" element={<ConsentPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/maps" element={<MapsListPage />} />        {/* ★ v3 追加 */}
        <Route path="/outlook" element={<OutlookPage />} />      {/* ★ 見通す機能 追加 */}
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
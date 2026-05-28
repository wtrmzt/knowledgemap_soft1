/**
 * Google ログイン関連の API 呼び出し (v3 → v3.1 Supabase Auth 対応).
 *
 * 変更点:
 *   v3  : @react-oauth/google の credential (ID Token) をバックエンドに送信
 *   v3.1: Supabase Auth の signInWithOAuth で Google 認証 → コールバック後に
 *         Supabase セッションの access_token をバックエンドに送信
 *
 * バックエンド側 POST /api/auth/google は { access_token } を期待するため、
 * Supabase セッションから取得した access_token をそのまま渡す.
 */

import { supabase } from './supabaseClient';
import { apiPost } from './apiClient';
import type { User } from '@/types';

export interface GoogleLoginResponse {
  token: string;
  user: User;
}

/**
 * Supabase Auth 経由で Google OAuth フローを開始する.
 * 呼び出すと Google 認証画面にリダイレクトされる.
 *
 * @param redirectTo 認証後の戻り先URL（省略時は /auth/callback）
 * @throws supabase が未初期化、または OAuth 開始に失敗した場合
 */
export async function loginWithGoogle(
  redirectTo?: string,
): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase が初期化されていません（環境変数を確認してください）');
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTo ?? `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    throw error;
  }
  // リダイレクトされるため、ここには戻らない
}

/**
 * OAuth コールバック後に Supabase セッションを取得し、
 * バックエンドに access_token を送って自前 JWT を取得する.
 *
 * 成功時は localStorage に token を保存して既存のフローに合流する.
 * LoginPage → Google → Supabase callback → /auth/callback → この関数 → /consent
 */
export async function handleGoogleCallback(): Promise<GoogleLoginResponse> {
  if (!supabase) {
    throw new Error('Supabase が初期化されていません（環境変数を確認してください）');
  }

  // Supabase がリダイレクト URL のハッシュフラグメントからセッションを復元する
  const { data, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !data.session) {
    throw new Error(
      sessionError?.message ?? 'Google 認証のセッション取得に失敗しました',
    );
  }

  // バックエンドに Supabase access_token を送信（バックエンド側で検証・ユーザー作成）
  const result = await apiPost<GoogleLoginResponse>('/auth/google', {
    access_token: data.session.access_token,
  });

  // 既存の login() と同じく localStorage に保存
  // (apiClient が次回以降のリクエストで自動的に Authorization ヘッダに乗せる)
  try {
    localStorage.setItem('auth_token', result.token);
    localStorage.setItem('auth_user', JSON.stringify(result.user));
  } catch {
    // localStorage が使えない環境ではフォールバックなし
  }

  return result;
}
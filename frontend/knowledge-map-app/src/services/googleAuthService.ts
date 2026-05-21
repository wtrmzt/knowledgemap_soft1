/**
 * Google ログイン関連の API 呼び出し (v3 新規).
 *
 * フロントエンドは @react-oauth/google の <GoogleLogin> コンポーネントから
 * credential (ID Token) を取得し、本サービス経由でバックエンドに渡す.
 */

import { apiPost } from './apiClient';
import type { User } from '@/types';

export interface GoogleLoginResponse {
  token: string;
  user: User;
}

/**
 * Google ID Token をバックエンドに送って自前 JWT を取得する.
 * 成功時は localStorage に token を保存して既存のフローに合流する.
 *
 * @param credential Google Identity Services が返した JWT (ID Token)
 */
export async function loginWithGoogle(
  credential: string,
): Promise<GoogleLoginResponse> {
  const result = await apiPost<GoogleLoginResponse>('/auth/google', { credential });

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
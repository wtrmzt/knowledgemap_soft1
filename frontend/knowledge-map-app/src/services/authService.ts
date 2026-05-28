/**
 * authService.ts（差し替え版・修正済み）
 *
 * 修正点（前回の不具合対応）:
 *   - import を "@/services"(index.ts) ではなく "./apiClient" 直接に変更
 *     （index.ts は名前空間re-exportのため apiPost を直接持たない）
 *   - 既存の TOKEN_KEY = 'auth_token' / saveToken / getToken / removeToken に統一
 *   - getMe は { user } でラップされて返る既存仕様に合わせる
 *
 * 方式: Supabase Auth(Google) でログイン → access_token をバックエンドに渡し
 *       /api/auth/google で自前アプリJWTに交換 → localStorage に保存。
 *       以降のAPIは従来どおり apiClient が JWT を自動付与する。
 */
import { jwtDecode } from "jwt-decode";
import { apiGet, apiPost } from "./apiClient";
import { supabase } from "./supabaseClient";
import type { User, AuthPayload } from "@/types";

// 既存実装と同じキー名にすること（apiClient.ts がこの値を読む）
const TOKEN_KEY = "auth_token";

// ---- トークン保管（既存の関数名を踏襲）----
export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// =====================================================================
//  トークン解析・状態判定（既存どおり）
// =====================================================================
export function decodeToken(): AuthPayload | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = jwtDecode<AuthPayload>(token);
    if (payload.exp * 1000 < Date.now()) {
      removeToken();
      return null;
    }
    return payload;
  } catch {
    removeToken();
    return null;
  }
}

export function isAuthenticated(): boolean {
  return decodeToken() !== null;
}

export function isAdmin(): boolean {
  const payload = decodeToken();
  return payload?.is_admin ?? false;
}

export function getCurrentUserId(): string | null {
  const payload = decodeToken();
  return payload?.user_id ?? null;
}

// =====================================================================
//  既存: IDベースログイン（デモ用・フォールバックとして温存）
// =====================================================================
export async function login(userId: string): Promise<{ token: string; user: User }> {
  const data = await apiPost<{ token: string; user: User }>("/login", {
    user_id: userId,
  });
  saveToken(data.token);
  return data;
}

export async function updateConsent(consented: boolean): Promise<void> {
  await apiPost("/consent", { consented });
}

export async function getMe(): Promise<User> {
  const data = await apiGet<{ user: User }>("/me");
  return data.user;
}

// =====================================================================
//  新規: Supabase Auth による Google ログイン
// =====================================================================

/**
 * Googleログイン開始。Google同意画面へリダイレクトする。
 * 戻り先は /login。戻った後 handleAuthRedirect() が交換処理を行う。
 */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/login`,
    },
  });
  if (error) throw error;
}

/**
 * Supabase セッション → 自前アプリJWT に交換する。
 * Supabase の access_token をバックエンド /api/auth/google に渡し、
 * 検証後に発行されたアプリJWTを localStorage に保存する。
 */
export async function exchangeSupabaseSession(): Promise<{ token: string; user: User } | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data.session;
  if (!session) return null;

  const res = await apiPost<{ token: string; user: User }>("/auth/google", {
    access_token: session.access_token,
  });
  saveToken(res.token);
  return res;
}

/**
 * ログインページ初期化時に呼ぶ。
 * OAuthリダイレクトから戻ってきた直後ならセッションが存在するので、
 * 自動でトークン交換を行い、成功すれば {token,user} を返す。
 * 通常表示（リダイレクト帰りでない）では null を返す。
 */
export async function handleAuthRedirect(): Promise<{ token: string; user: User } | null> {
  // supabaseClient で detectSessionInUrl=true のため ?code=... は自動でセッション化済み
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  return exchangeSupabaseSession();
}

// =====================================================================
//  ログアウト
// =====================================================================
export async function logout(): Promise<void> {
  removeToken();
  // Supabase 側セッションも破棄（次回のGoogleアカウント選択を出すため）
  await supabase.auth.signOut();
}
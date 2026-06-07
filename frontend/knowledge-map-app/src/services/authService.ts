/**
 * authService.ts（パスワードログイン対応版）
 *
 * 変更点:
 *   - login(userId, password?) … ID + パスワードでログイン
 *   - getAuthConfig() を追加 … バックエンドの有効ログイン方式を取得
 *   - Google 関連関数は温存（FEATURE_GOOGLE_LOGIN を有効化すれば再利用可）
 *
 * トークン保管・解析は既存どおり。apiClient が JWT を自動付与する。
 */
import { jwtDecode } from "jwt-decode";
import { apiGet, apiPost } from "./apiClient";
import { supabase } from "./supabaseClient";
import type { User, AuthPayload } from "@/types";

const TOKEN_KEY = "auth_token";

// ---- トークン保管 ----
export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ---- トークン解析・状態判定 ----
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
//  ログイン方式の取得（ボタンの出し分けに使用）
// =====================================================================
export interface AuthConfig {
  password_login_enabled: boolean;
  demo_login_enabled: boolean;
  legacy_login_enabled: boolean;
  google_login_enabled: boolean;
}

export async function getAuthConfig(): Promise<AuthConfig> {
  return apiGet<AuthConfig>("/auth/config");
}

// =====================================================================
//  ID + パスワードログイン（主方式）
// =====================================================================
export async function login(
  userId: string,
  password?: string,
): Promise<{ token: string; user: User }> {
  const payload: Record<string, string> = { user_id: userId };
  if (password !== undefined) {
    payload.password = password;
  }
  const data = await apiPost<{ token: string; user: User }>("/login", payload);
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
//  Google ログイン（温存。FEATURE_GOOGLE_LOGIN 有効時のみ使用）
// =====================================================================
export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error("Supabase が初期化されていません");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/login` },
  });
  if (error) throw error;
}

export async function exchangeSupabaseSession(): Promise<{ token: string; user: User } | null> {
  if (!supabase) return null;
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

export async function handleAuthRedirect(): Promise<{ token: string; user: User } | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  return exchangeSupabaseSession();
}

// =====================================================================
//  ログアウト
// =====================================================================
export async function logout(): Promise<void> {
  removeToken();
  if (supabase) {
    await supabase.auth.signOut();
  }
}
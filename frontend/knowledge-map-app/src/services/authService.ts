/**
 * 認証・認可サービス
 * ログイン、トークン管理、管理者判定
 */
import { jwtDecode } from 'jwt-decode';
import { apiPost, apiGet } from './apiClient';
import type { User, AuthPayload } from '@/types';

const TOKEN_KEY = 'auth_token';

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function decodeToken(): AuthPayload | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = jwtDecode<AuthPayload>(token);
    // 期限チェック
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

export async function login(userId: string): Promise<{ token: string; user: User }> {
  const data = await apiPost<{ token: string; user: User }>('/login', { user_id: userId });
  saveToken(data.token);
  return data;
}

export async function updateConsent(consented: boolean): Promise<void> {
  await apiPost('/consent', { consented });
}

export async function getMe(): Promise<User> {
  const data = await apiGet<{ user: User }>('/me');
  return data.user;
}

export function logout(): void {
  removeToken();
}

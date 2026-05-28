/**
 * Supabase クライアント初期化 (v3.1).
 *
 * 環境変数 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY から
 * Supabase JS クライアントを生成する.
 *
 * authService.ts が supabase.auth.xxx を直接呼ぶため、
 * 常に SupabaseClient を返す（null 不可）.
 * 環境変数が未設定の場合はダミー値で生成し、実際の呼び出し時に
 * Supabase 側でエラーとなる（レガシーIDログインのみの環境では
 * Google ログインボタンを押さない限り問題にならない）.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[supabaseClient] VITE_SUPABASE_URL または VITE_SUPABASE_ANON_KEY が未設定です。' +
    'Google ログインは利用できません。',
  );
}

export const supabase = createClient(
  SUPABASE_URL ?? 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY ?? 'placeholder',
);
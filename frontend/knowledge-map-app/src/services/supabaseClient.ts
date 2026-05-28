/**
 * Supabase クライアント（新規）
 *
 * フロントエンドの Google ログインに使用する。
 * 環境変数は frontend/knowledge-map-app/.env に設定する:
 *   VITE_SUPABASE_URL=https://<project-id>.supabase.co
 *   VITE_SUPABASE_ANON_KEY=<anon public key>
 *
 * 依存パッケージ: npm install @supabase/supabase-js
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // 開発時に設定漏れを早期に気づけるように警告
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が未設定です。.env を確認してください。"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // OAuth リダイレクト後の ?code=... を自動でセッションに交換する
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});

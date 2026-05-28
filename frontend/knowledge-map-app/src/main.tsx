/**
 * v3.1: Supabase Auth 対応版.
 *
 * Google 認証は Supabase Auth のリダイレクトフローで行うため、
 * @react-oauth/google の GoogleOAuthProvider は不要.
 * Supabase クライアントは services/supabaseClient.ts で初期化済み.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
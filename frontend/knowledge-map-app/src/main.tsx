/**
 * v3: GoogleOAuthProvider をオプショナルでラップ
 *
 * VITE_GOOGLE_CLIENT_ID が設定されていれば Provider でラップ、
 * 未設定なら従来通り <App /> をそのままレンダー(後方互換)
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// 動的インポートで @react-oauth/google が未インストールでも起動可能にする
function Root() {
  // クライアント ID が無ければラップせずそのまま返す(従来挙動)
  if (!GOOGLE_CLIENT_ID) {
    return <App />;
  }

  // 動的読み込み(失敗時はフォールバック)
  const [Provider, setProvider] = React.useState<React.ComponentType<any> | null>(null);

  React.useEffect(() => {
    let mounted = true;
    import('@react-oauth/google')
      .then((mod) => {
        if (mounted) setProvider(() => mod.GoogleOAuthProvider);
      })
      .catch((e) => {
        // ライブラリ未インストール時は静かにフォールバック
        console.warn('[v3] @react-oauth/google not available:', e);
      });
    return () => { mounted = false; };
  }, []);

  if (Provider) {
    return (
      <Provider clientId={GOOGLE_CLIENT_ID}>
        <App />
      </Provider>
    );
  }
  // 読み込み中(またはフォールバック)
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
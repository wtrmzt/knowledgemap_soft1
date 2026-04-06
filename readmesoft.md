# 知識マップを用いた振り返り支援システム

教育工学・学習支援研究に特化した、知識マップベースの振り返り支援Webアプリケーション。

---

## アーキテクチャ

```
app6/
├── backend/                         # Flask バックエンド
│   ├── app.py                       # メインエントリ＆APIエンドポイント登録
│   ├── config.py                    # アプリケーション設定
│   ├── models.py                    # SQLAlchemy データベースモデル
│   ├── auth.py                      # JWT認証・認可モジュール
│   ├── ai_service.py               # OpenAI API連携（マップ生成・ノード生成・メモ改善）
│   ├── wikidata_service.py          # Wikidata SPARQL連携・Jaccard類似度
│   ├── time_relation_logic.py       # 時系列関連科目算出ロジック
│   ├── requirements.txt             # Python依存パッケージ
│   ├── .env.example                 # 環境変数テンプレート
│   ├── UECsubject_maps11/           # 科目CSVデータ
│   │   └── subjects.csv
│   └── instance/                    # SQLiteローカルDB格納
│
└── frontend/
    └── knowledge-map-app/           # React + Vite フロントエンド
        ├── index.html
        ├── package.json
        ├── vite.config.ts
        ├── tsconfig.json
        ├── tailwind.config.js
        ├── postcss.config.js
        └── src/
            ├── main.tsx             # Reactエントリポイント
            ├── App.tsx              # ルーティング設定
            ├── index.css            # グローバルCSS + React Flow カスタマイズ
            ├── vite-env.d.ts
            ├── types/
            │   └── index.ts         # TypeScript型定義（一元管理）
            ├── utils/
            │   └── index.ts         # ユーティリティ関数（cn, generateId等）
            ├── services/            # バックエンドAPI通信層（機能別分離）
            │   ├── index.ts         # バレルエクスポート
            │   ├── apiClient.ts     # fetch ラッパー＆トークン管理
            │   ├── authService.ts   # 認証サービス
            │   ├── mapService.ts    # マップCRUD・ノード生成・関連科目
            │   ├── memoService.ts   # メモCRUD・改善
            │   ├── adminService.ts  # 管理者向けAPI
            │   └── loggingService.ts # 操作ログ送信
            ├── components/          # UIコンポーネント（機能別分離）
            │   ├── index.ts
            │   ├── ui/              # 汎用UIパーツ
            │   │   ├── index.ts
            │   │   ├── Button.tsx
            │   │   └── Input.tsx
            │   ├── ModeSwitcher.tsx          # 3モード切替
            │   ├── ReflectionSheet.tsx       # 振り返りシート（write/reviseフェーズ）
            │   ├── KnowledgeMapDisplay.tsx   # React Flowマップ表示
            │   ├── CustomNode.tsx            # カスタムノード
            │   ├── RelationPanel.tsx         # 関連科目パネル
            │   └── MapHistoryPanel.tsx       # 履歴・ロールバックパネル
            └── pages/               # 画面コンポーネント
                ├── LoginPage.tsx     # ログイン＋デモユーザー
                ├── ConsentPage.tsx   # 実験同意
                ├── DashboardPage.tsx # メインワークスペース
                └── AdminPage.tsx     # 管理者ツール
```

---

## セットアップ手順

### 1. バックエンド

```bash
cd backend

# 仮想環境作成 (推奨)
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# 依存パッケージインストール
pip install -r requirements.txt

# 環境変数設定
cp .env.example .env
# .env を編集して OPENAI_API_KEY を設定

# 起動
python app.py
# → http://localhost:5000
```

### 2. フロントエンド

```bash
cd frontend/knowledge-map-app

# 依存パッケージインストール
npm install

# 開発サーバー起動
npm run dev
# → http://localhost:5173
```

Vite の proxy 設定により `/api` へのリクエストは自動的に `localhost:5000` に転送されます。

---

## モジュール分割の設計方針

### バックエンド（7モジュール）

| モジュール | 責務 |
|---|---|
| `config.py` | 環境変数・設定値管理 |
| `models.py` | DBモデル定義（5テーブル） |
| `auth.py` | JWT生成・検証・デコレータ |
| `ai_service.py` | OpenAI API連携全般 |
| `wikidata_service.py` | Wikidata SPARQL連携 |
| `time_relation_logic.py` | 科目推薦アルゴリズム |
| `app.py` | Flaskアプリ＆ルート登録（機能別register関数） |

`app.py` 内のエンドポイントも `register_auth_routes`, `register_memo_routes` 等の関数に分離されており、
各機能の変更が他に影響しにくい構造です。

### フロントエンド（3層分離）

| 層 | 内容 |
|---|---|
| `services/` | API通信（6ファイル） — 認証・マップ・メモ・管理者・ログ |
| `components/` | UIコンポーネント（8ファイル） — 汎用UI + 機能別コンポーネント |
| `pages/` | 画面コンポーネント（4ファイル） — Login / Consent / Dashboard / Admin |

---

## 搭載機能一覧

### 認証・ユーザー管理
- IDベースログイン / デモユーザー自動ログイン
- JWT認証 / 管理者判定
- 実験同意取得（ConsentPage）

### メモ・振り返り入力
- テキスト入力 → DB保存 → 同時AIマップ生成
- 振り返り文の改善（AI添削・リライト）
- 改善提案のコメント表示

### 知識マップ操作
- GPT-4によるマップ自動生成（ノード・エッジ JSON）
- React Flowインタラクティブ可視化
- ノード手動追加（AIノード自動生成）
- ノード間手動接続
- バックグラウンド自動保存
- 関連科目推薦（基礎/発展）

### AIコア機能
- GPT-4マップ生成（モード別プロンプト）
- 140字説明文 + 拡張概念生成
- Text Embedding コサイン類似度計算
- Wikidata SPARQL オントロジー連携
- Jaccard係数による構造的類似度計算

### モード切替機能
- **振り返りモード**: 学習内容の振り返り・整理
- **調べ物モード**: 概念・トピックの探索
- **アイデアモード**: 発想・アイデアの展開

### 振り返り文の改善機能
- **writeフェーズ**: テキストエリア + マップ生成ボタン
- **reviseフェーズ**: テキストエリア + 改善提案 + ノード追加ナッジ

### 管理者・研究者向け機能
- 統合マップ閲覧 / 個別インスペクター
- 統計情報表示
- CSV/ZIPワンクリックエクスポート

### データ記録・ログ
- MapHistory: 全編集スナップショット保存
- UserActivityLog: 全操作ログ記録
- ロールバック対応（履歴から復元）

---

## 本番デプロイ（Render 例）

### バックエンド
- Runtime: Python
- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app --bind 0.0.0.0:$PORT`
- 環境変数に `DATABASE_URL`（PostgreSQL）, `OPENAI_API_KEY`, `SECRET_KEY` を設定

### フロントエンド
- `npm run build` で `dist/` を生成
- 静的サイトとしてデプロイ、またはバックエンドで `dist/` を配信
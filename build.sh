#!/usr/bin/env bash
# Render 用ビルドスクリプト
# フロントエンドをビルドして backend/static に配置し、
# バックエンドの依存関係をインストールする

set -o errexit  # エラーで即終了

echo "===== 1. フロントエンドのビルド ====="
cd frontend/knowledge-map-app
npm install
npm run build
cd ../..

echo "===== 2. ビルド成果物を backend/static にコピー ====="
rm -rf backend/static
cp -r frontend/knowledge-map-app/dist backend/static

echo "===== 3. バックエンドの依存関係インストール ====="
cd backend
pip install -r requirements.txt

echo "===== ビルド完了 ====="
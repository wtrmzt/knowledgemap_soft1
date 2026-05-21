# `backend/requirements.txt` への追加

既存の依存に加えて以下を追加します。

## 追加分

```txt
# ===== Phase 1: Redis / レート制限 =====
redis>=5.0.0,<6.0.0

# ===== Phase 1: WSGI 性能向上 =====
gevent>=23.9.0
gunicorn>=21.2.0  # 既存にあれば不要

# ===== Phase 1: マイグレーション =====
alembic>=1.13.0

# ===== Phase 1: 非同期ジョブ (Celery を採用する場合のみ) =====
celery>=5.3.0,<6.0.0

# ===== Phase 2: Google ログイン =====
google-auth>=2.27.0,<3.0.0

# ===== Phase 4: エラー監視 (推奨) =====
sentry-sdk[flask]>=1.40.0

# ===== Phase 3: S3 を使う場合 =====
# boto3>=1.34.0
```

## 完全な requirements.txt の例

```txt
# Web framework
Flask>=3.0.0
Flask-Cors>=4.0.0
Flask-SQLAlchemy>=3.1.0

# Auth
PyJWT>=2.8.0
google-auth>=2.27.0,<3.0.0

# DB
SQLAlchemy>=2.0.0
psycopg2-binary>=2.9.9
alembic>=1.13.0

# Redis & async
redis>=5.0.0,<6.0.0
celery>=5.3.0,<6.0.0

# WSGI
gunicorn>=21.2.0
gevent>=23.9.0

# AI
openai>=1.30.0

# NLP / data
pandas>=2.1.0
numpy>=1.26.0
spacy>=3.7.0
requests>=2.31.0  # Wikidata SPARQL

# Monitoring
sentry-sdk[flask]>=1.40.0

# Dev
python-dotenv>=1.0.0
pytest>=8.0.0
```

## Sentry 統合の最小コード (`app.py` の冒頭に追加)

```python
import os
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

if os.getenv("SENTRY_DSN"):
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        integrations=[FlaskIntegration()],
        traces_sample_rate=0.1,  # 10% のリクエストをトレース
        environment=os.getenv("APP_ENV", "production"),
    )
```

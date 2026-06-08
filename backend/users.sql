-- 自動生成: ユーザー登録 SQL（Supabase SQL Editor に貼り付けて Run）
-- password_hash はローカルで pbkdf2 ハッシュ化済み。平文は含みません。
BEGIN;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('test1', 'pbkdf2:sha256:1000000$agFB00SUYQS4AjME$7f12b1202a34be99bcd6358ba95c469d7d6dd293d10730f431d8125559f1d5dc', false, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('admin', 'pbkdf2:sha256:1000000$3epQ3wXkmJBOIHav$77348a75707381085b54ca75c21591d1bc06eb3a609fdff610b15fd5fdcf79c8', true, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
INSERT INTO users (user_id, password_hash, is_admin, consented, auth_provider, created_at)
VALUES ('researcher', 'pbkdf2:sha256:1000000$dxJX2CQWvhVuTxxh$e06b64781fb611389d85462f3eefd5c927967d2431a444039e0e78e7b04b8e77', true, false, 'password', now())
ON CONFLICT (user_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_admin      = EXCLUDED.is_admin,
      auth_provider = EXCLUDED.auth_provider;
COMMIT;

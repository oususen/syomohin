-- ユーザーテーブルに姓・名カラムを追加するマイグレーション
-- 実行方法: mysql -u root -p inventory_db < scripts/maintenance/migrate_user_name_split.sql

ALTER TABLE users
    ADD COLUMN last_name  VARCHAR(100) NOT NULL DEFAULT '' COMMENT '姓' AFTER full_name,
    ADD COLUMN first_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '名' AFTER last_name;

-- 既存データ: full_name をスペース（半角・全角）で分割して姓・名に移行
--   全角スペース(U+3000=0xE38080)を先に半角スペースに統一してから分割する
UPDATE users
SET
    last_name  = TRIM(SUBSTRING_INDEX(REPLACE(full_name, X'E38080', ' '), ' ', 1)),
    first_name = TRIM(SUBSTRING(
        REPLACE(full_name, X'E38080', ' '),
        LENGTH(SUBSTRING_INDEX(REPLACE(full_name, X'E38080', ' '), ' ', 1)) + 2
    ));

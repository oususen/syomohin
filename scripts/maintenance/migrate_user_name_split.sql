-- ユーザーテーブルに姓・名カラムを追加するマイグレーション
-- 実行方法: mysql -u root -p inventory_db < scripts/maintenance/migrate_user_name_split.sql

ALTER TABLE users
    ADD COLUMN last_name  VARCHAR(100) NOT NULL DEFAULT '' COMMENT '姓' AFTER full_name,
    ADD COLUMN first_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '名' AFTER last_name;

-- 既存データ: full_name をスペースで分割して姓・名に移行
--   例: "渥美 圭佑" → last_name="渥美", first_name="圭佑"
--   スペースがない場合は全体を姓として扱う
UPDATE users
SET
    last_name  = TRIM(SUBSTRING_INDEX(full_name, ' ', 1)),
    first_name = TRIM(SUBSTRING(full_name, LENGTH(SUBSTRING_INDEX(full_name, ' ', 1)) + 2));

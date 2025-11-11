#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""データベースの画像パスを修正するスクリプト"""
from database_manager import get_db_manager

db = get_db_manager()

# images/で始まらない画像パスを持つレコードを取得
query = """
SELECT id, code, name, image_path
FROM consumables
WHERE image_path IS NOT NULL
  AND image_path != ''
  AND image_path NOT LIKE 'images/%'
  AND image_path NOT LIKE 'http://%'
  AND image_path NOT LIKE 'https://%'
"""
result = db.execute_query(query, {})

print(f"修正が必要なレコード: {len(result)}件")

if len(result) > 0:
    print("\n修正中...")
    for idx, row in result.iterrows():
        old_path = row['image_path']
        new_path = f"images/{old_path}"

        update_query = "UPDATE consumables SET image_path = :new_path WHERE id = :id"
        db.execute_update(update_query, {'new_path': new_path, 'id': row['id']})
        print(f"  ID {row['id']}: {old_path} -> {new_path}")

    print(f"\n✓ {len(result)}件の画像パスを修正しました")
else:
    print("修正が必要なレコードはありません")

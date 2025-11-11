#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""データベースの画像パスを確認するスクリプト"""
from database_manager import get_db_manager

db = get_db_manager()
query = "SELECT id, code, name, image_path FROM consumables WHERE image_path IS NOT NULL AND image_path != ''"
result = db.execute_query(query, {})

print(f"画像パスを持つレコード: {len(result)}件")
if len(result) > 0:
    print("\n最初の10件:")
    for idx, row in result.head(10).iterrows():
        print(f"  ID: {row['id']}, Code: {row['code']}, Image: {row['image_path']}")
else:
    print("画像パスを持つレコードはありません")

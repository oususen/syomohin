"""
JSONデータをMySQLにインポートするスクリプト
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pymysql
from dotenv import load_dotenv

# .envファイルから環境変数を読み込み
load_dotenv()

# MySQL接続情報
DB_CONFIG = {
    "host": os.getenv("INVENTORY_DB_HOST", "localhost"),
    "port": int(os.getenv("INVENTORY_DB_PORT", 3306)),
    "user": os.getenv("INVENTORY_DB_USER", "root"),
    "password": os.getenv("PRIMARY_DB_PASSWORD") or os.getenv("INVENTORY_DB_PASSWORD", ""),
    "database": os.getenv("INVENTORY_DB_NAME", "inventory_db"),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}


def get_connection():
    """MySQL接続を取得"""
    return pymysql.connect(**DB_CONFIG)


def import_consumables():
    """JSONファイルから消耗品データをインポート"""
    json_file = Path(__file__).parent / "data" / "consumables.json"

    if not json_file.exists():
        print(f"[ERROR] JSONファイルが見つかりません: {json_file}")
        return

    # JSONデータを読み込み
    with open(json_file, encoding="utf-8") as f:
        data = json.load(f)

    print(f"[INFO] {len(data)}件のデータを読み込みました")

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            # 既存の購入先を取得（重複を避けるため）
            suppliers_map = {}

            for item in data:
                supplier_name = item.get("購入先", "")

                # 購入先マスターに登録（存在しない場合）
                if supplier_name and supplier_name not in suppliers_map:
                    cursor.execute(
                        """
                        INSERT IGNORE INTO suppliers (name)
                        VALUES (%s)
                        """,
                        (supplier_name,),
                    )
                    cursor.execute("SELECT id FROM suppliers WHERE name = %s", (supplier_name,))
                    result = cursor.fetchone()
                    if result:
                        suppliers_map[supplier_name] = result["id"]

            conn.commit()
            print(f"[OK] {len(suppliers_map)}件の購入先を登録しました")

            # 消耗品データを登録
            success_count = 0
            for item in data:
                try:
                    supplier_id = suppliers_map.get(item.get("購入先", ""))

                    # 画像URLをimage_pathに変換（将来的にはローカルファイルパスに）
                    image_url = item.get("画像URL", "")
                    image_path = image_url if image_url else None

                    cursor.execute(
                        """
                        INSERT INTO consumables (
                            code, order_code, name, category, unit,
                            stock_quantity, safety_stock, order_status, shortage_status,
                            supplier_id, image_path, note
                        ) VALUES (
                            %s, %s, %s, %s, %s,
                            %s, %s, %s, %s,
                            %s, %s, %s
                        )
                        ON DUPLICATE KEY UPDATE
                            name = VALUES(name),
                            stock_quantity = VALUES(stock_quantity),
                            safety_stock = VALUES(safety_stock),
                            order_status = VALUES(order_status),
                            shortage_status = VALUES(shortage_status)
                        """,
                        (
                            item.get("コード", ""),
                            item.get("発注コード", ""),
                            item.get("品名", ""),
                            item.get("カテゴリ", ""),
                            item.get("単位", ""),
                            item.get("在庫数", 0),
                            item.get("安全在庫", 0),
                            item.get("注文状態", "未発注"),
                            item.get("欠品状態", "在庫あり"),
                            supplier_id,
                            image_path,
                            item.get("備考", ""),
                        ),
                    )
                    success_count += 1
                except Exception as e:
                    print(f"[WARN] データ登録エラー [{item.get('コード', 'N/A')}]: {e}")

            conn.commit()
            print(f"[OK] {success_count}件の消耗品を登録しました")

    except Exception as e:
        print(f"[ERROR] インポートエラー: {e}")
        conn.rollback()
    finally:
        conn.close()


def main():
    """メイン処理"""
    print("=" * 60)
    print("[在庫管理システム] JSONデータをMySQLにインポート")
    print("=" * 60)

    try:
        # 接続テスト
        conn = get_connection()
        print(f"[OK] MySQL接続成功: {DB_CONFIG['host']}:{DB_CONFIG['port']}")
        conn.close()

        # データインポート
        import_consumables()

        print("\n" + "=" * 60)
        print("[完了] インポート完了")
        print("=" * 60)

    except Exception as e:
        print(f"\n[ERROR] エラーが発生しました: {e}")
        print("\nMySQLが起動していることを確認してください")


if __name__ == "__main__":
    main()

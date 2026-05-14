"""
Excelファイル（消耗品リスト追加.xlsx）からMySQLにインポートするスクリプト
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import openpyxl
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


def load_xlsx(xlsx_path: Path) -> list[dict]:
    """Excelファイルからデータを読み込む"""
    wb = openpyxl.load_workbook(xlsx_path)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    headers = [str(h) if h is not None else "" for h in rows[0]]
    items = []
    for row in rows[1:]:
        if not any(cell is not None for cell in row):
            continue
        items.append(dict(zip(headers, row)))
    return items


def import_consumables(xlsx_path: Path):
    """Excelファイルから消耗品データをインポート"""
    if not xlsx_path.exists():
        print(f"[ERROR] ファイルが見つかりません: {xlsx_path}")
        return

    items = load_xlsx(xlsx_path)
    print(f"[INFO] {len(items)}件のデータを読み込みました")

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            success_count = 0
            skip_count = 0
            skipped_items = []

            for item in items:
                code = item.get("code")
                name = item.get("name")

                # codeもnameもない行はスキップ
                if not code and not name:
                    skip_count += 1
                    continue

                # nameがNoneの場合は空文字に
                if name is None:
                    name = ""

                try:
                    # 既存チェック
                    cursor.execute("SELECT id, name FROM consumables WHERE code = %s", (code,))
                    existing = cursor.fetchone()
                    if existing:
                        skipped_items.append((code, existing["name"] or name))
                        continue

                    cursor.execute(
                        """
                        INSERT INTO consumables (
                            code, order_code, name, category, unit,
                            storage_location, stock_quantity, safety_stock,
                            order_unit, supplier_id, unit_price,
                            order_status, shortage_status,
                            image_path, pdf_path, note
                        ) VALUES (
                            %s, %s, %s, %s, %s,
                            %s, %s, %s,
                            %s, %s, %s,
                            %s, %s,
                            %s, %s, %s
                        )
                        """,
                        (
                            code,
                            item.get("order_code") or None,
                            name,
                            item.get("category") or None,
                            item.get("unit") or None,
                            item.get("storage_location") or None,
                            item.get("stock_quantity") if item.get("stock_quantity") is not None else 0,
                            item.get("safety_stock") if item.get("safety_stock") is not None else 0,
                            item.get("order_unit") or None,
                            item.get("supplier_id") or None,
                            item.get("unit_price") or None,
                            item.get("order_status") or None,
                            item.get("shortage_status") or None,
                            item.get("image_path") or None,
                            item.get("pdf_path") or None,
                            item.get("note") or None,
                        ),
                    )
                    success_count += 1
                    print(f"  [追加] {code} - {name}")
                except Exception as e:
                    print(f"  [WARN] 登録エラー [{code}]: {e}")

            conn.commit()

            if skipped_items:
                print(f"\n[スキップ] 既存のため {len(skipped_items)}件をスキップしました:")
                for s_code, s_name in skipped_items:
                    print(f"  - {s_code} : {s_name}")

            print(f"\n[OK] {success_count}件を新規登録しました（既存スキップ: {len(skipped_items)}件）")

    except Exception as e:
        print(f"[ERROR] インポートエラー: {e}")
        conn.rollback()
    finally:
        conn.close()


def main():
    # スクリプトの2階層上（プロジェクトルート）にあるxlsxを対象とする
    project_root = Path(__file__).parent.parent.parent
    xlsx_path = project_root / "消耗品リスト追加.xlsx"

    # コマンドライン引数でパスを上書き可能
    if len(sys.argv) > 1:
        xlsx_path = Path(sys.argv[1])

    print("=" * 60)
    print("[在庫管理システム] Excelデータを消耗品テーブルにインポート")
    print(f"  対象ファイル: {xlsx_path}")
    print("=" * 60)

    try:
        conn = get_connection()
        print(f"[OK] MySQL接続成功: {DB_CONFIG['host']}:{DB_CONFIG['port']}")
        conn.close()

        import_consumables(xlsx_path)

        print("\n" + "=" * 60)
        print("[完了] インポート完了")
        print("=" * 60)

    except Exception as e:
        print(f"\n[ERROR] エラーが発生しました: {e}")
        print("\nMySQLが起動していることを確認してください")


if __name__ == "__main__":
    main()

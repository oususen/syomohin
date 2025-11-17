"""
データベースとテーブルを作成するセットアップスクリプト
"""
from __future__ import annotations

import os
from pathlib import Path

import pymysql
from dotenv import load_dotenv

# .envファイルを読み込む
BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=False)


def get_root_connection():
    """rootユーザーでMySQL接続（データベース指定なし）"""
    host = os.getenv("INVENTORY_DB_HOST", "localhost")
    user = os.getenv("INVENTORY_DB_USER", "root")
    password = os.getenv("PRIMARY_DB_PASSWORD") or os.getenv("INVENTORY_DB_PASSWORD", "")
    port = int(os.getenv("INVENTORY_DB_PORT", "3306"))

    return pymysql.connect(
        host=host,
        user=user,
        password=password,
        port=port,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


def create_database():
    """データベースを作成"""
    dbname = os.getenv("INVENTORY_DB_NAME", "inventory_db")

    conn = get_root_connection()
    try:
        with conn.cursor() as cursor:
            # データベース作成
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS {dbname} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            print(f"[OK] データベース '{dbname}' を作成しました")

        conn.commit()
    finally:
        conn.close()


def create_tables():
    """テーブルを作成"""
    dbname = os.getenv("INVENTORY_DB_NAME", "inventory_db")
    host = os.getenv("INVENTORY_DB_HOST", "localhost")
    user = os.getenv("INVENTORY_DB_USER", "root")
    password = os.getenv("PRIMARY_DB_PASSWORD") or os.getenv("INVENTORY_DB_PASSWORD", "")
    port = int(os.getenv("INVENTORY_DB_PORT", "3306"))

    conn = pymysql.connect(
        host=host,
        user=user,
        password=password,
        port=port,
        database=dbname,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )

    try:
        with conn.cursor() as cursor:
            # init.sqlファイルを読み込んで実行
            sql_file = BASE_DIR / "init.sql"
            if not sql_file.exists():
                print(f"[ERROR] SQLファイルが見つかりません: {sql_file}")
                return

            with open(sql_file, encoding="utf-8") as f:
                sql_script = f.read()

            # コメント行を削除
            lines = sql_script.split("\n")
            clean_lines = []
            for line in lines:
                # コメント行をスキップ
                if line.strip().startswith("--") or line.strip().startswith("#"):
                    continue
                clean_lines.append(line)

            sql_script = "\n".join(clean_lines)

            # SQLを文ごとに分割して実行
            statements = [s.strip() for s in sql_script.split(";") if s.strip()]

            for statement in statements:
                if statement and len(statement) > 10:  # 短すぎる文は無視
                    try:
                        cursor.execute(statement)
                        # テーブル名を抽出して表示
                        if "CREATE TABLE" in statement.upper():
                            table_name = statement.split("CREATE TABLE")[1].split("(")[0].strip().replace("IF NOT EXISTS", "").strip()
                            print(f"[OK] テーブル作成: {table_name}")
                        else:
                            print(f"[OK] SQL実行: {statement[:50]}...")
                    except Exception as e:
                        # すでにテーブルが存在する場合はスキップ
                        if "already exists" in str(e) or "Table" in str(e) and "doesn't exist" not in str(e):
                            print(f"[SKIP] スキップ: {str(e)[:100]}...")
                        else:
                            print(f"[ERROR] SQL実行エラー: {e}")
                            print(f"   Statement: {statement[:200]}...")

        conn.commit()
        print("\n[OK] 全てのテーブルを作成しました")

    finally:
        conn.close()


def main():
    """メイン処理"""
    print("=" * 60)
    print("[在庫管理システム] - データベースセットアップ")
    print("=" * 60)

    try:
        # 1. データベース作成
        print("\n[ステップ1] データベース作成")
        create_database()

        # 2. テーブル作成
        print("\n[ステップ2] テーブル作成")
        create_tables()

        print("\n" + "=" * 60)
        print("[完了] セットアップ完了")
        print("=" * 60)
        print("\n次のステップ:")
        print("1. JSONデータをインポート:")
        print("   .\\venv\\Scripts\\python import_json_to_mysql.py")
        print("\n2. Flaskアプリを起動:")
        print("   .\\venv\\Scripts\\python app.py")

    except Exception as e:
        print(f"\n[エラー] エラーが発生しました: {e}")
        print("\n確認事項:")
        print("1. MySQLが起動しているか")
        print("2. システム環境変数 PRIMARY_DB_PASSWORD が設定されているか")
        print("3. MySQL root ユーザーでログインできるか")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    main()

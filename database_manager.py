"""
消耗品在庫管理システム用データベースマネージャー
SQLAlchemy + PyMySQL を使用
"""
from __future__ import annotations

import os
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import scoped_session, sessionmaker

# .envファイルを読み込む
BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=False)


class DatabaseManager:
    """SQLAlchemy を使ったデータベース接続管理"""

    def __init__(self):
        # 環境変数から接続情報を取得
        host = os.getenv("INVENTORY_DB_HOST", "localhost")
        user = os.getenv("INVENTORY_DB_USER", "root")
        # PRIMARY_DB_PASSWORD を優先、なければ INVENTORY_DB_PASSWORD
        password = os.getenv("PRIMARY_DB_PASSWORD") or os.getenv("INVENTORY_DB_PASSWORD", "")
        dbname = os.getenv("INVENTORY_DB_NAME", "inventory_db")
        port = int(os.getenv("INVENTORY_DB_PORT", "3306"))

        # MySQL接続URL
        db_url = f"mysql+pymysql://{user}:{password}@{host}:{port}/{dbname}?charset=utf8mb4"
        self.engine = create_engine(db_url, echo=False, future=True)

        # セッションファクトリ（scoped_sessionでスレッドセーフ）
        self.SessionLocal = scoped_session(
            sessionmaker(bind=self.engine, autocommit=False, autoflush=False)
        )

    def get_session(self):
        """新しいセッションを取得"""
        return self.SessionLocal()

    def close(self):
        """セッションと接続を閉じる"""
        self.SessionLocal.remove()
        self.engine.dispose()

    def execute_query(self, query: str, params=None) -> pd.DataFrame:
        """
        SELECTクエリを実行してDataFrameを返す

        Args:
            query: SQL文字列
            params: パラメータ（辞書、リスト、またはタプル）

        Returns:
            pd.DataFrame: 結果のDataFrame
        """
        session = self.get_session()

        try:
            if params:
                result = session.execute(text(query), params)
            else:
                result = session.execute(text(query))

            # 結果をDataFrameに変換
            rows = result.fetchall()

            if rows:
                columns = result.keys()
                df = pd.DataFrame(rows, columns=columns)
            else:
                df = pd.DataFrame()

            return df

        except Exception as e:
            print(f"❌ クエリ実行エラー: {e}")
            print(f"Query: {query}")
            print(f"Params: {params}")
            import traceback

            traceback.print_exc()
            return pd.DataFrame()

        finally:
            session.close()

    def execute_update(self, query: str, params=None) -> int:
        """
        INSERT/UPDATE/DELETEを実行

        Args:
            query: SQL文字列
            params: パラメータ（辞書、リスト、またはタプル）

        Returns:
            int: 影響を受けた行数
        """
        session = self.get_session()

        try:
            if params:
                result = session.execute(text(query), params)
            else:
                result = session.execute(text(query))

            session.commit()
            return result.rowcount

        except Exception as e:
            session.rollback()
            print(f"❌ 更新エラー: {e}")
            print(f"Query: {query}")
            print(f"Params: {params}")
            import traceback

            traceback.print_exc()
            return 0

        finally:
            session.close()

    def test_connection(self) -> bool:
        """データベース接続をテスト"""
        try:
            session = self.get_session()
            session.execute(text("SELECT 1"))
            session.close()
            return True
        except Exception as e:
            print(f"❌ 接続エラー: {e}")
            return False


# シングルトンインスタンス
_db_manager = None


def get_db_manager() -> DatabaseManager:
    """DatabaseManagerのシングルトンインスタンスを取得"""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager()
    return _db_manager


if __name__ == "__main__":
    # テスト実行
    print("=" * 60)
    print("📦 データベース接続テスト")
    print("=" * 60)

    db = DatabaseManager()

    if db.test_connection():
        print("✅ MySQL接続成功")

        # テーブル一覧を取得
        df = db.execute_query("SHOW TABLES")
        print(f"\n📋 テーブル数: {len(df)}")
        if not df.empty:
            print("\nテーブル一覧:")
            print(df)
    else:
        print("❌ MySQL接続失敗")
        print("\n確認事項:")
        print("1. MySQLが起動しているか")
        print("2. システム環境変数 PRIMARY_DB_PASSWORD が設定されているか")
        print("3. データベース inventory_db が作成されているか")

    db.close()

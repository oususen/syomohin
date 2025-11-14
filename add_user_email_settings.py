"""
usersテーブルにメール送信設定用のカラムを追加
"""
from database_manager import get_db_manager

def add_user_email_settings():
    db = get_db_manager()

    try:
        print("メール送信設定用のカラムを追加中...")

        # smtp_host カラムを追加
        try:
            db.execute_update("""
                ALTER TABLE users
                ADD COLUMN smtp_host VARCHAR(255) DEFAULT 'smtp.gmail.com' COMMENT 'SMTPサーバー'
            """)
            print("[OK] smtp_host カラムを追加しました")
        except Exception as e:
            if "Duplicate column" in str(e):
                print("[INFO] smtp_host カラムは既に存在します")
            else:
                raise

        # smtp_port カラムを追加
        try:
            db.execute_update("""
                ALTER TABLE users
                ADD COLUMN smtp_port INT DEFAULT 587 COMMENT 'SMTPポート'
            """)
            print("[OK] smtp_port カラムを追加しました")
        except Exception as e:
            if "Duplicate column" in str(e):
                print("[INFO] smtp_port カラムは既に存在します")
            else:
                raise

        # smtp_user カラムを追加
        try:
            db.execute_update("""
                ALTER TABLE users
                ADD COLUMN smtp_user VARCHAR(255) COMMENT 'SMTP認証ユーザー名'
            """)
            print("[OK] smtp_user カラムを追加しました")
        except Exception as e:
            if "Duplicate column" in str(e):
                print("[INFO] smtp_user カラムは既に存在します")
            else:
                raise

        # smtp_password カラムを追加
        try:
            db.execute_update("""
                ALTER TABLE users
                ADD COLUMN smtp_password VARCHAR(255) COMMENT 'SMTP認証パスワード'
            """)
            print("[OK] smtp_password カラムを追加しました")
        except Exception as e:
            if "Duplicate column" in str(e):
                print("[INFO] smtp_password カラムは既に存在します")
            else:
                raise

        print("\n" + "=" * 60)
        print("カラム追加完了")
        print("=" * 60)

        # テーブル構造を確認
        result = db.execute_query("DESCRIBE users")
        print("\n更新後のusersテーブル構造:")
        print("=" * 80)
        for _, row in result.iterrows():
            print(f"  {row['Field']}: {row['Type']} ({row['Null']})")

    except Exception as e:
        print(f"\nERROR - {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    add_user_email_settings()

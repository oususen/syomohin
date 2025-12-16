# クイックスタートガイド

本番PCでアプリケーションを素早く起動するための簡易ガイドです。

## 最短手順（Docker Compose使用）

### 1. ファイルの準備

プロジェクトディレクトリを本番PCに配置します。

```bash
cd /app/syomohin
```

### 2. 環境変数ファイルの作成

```bash
cp .env.example .env
nano .env  # または vi .env
```

必要な設定を記述:

```env
# データベース設定（本番PC環境に合わせる）
DB_HOST=localhost
DB_PORT=5432
DB_NAME=syomohin_db
DB_USER=syomohin_user
DB_PASSWORD=your_password

# メール設定
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Flask設定
SECRET_KEY=your-secret-key-here
```

### 3. 起動

```bash
# ビルドと起動（初回）
docker-compose up -d --build

# ログ確認
docker-compose logs -f
```

### 4. アクセス

ブラウザで以下にアクセス:

```
http://本番PCのIPアドレス:8504
```

## よく使うコマンド

```bash
# 起動
docker-compose up -d

# 停止
docker-compose down

# 再起動
docker-compose restart

# ログ確認
docker-compose logs -f

# 状態確認
docker-compose ps

# アプリケーション更新時（再ビルド）
docker-compose up -d --build
```

## トラブルシューティング

### ポート8504が使用できない場合

`docker-compose.yml` を編集してポートを変更:

```yaml
ports:
  - "8505:8504"  # ホスト側を8505に変更
```

### コンテナが起動しない場合

```bash
# エラーログを確認
docker-compose logs

# コンテナ内で確認
docker-compose exec app /bin/bash
```

### データベース接続エラー

- `.env` ファイルのデータベース設定を確認
- データベースが起動しているか確認
- ホスト名（localhost や IPアドレス）が正しいか確認

---

詳細は [本番環境移行手順.md](./本番環境移行手順.md) を参照してください。

# 📦 消耗品在庫管理システム

PowerApps版をFlask + JavaScriptで再現した在庫管理Webアプリケーションです。

## 機能一覧

### 1. 📦 在庫一覧
- QRコードスキャン機能（スマホの裏カメラ対応）
- 品名検索
- 注文状態フィルター
- 欠品状態フィルター
- 在庫カード表示（画像、在庫数、安全在庫、購入先など）

### 2. 📤 出庫
- QRコードスキャンで商品検索
- 出庫数量入力
- 出庫者名入力
- 備考入力
- 出庫確定機能

### 3. 📥 入庫
#### 手動入庫
- QRコードスキャンで商品検索
- 入庫数量入力
- 入庫者名入力
- 入庫確定機能

#### 自動依頼分
- 自動発注された商品の入庫処理
- 発注済み商品一覧表示

### 4. 📝 注文依頼
- QRコードスキャンで商品検索
- 注文数量入力
- 納期選択（最短/通常/余裕あり）
- 発注依頼者名入力
- 備考入力
- 注文依頼送信機能

### 5. 📋 発注依頼状態リスト
#### 人からの依頼
- 手動で依頼された発注一覧
- 発注状態確認

#### 自動依頼分
- システムが自動で依頼した発注一覧
- 発注状態確認

## 技術スタック

- **バックエンド**: Flask (Python)
- **フロントエンド**: HTML5 + CSS3 + JavaScript
- **QR読み取り**: OpenCV (cv2.QRCodeDetector)
- **カメラAPI**: getUserMedia (裏カメラ対応)
- **通信**: HTTPS (SSL証明書使用)
- **データ**: JSON形式 (data/consumables.json)

## インストール方法

### 1. 仮想環境のセットアップ

```bash
# 仮想環境作成（初回のみ）
python -m venv venv

# 仮想環境の有効化
.\venv\Scripts\activate  # Windows
source venv/bin/activate  # Mac/Linux
```

### 2. 依存パッケージのインストール

```bash
pip install flask flask-cors opencv-python-headless pandas pillow numpy
```

### 3. SSL証明書の配置

以下の証明書ファイルを `.streamlit` フォルダに配置してください：
- `cert.pem` (SSL証明書)
- `key.pem` (秘密鍵)

証明書がない場合は、HTTPモードで起動します。

## サーバーの起動方法

### 方法1: 通常起動

```bash
python app.py
```

### 方法2: 仮想環境のPythonで起動

```bash
.\venv\Scripts\python app.py  # Windows
./venv/bin/python app.py      # Mac/Linux
```

起動すると以下のように表示されます：

```
* Running on https://0.0.0.0:8501
* Running on https://10.0.1.194:8501
```

## アクセス方法

### PCからアクセス

ブラウザで以下のURLにアクセス：
```
https://localhost:8501
```

または

```
https://[あなたのPCのIPアドレス]:8501
```

### スマホからアクセス

1. PCと同じWi-Fiネットワークに接続
2. ブラウザで以下のURLにアクセス：
```
https://[PCのIPアドレス]:8501
```

例: `https://10.0.1.194:8501`

3. 証明書の警告が表示される場合
   - Chrome/Safari: 「詳細設定」→「このサイトにアクセスする」
   - Firefox: 「危険性を承知で続行」

## QRコードスキャン機能の使い方

1. 各画面の「📷 QRスキャン」ボタンをタップ
2. カメラ使用許可を求められたら「許可」をタップ
3. スマホの場合、自動的に裏カメラが起動します
4. QRコードを画面中央に合わせる
5. 「📸 撮影」ボタンをタップ
6. QRコードが読み取られ、自動的に検索されます

## API エンドポイント

### GET /api/inventory
在庫データを取得

**クエリパラメータ:**
- `qr_code`: QRコード検索
- `search_text`: 品名検索
- `order_status`: 注文状態フィルター
- `shortage_status`: 欠品状態フィルター

**レスポンス:**
```json
{
  "success": true,
  "data": [...],
  "total": 100,
  "filtered": 10
}
```

### POST /api/decode-qr
QRコードを解析

**リクエストボディ:**
```json
{
  "image": "data:image/png;base64,..."
}
```

**レスポンス:**
```json
{
  "success": true,
  "data": "QRコードの内容"
}
```

### GET /api/filter-options
フィルター選択肢を取得

**レスポンス:**
```json
{
  "success": true,
  "order_status": ["すべて", "未発注", "発注済み", ...],
  "shortage_status": ["すべて", "在庫あり", "要補充", ...]
}
```

## ディレクトリ構造

```
syomohin/
├── app.py                      # Flaskアプリケーション
├── inventory_app_flet.py       # Flet版（参考用）
├── data/
│   └── consumables.json        # 在庫データ
├── templates/
│   └── index.html              # メインHTMLテンプレート
├── static/
│   ├── css/
│   │   └── style.css           # スタイルシート
│   └── js/
│       └── app.js              # JavaScriptロジック
├── .streamlit/
│   ├── cert.pem                # SSL証明書
│   ├── key.pem                 # 秘密鍵
│   └── config.toml             # 設定ファイル
└── venv/                       # 仮想環境
```

## トラブルシューティング

### カメラが起動しない

- HTTPSでアクセスしていることを確認してください（カメラAPIはHTTPSが必須）
- ブラウザのカメラ権限を確認してください
- プライベートモード/シークレットモードの場合は解除してください

### スマホからアクセスできない

- PCとスマホが同じWi-Fiに接続されているか確認
- ファイアウォールで8501ポートが開いているか確認
- PCのIPアドレスが正しいか確認（`ipconfig`コマンドで確認）

### QRコードが読み取れない

- 照明が十分か確認
- QRコードが画面中央に収まっているか確認
- カメラのフォーカスが合っているか確認
- QRコードが鮮明であるか確認

### 証明書エラーが出る

- 自己署名証明書を使用している場合は警告が表示されます
- ブラウザで「詳細設定」→「続行」を選択してください
- 本番環境では正式な証明書の使用を推奨します

### サーバーが起動しない

```bash
# ポート8501が使用中の場合
netstat -ano | findstr :8501  # Windows
lsof -i :8501                 # Mac/Linux

# プロセスを終了してから再起動
```

## 開発者向け情報

### データ構造

`data/consumables.json` の各レコード:

```json
{
  "コード": "ABC123",
  "発注コード": "ORD456",
  "品名": "ボールペン",
  "カテゴリ": "文房具",
  "在庫数": 50,
  "安全在庫": 20,
  "単位": "本",
  "購入先": "株式会社〇〇",
  "注文状態": "未発注",
  "欠品状態": "在庫あり",
  "画像URL": "https://example.com/image.jpg"
}
```

### カスタマイズ

- **ポート変更**: `app.py` の `port=8501` を変更
- **カラーテーマ**: `static/css/style.css` の `#009688` (ティール) を変更
- **フィルター項目追加**: `templates/index.html` にフィールド追加 + `static/js/app.js` に処理追加

## ライセンス

このプロジェクトは個人使用・商用利用ともに自由に使用できます。

## サポート

問題が発生した場合は、以下を確認してください：
1. このREADMEのトラブルシューティングセクション
2. ブラウザのコンソールログ（F12キー）
3. サーバーのターミナル出力

---

**Version**: 1.0.0
**Last Updated**: 2025-11-11
## CSVインポートで新規登録

- `? 新規登録` ページ最下部の「CSVインポート」から `static/samples/consumables_template.csv` をベースにしたファイルを選択し「CSVを取り込む」を押すと `/api/consumables/import-csv` に送信されます。
- 必須列は `code` と `name`。任意で `category`, `unit`, `stock_quantity`, `safety_stock`, `unit_price`, `order_unit`, `supplier_name`(または `supplier_id`), `storage_location`, `note`, `order_status`, `shortage_status` を指定できます。
- 既存コードは自動的にスキップされ、登録/スキップ/エラー件数がトーストに表示されます。詳細はブラウザのコンソールログにも出力されます。
- サンプルCSVは `https://<ホスト>:8501/download/consumables-template` からダウンロードできます。UTF-8 BOM 付きで配信しているため Excel でも文字化けせず開けます。ネットワークや証明書の都合で取得できない場合でも、ボタンを押すとクライアント側で同じ内容を UTF-8 BOM 付きで自動生成して保存します。

### API での利用

```
POST /api/consumables/import-csv
Content-Type: multipart/form-data
file=<CSV ファイル>
```

`200 OK` 時は `summary.inserted` / `summary.skipped` / `summary.errors` を含むJSONが返ります。`4xx` の場合は `error` に原因が入ります。

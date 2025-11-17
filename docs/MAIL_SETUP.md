# メール送信機能の設定方法

## 概要
注文書をメールで送信するための設定手順です。

## 設定方法の選択

以下の2つの方法から選択できます：

### 方法1: Windows環境変数（推奨）
- **メリット**: PC全体で利用可能、管理しやすい
- **デメリット**: 管理者権限が必要
- **用途**: 本番サーバー、個人PC

### 方法2: .envファイル
- **メリット**: 管理者権限不要、プロジェクト単位で設定
- **デメリット**: プロジェクトごとに設定が必要
- **用途**: 開発環境、複数プロジェクト

---

## 方法1: Windows環境変数で設定（推奨）

### 自動設定（推奨）

1. **setup_env.cmd を管理者権限で実行**
   - `setup_env.cmd`を右クリック → 「管理者として実行」
   - 画面の指示に従ってメール設定を入力

2. **設定の確認**
   ```bash
   check_env.cmd
   ```

3. **アプリケーションを再起動**

### 手動設定

コマンドプロンプトを管理者権限で開いて、以下のコマンドを実行：

```cmd
setx SMTP_HOST "smtp.gmail.com" /M
setx SMTP_PORT "587" /M
setx SMTP_USER "your-email@gmail.com" /M
setx SMTP_PASSWORD "your-app-password" /M
setx FROM_EMAIL "your-email@gmail.com" /M
setx FROM_NAME "ダイソウ工業株式会社" /M
```

### 環境変数の削除

設定を削除する場合：
```bash
# 管理者権限で実行
remove_env.cmd
```

---

## 方法2: .envファイルで設定

### 1. `.env`ファイルの作成

`.env.example`ファイルを`.env`にコピーまたはリネームします：

```bash
copy .env.example .env
```

### 2. メール設定の入力

`.env`ファイルを開いて、以下の情報を入力します：

```env
# SMTPサーバー設定
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

# SMTP認証情報
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# 送信元メールアドレスと名前
FROM_EMAIL=your-email@gmail.com
FROM_NAME=ダイソウ工業株式会社
```

---

## Gmail を使用する場合

### 1. Googleアカウントでアプリパスワードを生成

1. [Googleアカウント管理](https://myaccount.google.com/)にアクセス
2. 「セキュリティ」をクリック
3. 「2段階認証プロセス」を有効にする（まだの場合）
4. 「アプリパスワード」をクリック
5. 「アプリを選択」→「その他（名前を入力）」→「消耗品管理システム」と入力
6. 「生成」をクリック
7. 表示された16文字のパスワードをコピー

### 2. `.env`ファイルに設定

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=生成した16文字のアプリパスワード
FROM_EMAIL=your-email@gmail.com
FROM_NAME=ダイソウ工業株式会社
```

## その他のメールサービスを使用する場合

### Outlook/Hotmail

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASSWORD=your-password
```

### Yahoo Mail

```env
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_USER=your-email@yahoo.co.jp
SMTP_PASSWORD=your-app-password
```

### 自社メールサーバー

```env
SMTP_HOST=mail.your-company.com
SMTP_PORT=587
SMTP_USER=your-username
SMTP_PASSWORD=your-password
```

## トラブルシューティング

### メール送信エラーが発生する場合

1. **SMTP設定を確認**
   - `.env`ファイルの`SMTP_USER`と`SMTP_PASSWORD`が正しいか確認
   - Gmailの場合、アプリパスワードを使用しているか確認

2. **2段階認証を確認**
   - Gmailの場合、2段階認証が有効になっているか確認

3. **ファイアウォール設定を確認**
   - ポート587（または465）が開いているか確認

4. **エラーメッセージを確認**
   - ブラウザの開発者ツールでエラーメッセージを確認
   - サーバーのログを確認

### よくあるエラー

#### `SMTP設定が不完全です`
→ `.env`ファイルに`SMTP_USER`と`SMTP_PASSWORD`が設定されているか確認

#### `Authentication failed`
→ メールアドレスまたはパスワードが間違っています。Gmailの場合はアプリパスワードを使用してください。

#### `Connection timed out`
→ ファイアウォールまたはネットワーク設定を確認してください。

## セキュリティに関する注意事項

- `.env`ファイルは`.gitignore`に追加されているため、Gitにコミットされません
- `.env`ファイルは他人と共有しないでください
- アプリパスワードは定期的に変更することを推奨します
- 本番環境では、環境変数を直接設定することを推奨します

## メール本文のカスタマイズ

メール本文を変更したい場合は、`email_sender.py`の`_create_email_body`メソッドを編集してください。

## 参考リンク

- [Gmail アプリパスワードの生成方法](https://support.google.com/accounts/answer/185833)
- [Google 2段階認証プロセス](https://support.google.com/accounts/answer/185839)

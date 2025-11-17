@echo off
chcp 65001 > nul
echo =====================================
echo メール送信機能 - 環境変数設定
echo =====================================
echo.

REM 管理者権限チェック
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [エラー] このスクリプトは管理者権限で実行する必要があります。
    echo.
    echo 右クリック → 「管理者として実行」で実行してください。
    echo.
    pause
    exit /b 1
)

echo このスクリプトはメール送信に必要な環境変数を設定します。
echo.
echo 以下の情報を入力してください：
echo.

REM SMTP設定
set /p SMTP_HOST="SMTPホスト (例: smtp.gmail.com): "
if "%SMTP_HOST%"=="" set SMTP_HOST=smtp.gmail.com

set /p SMTP_PORT="SMTPポート (例: 587): "
if "%SMTP_PORT%"=="" set SMTP_PORT=587

echo.
REM SMTP認証情報
set /p SMTP_USER="メールアドレス (例: your-email@gmail.com): "
if "%SMTP_USER%"=="" (
    echo [エラー] メールアドレスは必須です。
    pause
    exit /b 1
)

set /p SMTP_PASSWORD="パスワード/アプリパスワード: "
if "%SMTP_PASSWORD%"=="" (
    echo [エラー] パスワードは必須です。
    pause
    exit /b 1
)

echo.
REM 送信元情報
set /p FROM_EMAIL="送信元メールアドレス (空白でSMTP_USERと同じ): "
if "%FROM_EMAIL%"=="" set FROM_EMAIL=%SMTP_USER%

set /p FROM_NAME="送信元名前 (デフォルト: ダイソウ工業株式会社): "
if "%FROM_NAME%"=="" set FROM_NAME=ダイソウ工業株式会社

echo.
echo =====================================
echo 設定内容の確認
echo =====================================
echo SMTP_HOST     : %SMTP_HOST%
echo SMTP_PORT     : %SMTP_PORT%
echo SMTP_USER     : %SMTP_USER%
echo SMTP_PASSWORD : ********
echo FROM_EMAIL    : %FROM_EMAIL%
echo FROM_NAME     : %FROM_NAME%
echo =====================================
echo.

set /p CONFIRM="この内容で設定しますか？ (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo キャンセルしました。
    pause
    exit /b 0
)

echo.
echo 環境変数を設定中...

REM システム環境変数として設定（永続的）
setx SMTP_HOST "%SMTP_HOST%" /M >nul 2>&1
if %errorLevel% neq 0 (
    echo [警告] SMTP_HOST の設定に失敗しました。
) else (
    echo [OK] SMTP_HOST を設定しました。
)

setx SMTP_PORT "%SMTP_PORT%" /M >nul 2>&1
if %errorLevel% neq 0 (
    echo [警告] SMTP_PORT の設定に失敗しました。
) else (
    echo [OK] SMTP_PORT を設定しました。
)

setx SMTP_USER "%SMTP_USER%" /M >nul 2>&1
if %errorLevel% neq 0 (
    echo [警告] SMTP_USER の設定に失敗しました。
) else (
    echo [OK] SMTP_USER を設定しました。
)

setx SMTP_PASSWORD "%SMTP_PASSWORD%" /M >nul 2>&1
if %errorLevel% neq 0 (
    echo [警告] SMTP_PASSWORD の設定に失敗しました。
) else (
    echo [OK] SMTP_PASSWORD を設定しました。
)

setx FROM_EMAIL "%FROM_EMAIL%" /M >nul 2>&1
if %errorLevel% neq 0 (
    echo [警告] FROM_EMAIL の設定に失敗しました。
) else (
    echo [OK] FROM_EMAIL を設定しました。
)

setx FROM_NAME "%FROM_NAME%" /M >nul 2>&1
if %errorLevel% neq 0 (
    echo [警告] FROM_NAME の設定に失敗しました。
) else (
    echo [OK] FROM_NAME を設定しました。
)

echo.
echo =====================================
echo 設定完了
echo =====================================
echo.
echo 環境変数の設定が完了しました。
echo.
echo [重要] 設定を反映するには以下を実行してください：
echo   1. コマンドプロンプトを閉じる
echo   2. Flaskアプリケーションを再起動する
echo.
pause

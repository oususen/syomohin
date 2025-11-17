@echo off
chcp 65001 > nul
echo =====================================
echo メール送信機能 - 環境変数削除
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

echo このスクリプトはメール送信に関する環境変数を削除します。
echo.

set /p CONFIRM="本当に削除しますか？ (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo キャンセルしました。
    pause
    exit /b 0
)

echo.
echo 環境変数を削除中...

REM システム環境変数を削除
reg delete "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v SMTP_HOST /f >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] SMTP_HOST を削除しました。
) else (
    echo [情報] SMTP_HOST は設定されていません。
)

reg delete "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v SMTP_PORT /f >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] SMTP_PORT を削除しました。
) else (
    echo [情報] SMTP_PORT は設定されていません。
)

reg delete "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v SMTP_USER /f >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] SMTP_USER を削除しました。
) else (
    echo [情報] SMTP_USER は設定されていません。
)

reg delete "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v SMTP_PASSWORD /f >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] SMTP_PASSWORD を削除しました。
) else (
    echo [情報] SMTP_PASSWORD は設定されていません。
)

reg delete "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v FROM_EMAIL /f >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] FROM_EMAIL を削除しました。
) else (
    echo [情報] FROM_EMAIL は設定されていません。
)

reg delete "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v FROM_NAME /f >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] FROM_NAME を削除しました。
) else (
    echo [情報] FROM_NAME は設定されていません。
)

echo.
echo =====================================
echo 削除完了
echo =====================================
echo.
echo 環境変数の削除が完了しました。
echo.
echo [重要] 設定を反映するには以下を実行してください：
echo   1. コマンドプロンプトを閉じる
echo   2. Flaskアプリケーションを再起動する
echo.
pause

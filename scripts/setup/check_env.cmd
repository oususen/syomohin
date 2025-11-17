@echo off
chcp 65001 > nul
echo =====================================
echo 環境変数の確認
echo =====================================
echo.

REM 環境変数の存在確認
set FOUND_ERRORS=0

echo [SMTP設定]

if defined SMTP_HOST (
    echo   SMTP_HOST     : %SMTP_HOST%
) else (
    echo   SMTP_HOST     : [未設定]
    set FOUND_ERRORS=1
)

if defined SMTP_PORT (
    echo   SMTP_PORT     : %SMTP_PORT%
) else (
    echo   SMTP_PORT     : [未設定]
    set FOUND_ERRORS=1
)

echo.
echo [認証情報]

if defined SMTP_USER (
    echo   SMTP_USER     : %SMTP_USER%
) else (
    echo   SMTP_USER     : [未設定]
    set FOUND_ERRORS=1
)

if defined SMTP_PASSWORD (
    echo   SMTP_PASSWORD : ******** (設定済み)
) else (
    echo   SMTP_PASSWORD : [未設定]
    set FOUND_ERRORS=1
)

echo.
echo [送信元情報]

if defined FROM_EMAIL (
    echo   FROM_EMAIL    : %FROM_EMAIL%
) else (
    echo   FROM_EMAIL    : [未設定]
    set FOUND_ERRORS=1
)

if defined FROM_NAME (
    echo   FROM_NAME     : %FROM_NAME%
) else (
    echo   FROM_NAME     : [未設定]
    set FOUND_ERRORS=1
)

echo.
echo =====================================

if %FOUND_ERRORS% equ 1 (
    echo [警告] 一部の環境変数が未設定です。
    echo.
    echo setup_env.cmd を管理者権限で実行して設定してください。
) else (
    echo [OK] すべての環境変数が設定されています。
)

echo =====================================
echo.
pause

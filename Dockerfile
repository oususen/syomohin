# 消耗品管理システム Dockerfile
FROM python:3.13-slim

# 作業ディレクトリを設定
WORKDIR /app

# システムパッケージの更新と必要なパッケージのインストール
# 日本語フォントも追加
RUN apt-get update && apt-get install -y \
    libglx-mesa0 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    fonts-ipafont-gothic \
    fonts-takao-gothic \
    && rm -rf /var/lib/apt/lists/*

# requirements.txtをコピーして依存関係をインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# フォントディレクトリを作成し、フォントファイルをコピー（ディレクトリが存在する場合のみ）
# `COPY`はソースが存在しないとエラーになるため、`RUN`と`cp`で対応
RUN mkdir -p /usr/share/fonts/truetype/custom
RUN if [ -d "static/fonts" ] && [ -n "$(ls -A static/fonts)" ]; then cp -r static/fonts/. /usr/share/fonts/truetype/custom/; fi

# アプリケーションファイルをコピー
COPY . .

# 必要なディレクトリを作成
RUN mkdir -p uploads/images uploads/pdfs static/samples data

# ポート8504を公開
EXPOSE 8504

# 環境変数を設定（本番環境では.envファイルまたはDocker環境変数で上書き）
ENV PYTHONUNBUFFERED=1
ENV FLASK_APP=app.py

# アプリケーションを起動
CMD ["python", "app.py"]

# 消耗品管理システム Dockerfile
FROM python:3.13-slim

# 作業ディレクトリを設定
WORKDIR /app

# システムパッケージの更新と必要なパッケージのインストール
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# requirements.txtをコピーして依存関係をインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションファイルをコピー
COPY . .

# 必要なディレクトリを作成
RUN mkdir -p uploads/images uploads/pdfs static/samples data

# ポート8504を公開
EXPOSE 8504

# 環境変数を設定（本番環境では.envファイルまたはDocker環境変数で上書き）
ENV PYTHONUNBUFFERED=1
ENV FLASK_APP=app.py

# アプリケーションを起動（本番向けWSGI）
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:8504", "app:app"]

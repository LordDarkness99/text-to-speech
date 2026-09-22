#!/bin/bash
# ==============================================================================
# SpeechT5 LJSpeech Studio - Launcher Script
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=========================================================="
echo "🎙️  SpeechT5 LJSpeech Text-to-Speech Studio"
echo "=========================================================="

# Check if .venv exists
if [ ! -d ".venv" ]; then
    echo "⚙️  Membuat virtual environment Python 3.11..."
    python3.11 -m venv .venv
    .venv/bin/pip install --upgrade pip
    .venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
    .venv/bin/pip install sentencepiece
    .venv/bin/pip install -r requirements.txt
fi

source .venv/bin/activate

# Check if model directory exists
if [ ! -d "model_speecht5_ljspeech" ]; then
    echo "❌ Error: Direktori model_speecht5_ljspeech tidak ditemukan di $DIR"
    exit 1
fi

PORT=${PORT:-8000}
HOST=${HOST:-"0.0.0.0"}

echo "🚀 Menjalankan Server SpeechT5 Studio..."
echo "🌐 Buka browser di: http://localhost:$PORT"
echo "📖 Swagger API Docs: http://localhost:$PORT/docs"
echo "Tekan Ctrl + C untuk menghentikan server."
echo "=========================================================="

exec uvicorn backend.main:app --host "$HOST" --port "$PORT"

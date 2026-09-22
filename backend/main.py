import os
import base64
from typing import Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.tts_engine import TTSEngine, VOICE_PRESETS

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")
ASSET_DIR = os.path.join(BASE_DIR, "asset")

# Request / Response Schemas
class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000, description="Teks yang akan disintesis menjadi suara")
    voice_preset: str = Field(default="ljspeech_default", description="ID preset suara")
    custom_seed: Optional[int] = Field(default=None, description="Custom seed untuk speaker embedding")
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="Kecepatan pelafalan suara")
    return_format: str = Field(default="json", description="'json' (dengan base64 & waveform) atau 'wav' (file binary)")

class SynthesizeResponse(BaseModel):
    success: bool
    audio_base64: str
    duration: float
    generation_time: float
    sample_rate: int
    char_count: int
    waveform_envelope: list
    preset: str
    speed: float

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Background initialization / pre-load
    print("[Server] Memulai server TTS SpeechT5...")
    engine = TTSEngine()
    # Lazy load on first request or preload if desired
    yield
    print("[Server] Mematikan server TTS.")

app = FastAPI(
    title="SpeechT5 LJSpeech Studio",
    description="API & Web Studio untuk Model Fine-Tuned SpeechT5 Text-to-Speech",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def get_health():
    engine = TTSEngine()
    return {
        "status": "online",
        "model_loaded": engine.is_loaded,
        "device": engine.device
    }

@app.get("/api/voices")
def get_voices():
    return {
        "presets": list(VOICE_PRESETS.values())
    }

@app.get("/api/model-info")
def get_model_info():
    engine = TTSEngine()
    return engine.get_info()

@app.get("/api/metrics")
def get_metrics():
    """Return fine-tuning metrics from notebook evaluation and asset chart paths."""
    return {
        "training": {
            "dataset": "LJSpeech-1.1 (13,100 rekaman audio wanita)",
            "total_steps": 4000,
            "batch_size": "4 x 8 gradient accumulation (effective batch 32)",
            "learning_rate": "1e-5 with 100 warmup steps",
            "optimizer": "AdamW + FP16 mixed precision",
            "final_checkpoint": "checkpoint-4000"
        },
        "evaluation": {
            "asr_evaluator": "OpenAI Whisper Tiny",
            "wer_score": "6.8%",
            "pronunciation_accuracy": "93.2%",
            "latency_avg_cpu": "~1.5s - 3s per sentence",
            "target_audio_sample_rate": "16,000 Hz (16 kHz PCM)"
        },
        "assets": [
            {
                "id": "loss_curve",
                "title": "Kurva Pembelajaran (Loss Curve)",
                "description": "Perkembangan nilai loss selama 4.000 langkah pelatihan Seq2SeqTrainer.",
                "url": "/asset/kurvaPembelajaran.png"
            },
            {
                "id": "mel_spectrogram",
                "title": "Mel-Spectrogram Target vs Prediksi",
                "description": "Visualisasi frekuensi akustik mel-spectrogram 80 bins.",
                "url": "/asset/mel-spectrogram.png"
            },
            {
                "id": "waveform",
                "title": "Gelombang Audio (Amplitudo vs Waktu)",
                "description": "Bentuk gelombang suara hasil sintesis vocoder HiFi-GAN.",
                "url": "/asset/wavefrom(amplitudo-volume-terhadap-waktu).png"
            },
            {
                "id": "dataset_dist",
                "title": "Distribusi Durasi Dataset LJSpeech",
                "description": "Histogram durasi rekaman audio dan panjang teks pada dataset LJSpeech.",
                "url": "/asset/distribusi.png"
            }
        ]
    }

@app.post("/api/synthesize")
def synthesize(req: SynthesizeRequest):
    engine = TTSEngine()
    try:
        result = engine.synthesize(
            text=req.text,
            voice_preset=req.voice_preset,
            custom_seed=req.custom_seed,
            speed=req.speed
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if req.return_format == "wav":
        return Response(
            content=result["wav_bytes"],
            media_type="audio/wav",
            headers={
                "Content-Disposition": f"attachment; filename=speecht5_{result['preset']}.wav"
            }
        )

    # Base64 for instant HTML5 Audio playback
    b64_audio = base64.b64encode(result["wav_bytes"]).decode("utf-8")
    return {
        "success": True,
        "audio_base64": f"data:audio/wav;base64,{b64_audio}",
        "duration": result["duration"],
        "generation_time": result["generation_time"],
        "sample_rate": result["sample_rate"],
        "char_count": result["char_count"],
        "waveform_envelope": result["waveform_envelope"],
        "preset": result["preset"],
        "speed": result["speed"]
    }

# Mount static files and assets
if os.path.exists(ASSET_DIR):
    app.mount("/asset", StaticFiles(directory=ASSET_DIR), name="asset")

if os.path.exists(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)

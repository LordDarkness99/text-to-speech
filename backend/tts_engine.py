import os
import io
import time
import torch
import numpy as np
import soundfile as sf
from typing import Optional, Dict, Any, Tuple
from transformers import SpeechT5Processor, SpeechT5ForTextToSpeech, SpeechT5HifiGan

DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "model_speecht5_ljspeech")

# Voice presets with curated random seeds for reproducible unique voice identities
VOICE_PRESETS = {
    "ljspeech_default": {
        "id": "ljspeech_default",
        "name": "LJSpeech Classic",
        "gender": "Female",
        "description": "Suara asli model fine-tuned LJSpeech (Linda Johnson) - jelas, alami, dan jernih.",
        "seed": 42,
        "avatar": "🎙️",
        "tag": "Rekomendasi"
    },
    "narrator_deep": {
        "id": "narrator_deep",
        "name": "Deep Narrator",
        "gender": "Male",
        "description": "Karakter suara narator dengan intonasi mantap dan berwibawa.",
        "seed": 105,
        "avatar": "📻",
        "tag": "Narasi"
    },
    "storyteller_warm": {
        "id": "storyteller_warm",
        "name": "Warm Storyteller",
        "gender": "Female / Soft",
        "description": "Intonasi lembut, hangat, dan ekspresif cocok untuk buku audio dan dongeng.",
        "seed": 777,
        "avatar": "📖",
        "tag": "Audiobook"
    },
    "studio_crystal": {
        "id": "studio_crystal",
        "name": "Studio Crystal",
        "gender": "Neutral / Crisp",
        "description": "Pelafalan artikulatif dan formal untuk dokumentasi teknis & presentasi.",
        "seed": 1337,
        "avatar": "🎧",
        "tag": "Formal"
    },
    "dynamic_conversational": {
        "id": "dynamic_conversational",
        "name": "Dynamic Pulse",
        "gender": "Dynamic",
        "description": "Gaya percakapan modern dengan ritme yang luwes.",
        "seed": 8888,
        "avatar": "⚡",
        "tag": "Kasual"
    },
    "custom": {
        "id": "custom",
        "name": "Custom Voice Seed",
        "gender": "Custom",
        "description": "Eksplorasi ribuan variasi suara unik dengan menentukan angka seed sendiri.",
        "seed": None,
        "avatar": "🎲",
        "tag": "Kreatif"
    }
}


class TTSEngine:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(TTSEngine, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, model_path: str = DEFAULT_MODEL_PATH):
        if self._initialized:
            return

        self.model_path = model_path
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.sample_rate = 16000

        self.processor = None
        self.model = None
        self.vocoder = None
        self.is_loaded = False
        self.load_error = None
        self._initialized = True

    def load_model(self):
        """Load fine-tuned model, processor, and neural vocoder into memory."""
        if self.is_loaded:
            return

        print(f"[TTSEngine] Memuat model dari: {self.model_path}")
        print(f"[TTSEngine] Menggunakan perangkat: {self.device}")
        start_time = time.time()

        try:
            # 1. Processor
            print("[TTSEngine] Memuat SpeechT5Processor (microsoft/speecht5_tts)...")
            self.processor = SpeechT5Processor.from_pretrained("microsoft/speecht5_tts")

            # 2. Vocoder
            print("[TTSEngine] Memuat SpeechT5HifiGan (microsoft/speecht5_hifigan)...")
            self.vocoder = SpeechT5HifiGan.from_pretrained("microsoft/speecht5_hifigan").to(self.device)

            # 3. Model Fine-Tuned
            print(f"[TTSEngine] Memuat SpeechT5ForTextToSpeech dari {self.model_path}...")
            self.model = SpeechT5ForTextToSpeech.from_pretrained(self.model_path).to(self.device)
            self.model.eval()

            self.is_loaded = True
            elapsed = time.time() - start_time
            print(f"[TTSEngine] Model berhasil dimuat dalam {elapsed:.2f} detik!")

        except Exception as e:
            self.load_error = str(e)
            print(f"[TTSEngine] Gagal memuat model: {e}")
            raise e

    def get_speaker_embedding(self, preset_id: str = "ljspeech_default", custom_seed: Optional[int] = None) -> torch.Tensor:
        """Generate a 512-dim synthetic speaker embedding tensor based on preset or seed."""
        if preset_id == "custom" and custom_seed is not None:
            seed = int(custom_seed)
        elif preset_id in VOICE_PRESETS and VOICE_PRESETS[preset_id]["seed"] is not None:
            seed = VOICE_PRESETS[preset_id]["seed"]
        else:
            seed = 42

        # Create reproducible pseudo-random speaker embedding
        rng = torch.Generator()
        rng.manual_seed(seed)
        speaker_embedding = torch.randn(1, 512, generator=rng, dtype=torch.float32).to(self.device)
        return speaker_embedding

    def synthesize(
        self,
        text: str,
        voice_preset: str = "ljspeech_default",
        custom_seed: Optional[int] = None,
        speed: float = 1.0
    ) -> Dict[str, Any]:
        """
        Synthesize input text into 16kHz speech waveform.
        Returns audio bytes, duration, waveform envelope, and timing stats.
        """
        if not self.is_loaded:
            self.load_model()

        clean_text = text.strip()
        if not clean_text:
            raise ValueError("Teks tidak boleh kosong.")

        start_time = time.time()

        # 1. Tokenize & Process text
        inputs = self.processor(text=clean_text, return_tensors="pt")
        input_ids = inputs["input_ids"].to(self.device)

        # 2. Get Speaker Embedding
        speaker_embeddings = self.get_speaker_embedding(voice_preset, custom_seed)

        # 3. Model Inference
        with torch.no_grad():
            speech = self.model.generate_speech(
                input_ids,
                speaker_embeddings,
                vocoder=self.vocoder
            )

        audio_array = speech.cpu().numpy()

        # 4. Optional Speed Adjustment (Time-stretch via linear interpolation if speed != 1.0)
        target_sr = self.sample_rate
        if speed != 1.0 and 0.5 <= speed <= 2.0:
            indices = np.round(np.arange(0, len(audio_array), speed))
            indices = indices[indices < len(audio_array)].astype(int)
            audio_array = audio_array[indices]

        # Normalize audio to prevent clipping
        max_val = np.max(np.abs(audio_array))
        if max_val > 0:
            audio_array = audio_array / max_val * 0.95

        # 5. Encode to WAV buffer
        wav_io = io.BytesIO()
        sf.write(wav_io, audio_array, target_sr, format="WAV", subtype="PCM_16")
        wav_bytes = wav_io.getvalue()

        elapsed_time = round(time.time() - start_time, 2)
        audio_duration = round(len(audio_array) / target_sr, 2)

        # Calculate lightweight downsampled waveform envelope (100 points) for instant UI rendering
        envelope = self._extract_envelope(audio_array, num_points=100)

        return {
            "wav_bytes": wav_bytes,
            "sample_rate": target_sr,
            "duration": audio_duration,
            "generation_time": elapsed_time,
            "char_count": len(clean_text),
            "waveform_envelope": envelope,
            "preset": voice_preset,
            "speed": speed
        }

    def _extract_envelope(self, audio_array: np.ndarray, num_points: int = 100) -> list:
        """Extract a smooth normalized waveform envelope array for frontend UI visualization."""
        if len(audio_array) == 0:
            return [0.1] * num_points

        chunk_size = max(1, len(audio_array) // num_points)
        envelope = []
        for i in range(num_points):
            start = i * chunk_size
            end = min(len(audio_array), (i + 1) * chunk_size)
            if start >= len(audio_array):
                envelope.append(0.05)
            else:
                chunk = audio_array[start:end]
                peak = float(np.max(np.abs(chunk))) if len(chunk) > 0 else 0.05
                envelope.append(round(peak, 3))

        max_peak = max(envelope) if envelope and max(envelope) > 0 else 1.0
        return [round(v / max_peak, 2) for v in envelope]

    def get_info(self) -> Dict[str, Any]:
        """Return model metadata and specifications."""
        return {
            "model_name": "SpeechT5 LJSpeech Fine-Tuned",
            "base_model": "microsoft/speecht5_tts",
            "vocoder": "microsoft/speecht5_hifigan",
            "architecture": "SpeechT5ForTextToSpeech (Seq2Seq + Prenet/Postnet)",
            "checkpoint": "checkpoint-4000 (Step 4,000 / Final)",
            "dataset": "LJSpeech-1.1 (English Single Speaker - Linda Johnson)",
            "hidden_size": 768,
            "encoder_layers": 12,
            "decoder_layers": 6,
            "speaker_embedding_dim": 512,
            "sample_rate": self.sample_rate,
            "device": self.device,
            "status": "ready" if self.is_loaded else "standby"
        }

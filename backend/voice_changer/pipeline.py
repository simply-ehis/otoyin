"""Voice-changer pipeline: mic → VAD → denoise → transcribe → synthesize → enhance.

Pure processing layer — no server or protocol concerns. Each stage is optional
and degrades gracefully if its backend is unavailable.
"""

import contextlib
import io
import logging
import os
import tempfile
import wave
from dataclasses import dataclass, field

import numpy as np

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000

# One-shot warnings: a missing ONNX stack must surface once per process so
# the UI/skills can say "download required" instead of silently passing raw
# audio through.
_warned_missing_denoise = False
_warned_missing_enhance = False


@dataclass
class PipelineConfig:
    """Per-session voice-changer configuration."""

    target_voice: str = "default"
    tts_engine: str = "kokoro"
    denoise: bool = True
    enhance: bool = True
    language: str = "en"
    vad_threshold: float = 0.5
    min_speech_ms: int = 300
    max_silence_ms: int = 800


@dataclass
class PipelineState:
    """Mutable state carried across chunks within one session."""

    audio_buffer: list[float] = field(default_factory=list)
    speech_frames: int = 0
    silence_frames: int = 0
    is_speech: bool = False


class VoiceChangerPipeline:
    """Stateless-ish processor: given config + state + raw audio, return converted audio.

    The pipeline is synchronous and CPU-bound; callers should run it in a thread.
    """

    def __init__(self, config: PipelineConfig | None = None) -> None:
        self.config = config or PipelineConfig()
        self._vad = None
        self._stt = None
        self._streaming_lavasr = None

    # ------------------------------------------------------------------
    # Lazy singletons
    # ------------------------------------------------------------------

    def _get_vad(self):
        if self._vad is None:
            from backend.services.vad import get_vad

            self._vad = get_vad()
        return self._vad

    def _get_stt(self):
        if self._stt is None:
            from backend.backends.registry import get_stt_backend

            self._stt = get_stt_backend()
        return self._stt

    def _get_streaming_lavasr(self):
        if self._streaming_lavasr is None:
            from backend.services.streaming_lavasr import StreamingLavaSR

            self._streaming_lavasr = StreamingLavaSR(
                window_sec=2.5,
                overlap=0.25,
                input_sr=SAMPLE_RATE,
            )
        return self._streaming_lavasr

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_chunk(
        self,
        audio: list[float] | np.ndarray,
        state: PipelineState,
    ) -> tuple[list[float] | None, dict]:
        """Process one incoming audio chunk.

        Returns
        -------
        output_audio : list[float] | None
            Converted audio samples (16 kHz float32) or None if still buffering.
        info : dict
            Status dict with keys: speech_started, speech_ended, transcript.
        """
        if isinstance(audio, list):
            audio = np.array(audio, dtype=np.float32)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)

        info: dict = {"speech_started": False, "speech_ended": False, "transcript": ""}

        # --- VAD ---
        vad = self._get_vad()
        vad_result = vad.detect(audio)
        is_speech_now = vad_result.get("is_speech", False)

        if is_speech_now and not state.is_speech:
            state.is_speech = True
            state.speech_frames = 0
            state.silence_frames = 0
            info["speech_started"] = True

        if state.is_speech:
            state.speech_frames += 1
            state.audio_buffer.extend(audio.tolist())

        if not is_speech_now and state.is_speech:
            state.silence_frames += 1
            # Derive the silence budget from the actual chunk duration
            # (callers stream variable-size chunks; a fixed 32 ms assumption
            # mis-sizes the threshold).
            chunk_ms = (len(audio) / SAMPLE_RATE) * 1000 if len(audio) else 32
            silence_threshold = max(1, int(self.config.max_silence_ms / chunk_ms))
            if state.silence_frames >= silence_threshold:
                state.is_speech = False
                info["speech_ended"] = True
                output = self._convert_segment(state.audio_buffer)
                state.audio_buffer.clear()
                state.speech_frames = 0
                state.silence_frames = 0
                return output, info

        return None, info

    def force_flush(self, state: PipelineState) -> tuple[list[float] | None, dict]:
        """Force-process whatever is in the buffer (e.g. on session end)."""
        info: dict = {"speech_started": False, "speech_ended": True, "transcript": ""}
        if not state.audio_buffer:
            return None, info
        output = self._convert_segment(state.audio_buffer)
        state.audio_buffer.clear()
        state.speech_frames = 0
        state.silence_frames = 0
        state.is_speech = False
        return output, info

    # ------------------------------------------------------------------
    # Internal conversion chain
    # ------------------------------------------------------------------

    def _convert_segment(self, raw_samples: list[float]) -> list[float]:
        """Full chain: denoise → transcribe → synthesize → enhance."""
        audio = np.array(raw_samples, dtype=np.float32)
        sr = SAMPLE_RATE

        # 1. Denoise (DeepFilterNet ONNX)
        if self.config.denoise:
            audio = self._denoise(audio, sr)

        # 2. Transcribe (Whisper)
        text = self._transcribe(audio, sr)
        if not text or not text.strip():
            logger.debug("Empty transcript — skipping synthesis")
            return []
        logger.debug("Transcript: %s", text)

        # 3. Synthesize (kokoro TTS)
        synth_audio, synth_sr = self._synthesize(text)
        if synth_audio is None or len(synth_audio) == 0:
            logger.debug("Synthesis produced no audio")
            return []

        # 4. Enhance (LavaSR bandwidth extension)
        if self.config.enhance:
            synth_audio, synth_sr = self._enhance(synth_audio, synth_sr)

        return synth_audio.tolist()

    def _denoise(self, audio: np.ndarray, sr: int) -> np.ndarray:
        global _warned_missing_denoise
        try:
            from backend.services.noise_reduction import is_onnx_available, reduce_noise_deepfilternet

            if not is_onnx_available():
                if not _warned_missing_denoise:
                    _warned_missing_denoise = True
                    logger.warning("DeepFilterNet ONNX runtime unavailable — denoise skipped (download required)")
                return audio
            return reduce_noise_deepfilternet(audio, sr)
        except Exception as exc:
            logger.debug("Denoise failed, continuing raw: %s", exc)
            return audio

    def _transcribe(self, audio: np.ndarray, sr: int) -> str:
        # delete=False + explicit unlink: NamedTemporaryFile(delete=True) is
        # re-opened by path below, which the Windows file lock rejects.
        tmp_path = None
        try:
            stt = self._get_stt()
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_path = tmp.name
                with wave.open(tmp_path, "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(sr)
                    pcm = (audio * 32767).astype(np.int16)
                    wf.writeframes(pcm.tobytes())
            result = stt.transcribe(tmp_path, language=self.config.language)
            if isinstance(result, dict):
                return result.get("text", "")
            return str(result)
        except Exception as exc:
            logger.debug("Transcribe failed: %s", exc)
            return ""
        finally:
            if tmp_path:
                with contextlib.suppress(OSError):
                    os.unlink(tmp_path)

    def _synthesize(self, text: str) -> tuple[np.ndarray | None, int]:
        try:
            import asyncio

            from backend.backends.registry import get_tts_backend_for_engine

            tts = get_tts_backend_for_engine(self.config.tts_engine)
            if tts is None:
                logger.debug("TTS engine %s not available", self.config.tts_engine)
                return None, SAMPLE_RATE

            # TTSBackend.generate() is async; the pipeline runs in a thread
            # (via run_in_executor), so create a thread-local event loop to
            # drive the coroutine.
            voice_prompt: dict = {
                "preset_voice_id": self.config.target_voice,
                "kokoro_voice": self.config.target_voice,
            }
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None
            if loop and loop.is_running():
                # Already inside an event loop (shouldn't happen in a thread,
                # but guard anyway) — fall back to a new loop in a new thread.
                import concurrent.futures

                with concurrent.futures.ThreadPoolExecutor(1) as pool:
                    result = pool.submit(
                        asyncio.run,
                        tts.generate(text, voice_prompt=voice_prompt),
                    ).result()
            else:
                result = asyncio.run(tts.generate(text, voice_prompt=voice_prompt))

            if isinstance(result, tuple):
                return result
            if isinstance(result, np.ndarray):
                return result, SAMPLE_RATE
            if isinstance(result, bytes):
                with wave.open(io.BytesIO(result), "rb") as wf:
                    frames = wf.readframes(wf.getnframes())
                    audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32767.0
                    return audio, wf.getframerate()
            return None, SAMPLE_RATE
        except Exception as exc:
            logger.debug("Synthesize failed: %s", exc)
            return None, SAMPLE_RATE

    def _enhance(self, audio: np.ndarray, sr: int) -> tuple[np.ndarray, int]:
        """Upscale to 48 kHz using StreamingLavaSR with overlap-add."""
        global _warned_missing_enhance
        try:
            lavasr = self._get_streaming_lavasr()
            enhanced = lavasr.process(audio)
            # Also drain any residual
            final = lavasr.flush()
            if len(enhanced) > 0 and len(final) > 0:
                enhanced = np.concatenate([enhanced, final])
            elif len(final) > 0:
                enhanced = final
            if len(enhanced) > 0:
                return enhanced, lavasr.output_sr
        except Exception as exc:
            if not _warned_missing_enhance:
                _warned_missing_enhance = True
                logger.warning("StreamingLavaSR unavailable — enhance degraded (download required): %s", exc)
            else:
                logger.debug("StreamingLavaSR failed (%s); trying batch enhance", exc)

        # Fallback to batch enhance
        try:
            from backend.services.audio_enhancer import EnhanceMode, enhance_audio

            return enhance_audio(audio, sr, EnhanceMode.LAVASR)
        except Exception as exc:
            logger.debug("Batch enhance also failed: %s — returning as-is", exc)
            return audio, sr

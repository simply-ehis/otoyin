"""
Speech-to-Speech voice chat service.

Implements a real-time voice agent pipeline: VAD -> STT -> LLM -> TTS.
Inspired by HuggingFace's speech-to-speech architecture.

Upgrades over original:
- Silero VAD v5 for accurate turn-taking
- Streaming TTS for low-latency output
- Barge-in support (cancel playback on new speech)
- Tool calling through voice
"""

import asyncio
import base64
import contextlib
import io
import logging
import os
import tempfile
import time
import uuid
from collections import deque
from dataclasses import dataclass, field

import numpy as np
import soundfile as sf

from ..backends import get_llm_backend, get_stt_backend, get_tts_backend
from .observability import (
    get_global_metrics,
    get_session_metrics,
    record_llm,
    record_stt,
    record_tts,
    reset_session_metrics,
)

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000
ENERGY_THRESHOLD = 0.02
SILENCE_FRAMES_TRIGGER = 10
MIN_SPEECH_FRAMES = 5


class MissingModelError(Exception):
    """Raised when a session needs a model the user has not downloaded.

    Carries the recommended pack so callers can offer a download instead of
    dying silently mid-turn (no-default-model policy).
    """

    def __init__(self, message: str, recommended: list[dict] | None = None):
        super().__init__(message)
        self.recommended = recommended or []


@dataclass
class VoiceChatSession:
    session_id: str
    conversation_id: str | None = None
    language: str = "en"
    system_prompt: str = (
        "You are a helpful voice assistant for an audio studio application. "
        "Keep responses concise and conversational. "
        "You can help with audio editing, effects, mixing, and more."
    )
    stt_model: str = "base"
    tts_engine: str | None = None
    tts_voice_prompt: dict | None = None
    audio_buffer: deque = field(default_factory=lambda: deque(maxlen=MAX_AUDIO_BUFFER_SAMPLES))
    silence_count: int = 0
    speech_frame_count: int = 0
    is_speaking: bool = False
    conversation_history: list[dict] = field(default_factory=list)
    last_activity: float = field(default_factory=time.time)
    is_processing: bool = False
    is_playing_audio: bool = False
    playback_task: asyncio.Task | None = None
    enable_tools: bool = True
    tool_confirmation_future: asyncio.Future | None = None
    tool_confirmation_info: dict | None = None


MAX_AUDIO_BUFFER_SECONDS = 30
MAX_AUDIO_BUFFER_SAMPLES = MAX_AUDIO_BUFFER_SECONDS * SAMPLE_RATE
MAX_CONVERSATION_HISTORY = 100
SESSION_TTL_SECONDS = 600  # 10 minutes idle before eviction

# How long a pending tool confirmation waits for the user before defaulting to
# "denied". Module-level (not inline) so tests can shrink it — a 30s real wait
# blows the suite timeout and leaves a pending future on the loop.
TOOL_CONFIRMATION_TIMEOUT_S = 30.0


_sessions: dict[str, VoiceChatSession] = {}


def _evict_stale_sessions() -> None:
    """Remove sessions idle longer than SESSION_TTL_SECONDS."""
    now = time.time()
    stale = [sid for sid, s in _sessions.items() if now - s.last_activity > SESSION_TTL_SECONDS]
    for sid in stale:
        session = _sessions.pop(sid, None)
        if session and session.playback_task:
            session.playback_task.cancel()
        logger.info("Evicted stale voice chat session %s", sid)


def _compute_energy(audio_chunk: list[float]) -> float:
    arr = np.array(audio_chunk, dtype=np.float32)
    if len(arr) == 0:
        return 0.0
    return float(np.sqrt(np.mean(arr**2)))


async def _transcribe_audio(audio: deque | list, session: VoiceChatSession) -> str:
    """Transcribe audio buffer to text using STT backend."""
    buf = np.array(audio, dtype=np.float32)
    if len(buf) == 0:
        return ""

    with tempfile.NamedTemporaryFile(suffix=".wav", dir=tempfile.gettempdir(), delete=False) as tmp:
        tmp_path = tmp.name
    try:
        sf.write(tmp_path, buf, SAMPLE_RATE)

        metrics = get_session_metrics(session.session_id)
        t0 = time.perf_counter()
        try:
            stt = get_stt_backend()
            text = await stt.transcribe(tmp_path, session.language, session.stt_model)
            elapsed = (time.perf_counter() - t0) * 1000
            record_stt(metrics, True, elapsed)
            return text.strip() if text else ""
        except Exception as e:
            elapsed = (time.perf_counter() - t0) * 1000
            record_stt(metrics, False, elapsed)
            logger.warning("STT failed for session %s: %s", session.session_id, e)
            return ""
    finally:
        with contextlib.suppress(OSError):
            os.unlink(tmp_path)


def _get_voice_chat_tools() -> list[dict]:
    """Get tools available to the voice chat agent from the canonical tool list."""
    try:
        from ..routes.assistant_tools.schemas import TOOLS

        # Filter to voice-relevant tools (skip destructive/file-system tools)
        voice_safe_prefixes = (
            "21labs.generate",
            "21labs.speak",
            "21labs.get_",
            "21labs.list_",
            "21labs.search_",
            "21labs.apply_",
            "21labs.set_",
            "21labs.normalize",
            "21labs.analyze",
            "21labs.play",
            "21labs.stop",
            "21labs.transcribe",
            "21labs.describe",
        )
        voice_tools = []
        for tool in TOOLS:
            func = tool.get("function", {})
            name = func.get("name", "")
            if any(name.startswith(p) for p in voice_safe_prefixes):
                voice_tools.append(tool)
        return voice_tools if voice_tools else TOOLS[:20]
    except Exception as e:
        logger.debug("Failed to load canonical tools: %s", e)
        return []


_DESTRUCTIVE_TOOLS = frozenset(
    {
        "21labs.delete_audio",
        "21labs.remove_track",
        "21labs.clear_history",
        "21labs.reset_settings",
        "21labs.export_project",
        "21labs.apply_preset",
        "21labs.delete_preset",
        "21labs.delete_capture",
    }
)

_REQUIRES_CONFIRM_TOOLS = frozenset(
    {
        "21labs.apply_effect",
        "21labs.normalize_audio",
        "21labs.set_volume",
        "21labs.apply_preset",
        "21labs.export_audio",
    }
)


_RETRYABLE_ERRORS = frozenset(
    {
        "file not found",
        "permission denied",
        "no such file",
        "connection refused",
        "timeout",
        "temporary failure",
    }
)

_MAX_RETRIES = 2


async def _execute_tool_call(
    tool_name: str,
    tool_args: dict,
    session: VoiceChatSession,
) -> str:
    """Execute a tool call with retry/skip logic for recoverable errors.

    Destructive tools return a confirmation prompt instead of executing.
    Recoverable errors (file not found, permission denied, etc.) are retried
    once before returning a skip message to the LLM.
    """
    if tool_name in _DESTRUCTIVE_TOOLS:
        confirmed = await _request_tool_confirmation(
            session,
            tool_name,
            tool_args,
            "This action is destructive and cannot be undone.",
        )
        if not confirmed:
            return "Tool execution denied by user."

    elif tool_name in _REQUIRES_CONFIRM_TOOLS:
        desc = " ".join(f"{k}={v}" for k, v in tool_args.items())
        confirmed = await _request_tool_confirmation(
            session,
            tool_name,
            tool_args,
            f"Confirm: {tool_name}({desc})",
        )
        if not confirmed:
            return "Tool execution denied by user."

    last_error = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            from .. import config
            from ..routes.assistant_tools.execution import execute_tool

            result = await execute_tool(tool_name, tool_args, base_url=config.get_server_base_url())
            return result
        except Exception as e:
            last_error = e
            error_str = str(e).lower()
            is_retryable = any(r in error_str for r in _RETRYABLE_ERRORS)

            if is_retryable and attempt < _MAX_RETRIES:
                logger.info(
                    "Retryable tool error (attempt %d/%d) for %s: %s",
                    attempt + 1,
                    _MAX_RETRIES,
                    tool_name,
                    e,
                )
                await asyncio.sleep(0.5 * (attempt + 1))
                continue

            break

    error_msg = str(last_error) if last_error else "Unknown error"
    logger.warning("Tool execution failed for %s: %s", tool_name, error_msg)

    return f"Tool '{tool_name}' failed: {error_msg}. Skip this step and continue with what you can do."


async def _request_tool_confirmation(
    session: VoiceChatSession,
    tool_name: str,
    tool_args: dict,
    reason: str,
) -> bool:
    """Request user confirmation for a tool call.

    Waits up to ``TOOL_CONFIRMATION_TIMEOUT_S`` for a response; on expiry the
    call is treated as **denied** (fail-closed — an unanswered prompt must never
    auto-approve a tool).
    """
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    session.tool_confirmation_future = future
    session.tool_confirmation_info = {
        "tool_name": tool_name,
        "tool_args": tool_args,
        "reason": reason,
    }

    try:
        result = await asyncio.wait_for(future, timeout=TOOL_CONFIRMATION_TIMEOUT_S)
        return result
    except TimeoutError:
        logger.info("Tool confirmation timed out for %s", tool_name)
        return False
    finally:
        session.tool_confirmation_future = None
        session.tool_confirmation_info = None


def resolve_tool_confirmation(session: VoiceChatSession, confirmed: bool) -> None:
    """Resolve a pending tool confirmation future."""
    if session.tool_confirmation_future and not session.tool_confirmation_future.done():
        session.tool_confirmation_future.set_result(confirmed)


async def _generate_llm_response(text: str, session: VoiceChatSession) -> str:
    """Generate LLM response from transcribed text, with optional tool calling."""
    session.conversation_history.append({"role": "user", "content": text})

    # Persist user message to memory
    if session.conversation_id:
        try:
            from .memory import add_message

            add_message(session.conversation_id, "user", text)
        except Exception as e:
            logger.debug("Failed to persist user message: %s", e)

    metrics = get_session_metrics(session.session_id)
    t0 = time.perf_counter()
    try:
        llm = get_llm_backend()
        from ..utils.model_lifecycle import lifecycle_manager

        lifecycle_manager.mark_model_used("gguf_llm")

        kwargs = {
            "prompt": text,
            "system": session.system_prompt,
            "max_tokens": 300,
            "temperature": 0.7,
            "chat_messages": session.conversation_history,
        }

        if session.enable_tools:
            kwargs["tools"] = _get_voice_chat_tools()

        response = await llm.generate(**kwargs)

        # Handle tool calls if present
        if hasattr(response, "tool_calls") and response.tool_calls:
            tool_results = []
            for tc in response.tool_calls:
                result = await _execute_tool_call(tc.name, tc.arguments, session)
                tool_results.append({"tool": tc.name, "result": result})

            # Add tool results to conversation and get final response
            session.conversation_history.append(
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {"id": tc.id, "type": "function", "function": {"name": tc.name, "arguments": str(tc.arguments)}}
                        for tc in response.tool_calls
                    ],
                }
            )
            for tc, tr in zip(response.tool_calls, tool_results, strict=False):
                session.conversation_history.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": tr["result"],
                    }
                )

            # Get final response after tool execution
            final_response = await llm.generate(
                prompt="Continue based on the tool results.",
                system=session.system_prompt,
                max_tokens=300,
                temperature=0.7,
                chat_messages=session.conversation_history,
            )
            response_text = final_response.strip() if final_response else "Done."
        else:
            response_text = response.strip() if response else ""

        elapsed = (time.perf_counter() - t0) * 1000
        record_llm(metrics, True, elapsed)

        session.conversation_history.append({"role": "assistant", "content": response_text})

        # Cap history to prevent unbounded growth
        if len(session.conversation_history) > MAX_CONVERSATION_HISTORY:
            session.conversation_history = session.conversation_history[-MAX_CONVERSATION_HISTORY:]

        # Persist assistant response to memory
        if session.conversation_id:
            try:
                from .memory import add_message

                add_message(session.conversation_id, "assistant", response_text)
            except Exception as e:
                logger.debug("Failed to persist assistant response: %s", e)

        return response_text
    except Exception as e:
        elapsed = (time.perf_counter() - t0) * 1000
        record_llm(metrics, False, elapsed)
        logger.warning("LLM failed for session %s: %s", session.session_id, e)
        return "I'm sorry, I couldn't process that."


async def _synthesize_speech(text: str, session: VoiceChatSession) -> bytes:
    """Convert text to speech using TTS backend. Returns WAV bytes."""
    metrics = get_session_metrics(session.session_id)
    t0 = time.perf_counter()
    try:
        tts = get_tts_backend()
        from ..backends import resolve_tts_engine_of
        from ..utils.model_lifecycle import lifecycle_manager

        resolved_engine = resolve_tts_engine_of(tts)
        if resolved_engine:
            lifecycle_manager.mark_model_used(resolved_engine)
        voice_prompt = session.tts_voice_prompt or {}
        audio_array, sr = await tts.generate(
            text=text,
            voice_prompt=voice_prompt,
            language=session.language,
        )

        buffer = io.BytesIO()
        sf.write(buffer, audio_array, sr, format="WAV")
        buffer.seek(0)
        elapsed = (time.perf_counter() - t0) * 1000
        record_tts(metrics, True, elapsed)
        return buffer.read()
    except Exception as e:
        elapsed = (time.perf_counter() - t0) * 1000
        record_tts(metrics, False, elapsed)
        logger.warning("TTS failed for session %s: %s", session.session_id, e)
        return b""


async def _synthesize_speech_streaming(text: str, session: VoiceChatSession):
    """Generate TTS and yield base64-encoded PCM chunks as they're produced.

    Falls back to non-streaming if the backend doesn't support it.
    """
    try:
        tts = get_tts_backend()
        from ..backends import resolve_tts_engine_of
        from ..utils.model_lifecycle import lifecycle_manager

        resolved_engine = resolve_tts_engine_of(tts)
        if resolved_engine:
            lifecycle_manager.mark_model_used(resolved_engine)
        voice_prompt = session.tts_voice_prompt or {}

        # Try streaming first
        if hasattr(tts, "generate_streaming"):
            async for chunk in tts.generate_streaming(
                text=text,
                voice_prompt=voice_prompt,
                language=session.language,
            ):
                # Convert numpy array to base64 PCM
                pcm_bytes = (chunk * 32767).astype(np.int16).tobytes()
                yield base64.b64encode(pcm_bytes).decode("ascii")
        else:
            # Fall back to full generation
            audio_array, sr = await tts.generate(
                text=text,
                voice_prompt=voice_prompt,
                language=session.language,
            )
            # Resample to 16kHz if needed
            if sr != SAMPLE_RATE:
                from scipy.signal import resample as _resample

                audio_array = _resample(audio_array, int(len(audio_array) * SAMPLE_RATE / sr))

            # Split into chunks for streaming simulation
            chunk_size = 4800  # 300ms at 16kHz
            for i in range(0, len(audio_array), chunk_size):
                chunk = audio_array[i : i + chunk_size]
                pcm_bytes = (chunk * 32767).astype(np.int16).tobytes()
                yield base64.b64encode(pcm_bytes).decode("ascii")
                await asyncio.sleep(0.05)  # Simulate streaming delay
    except Exception as e:
        logger.warning("TTS streaming failed for session %s: %s", session.session_id, e)
        yield ""


async def create_session(
    language: str = "en",
    system_prompt: str | None = None,
    stt_model: str = "base",
    tts_engine: str | None = None,
    enable_tools: bool = True,
    conversation_id: str | None = None,
) -> VoiceChatSession:
    """Create a new voice chat session with optional memory persistence.

    TTS resolution follows the no-default-model policy: the requested
    engine is used only if the user has downloaded it; otherwise the first
    downloaded engine wins. With nothing downloaded the session refuses to
    start and raises :class:`MissingModelError` carrying the recommended
    pack, instead of dying silently mid-turn.
    """
    from ..utils.model_status import RECOMMENDED_MODELS, pick_cached_tts_engine

    resolved_engine = pick_cached_tts_engine(tts_engine)
    if resolved_engine is None:
        raise MissingModelError(
            "No voice model is downloaded yet — download one from the Models tab to start talking.",
            recommended=[{"model_name": m["model_name"], "role": m["role"]} for m in RECOMMENDED_MODELS],
        )
    if resolved_engine != tts_engine:
        logger.info("STS: requested TTS %s not downloaded; using downloaded engine %s", tts_engine, resolved_engine)

    session_id = uuid.uuid4().hex[:12]

    # Load persisted settings if available
    try:
        from .memory import get_voice_chat_settings

        settings = get_voice_chat_settings()
        if not system_prompt:
            system_prompt = settings.get("system_prompt") or VoiceChatSession.system_prompt
    except Exception as e:
        logger.debug("Failed to load voice chat settings (using defaults): %s", type(e).__name__)

    # Load or create conversation for memory persistence
    loaded_history = []
    if not conversation_id:
        try:
            from .memory import create_conversation, get_recent_history_for_context

            conv = create_conversation(
                agent_type="voice_chat",
                model_id=stt_model,
                system_prompt=system_prompt,
            )
            conversation_id = conv.id
            loaded_history = get_recent_history_for_context("voice_chat", limit=10)
        except Exception as e:
            logger.debug("Memory init failed, using in-memory only: %s", e)
    else:
        try:
            from .memory import get_history

            loaded_history = get_history(conversation_id, limit=20)
        except Exception as e:
            logger.debug("Failed to load history for %s: %s", conversation_id, e)

    session = VoiceChatSession(
        session_id=session_id,
        conversation_id=conversation_id,
        language=language,
        system_prompt=system_prompt or VoiceChatSession.system_prompt,
        stt_model=stt_model,
        tts_engine=resolved_engine,
        enable_tools=enable_tools,
        conversation_history=loaded_history,
    )
    _evict_stale_sessions()
    _sessions[session_id] = session
    get_global_metrics().sessions_started += 1
    logger.info(
        "Created voice chat session %s (tools=%s, memory=%s)",
        session_id,
        enable_tools,
        bool(loaded_history),
    )
    return session


async def process_audio_chunk(
    session_id: str,
    audio: list[float],
) -> dict:
    """Process an audio chunk from the client.

    Returns:
        dict with keys:
        - "type": "silence" | "processing" | "response" | "barge_in" | "error"
        - "text": transcribed text (if type is "response")
        - "response": LLM response text (if type is "response")
        - "audio": base64-encoded WAV bytes (if type is "response")
        - "audio_chunks": list of base64 PCM chunks for streaming (if type is "response")
    """
    session = _sessions.get(session_id)
    if not session:
        return {"type": "error", "message": "Session not found"}

    session.last_activity = time.time()
    energy = _compute_energy(audio)
    is_loud = energy > ENERGY_THRESHOLD

    # Barge-in: if user starts speaking during playback, cancel it
    if is_loud and session.is_playing_audio and session.playback_task:
        session.playback_task.cancel()
        session.is_playing_audio = False
        session.playback_task = None
        metrics = get_session_metrics(session_id)
        metrics.barge_ins += 1
        logger.info("Barge-in detected for session %s", session_id)

    if is_loud:
        session.silence_count = 0
        session.speech_frame_count += 1
        session.is_speaking = True
    else:
        session.silence_count += 1

    session.audio_buffer.extend(audio)
    # deque auto-evicts from left when maxlen is reached

    # Check if speech ended (silence after speech)
    if session.is_speaking and session.silence_count >= SILENCE_FRAMES_TRIGGER:
        if session.speech_frame_count >= MIN_SPEECH_FRAMES and not session.is_processing:
            session.is_processing = True
            proc_metrics = get_session_metrics(session_id)
            proc_t0 = time.perf_counter()

            try:
                # Transcribe
                text = await asyncio.wait_for(
                    _transcribe_audio(session.audio_buffer, session),
                    timeout=30.0,
                )

                # Reset buffer
                session.audio_buffer.clear()
                session.silence_count = 0
                session.speech_frame_count = 0
                session.is_speaking = False

                if not text:
                    return {"type": "silence"}

                # Generate LLM response
                response_text = await asyncio.wait_for(
                    _generate_llm_response(text, session),
                    timeout=30.0,
                )

                # Synthesize speech (streaming only — no duplicate full WAV)
                audio_chunks = []
                async for chunk in _synthesize_speech_streaming(response_text, session):
                    if chunk:
                        audio_chunks.append(chunk)

                # Assemble full WAV from streaming chunks for backward compat
                audio_bytes = b""
                if audio_chunks:
                    import io as _io

                    import numpy as np
                    import soundfile as sf

                    all_frames = []
                    sample_rate = 24000
                    for chunk_data in audio_chunks:
                        if isinstance(chunk_data, dict):
                            sample_rate = chunk_data.get("sample_rate", sample_rate)
                            frames = chunk_data.get("frames")
                            if frames is not None:
                                all_frames.append(frames)
                        elif isinstance(chunk_data, (bytes, bytearray)):
                            buf = _io.BytesIO(chunk_data)
                            try:
                                data, sr = sf.read(buf)
                                sample_rate = sr
                                all_frames.append(data)
                            except Exception:
                                pass
                    if all_frames:
                        combined = np.concatenate(all_frames) if len(all_frames) > 1 else all_frames[0]
                        buf = _io.BytesIO()
                        sf.write(buf, combined, sample_rate, format="WAV")
                        buf.seek(0)
                        audio_bytes = buf.read()

                proc_elapsed = (time.perf_counter() - proc_t0) * 1000
                proc_metrics.processing_total_ms += proc_elapsed
                proc_metrics.responses_sent += 1

                return {
                    "type": "response",
                    "text": text,
                    "response": response_text,
                    "audio": base64.b64encode(audio_bytes).decode("ascii") if audio_bytes else None,
                    "audio_chunks": audio_chunks if audio_chunks else None,
                }
            except TimeoutError:
                logger.warning("Pipeline timeout for session %s", session_id)
                session.audio_buffer.clear()
                session.silence_count = 0
                session.speech_frame_count = 0
                session.is_speaking = False
                return {"type": "error", "message": "Processing timed out — try speaking again"}
            except Exception as e:
                logger.warning("Pipeline error for session %s: %s", session_id, e)
                session.audio_buffer.clear()
                session.silence_count = 0
                session.speech_frame_count = 0
                session.is_speaking = False
                return {"type": "error", "message": f"Processing failed: {e}"}
            finally:
                session.is_processing = False
        else:
            # Too short, just noise
            session.audio_buffer.clear()
            session.silence_count = 0
            session.speech_frame_count = 0
            session.is_speaking = False

    return {"type": "silence"}


async def end_session(session_id: str) -> None:
    """End a voice chat session."""
    session = _sessions.pop(session_id, None)
    if session:
        if session.playback_task:
            session.playback_task.cancel()
        get_global_metrics().sessions_ended += 1
        reset_session_metrics(session_id)
        logger.info("Ended voice chat session %s", session_id)


def get_session(session_id: str) -> VoiceChatSession | None:
    """Get an active session by ID."""
    return _sessions.get(session_id)


def list_sessions() -> list[dict]:
    """List all active sessions."""
    return [
        {
            "session_id": s.session_id,
            "language": s.language,
            "is_processing": s.is_processing,
            "is_speaking": s.is_speaking,
            "last_activity": s.last_activity,
            "enable_tools": s.enable_tools,
        }
        for s in _sessions.values()
    ]

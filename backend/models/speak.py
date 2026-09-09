"""
Speak request model — REST surface for POST /speak.
"""

from pydantic import BaseModel, Field


class SpeakRequest(BaseModel):
    """Body for POST /speak — non-MCP REST surface that mirrors 21labs.speak."""

    text: str = Field(..., min_length=1, max_length=10000)
    profile: str | None = Field(
        None,
        description="Voice profile name or id. Falls back to per-client binding, then default.",
    )
    engine: str | None = Field(
        None,
        pattern="^(kokoro|fish_speech|fish_speech_s2|zonos_gguf|parler_tts_gguf|styletts2|chattts|f5_tts|pocket_tts|moss_tts_nano|kitten_tts|neutts|neutts_2e|orpheus|qwen3_tts|bark_small|cloud)$",
    )
    personality: bool | None = Field(
        None,
        description="When true and the profile has a personality prompt, the input text is rewritten in-character before TTS. When null, the per-client binding's default_personality flag decides.",
    )
    language: str | None = Field(
        None,
        pattern="^(zh|en|ja|ko|de|fr|ru|pt|es|it|he|ar|da|el|fi|hi|ms|nl|no|pl|sv|sw|tr)$",
    )

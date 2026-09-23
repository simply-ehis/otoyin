"""
LLM request and response models — text generation and personality.
"""

from pydantic import BaseModel, Field

from ..backends.configs.llm import DEFAULT_PLANNER_SIZE, planner_size_pattern


class LLMGenerateRequest(BaseModel):
    """Request model for LLM text generation."""

    prompt: str = Field(..., min_length=1, max_length=50000)
    system: str | None = Field(None, max_length=4000)
    model_size: str | None = Field(default=DEFAULT_PLANNER_SIZE, pattern=planner_size_pattern())
    max_tokens: int = Field(default=512, ge=1, le=4096)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    # Few-shot (user, assistant) pairs prepended as real chat turns.
    # Used by the refinement service to pin tricky rules (imperatives
    # staying imperatives, technical-term punctuation) that small models
    # lose when the examples live inline in the system prompt.
    examples: list[list[str]] | None = Field(default=None, max_length=8)


class LLMGenerateResponse(BaseModel):
    """Response model for LLM text generation."""

    text: str
    model_size: str


# ── Profile personality endpoint ──────────────────────────────────────
# The sole standalone personality endpoint is ``/profiles/{id}/compose``,
# which produces a fresh in-character utterance the UI drops into the
# generate textarea. Rewrite is now reached via ``/generate`` with
# ``personality=true``.


class PersonalityTextResponse(BaseModel):
    """Response returned by the ``/profiles/{id}/compose`` endpoint."""

    text: str
    model_size: str

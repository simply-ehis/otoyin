"""Memory service for agent conversations and long-term facts.

Provides persistence for:
- Conversation history (assistant + voice chat)
- Long-term memory facts (preferences, instructions, context)
- Provider/model settings
"""

import logging
from datetime import UTC, datetime

from ..database.models import (
    AgentMemory,
    Conversation,
    ConversationMessage,
    VoiceChatSettings,
)

logger = logging.getLogger(__name__)

MAX_HISTORY_MESSAGES = 100
MAX_MEMORY_FACTS = 200


def _get_db():
    # Late-binding: SessionLocal is created by init_db() during app startup,
    # after this module is imported at route-registration time.
    from ..database.session import SessionLocal

    return SessionLocal()


# ---------------------------------------------------------------------------
# Conversation persistence
# ---------------------------------------------------------------------------


def create_conversation(
    agent_type: str = "assistant",
    title: str | None = None,
    model_id: str | None = None,
    provider_id: str | None = None,
    system_prompt: str | None = None,
) -> Conversation:
    """Create and persist a new conversation."""
    db = _get_db()
    try:
        conv = Conversation(
            agent_type=agent_type,
            title=title,
            model_id=model_id,
            provider_id=provider_id,
            system_prompt=system_prompt,
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)
        return conv
    finally:
        db.close()


def get_conversation(conversation_id: str) -> Conversation | None:
    """Get a conversation by ID."""
    db = _get_db()
    try:
        return db.query(Conversation).filter(Conversation.id == conversation_id).first()
    finally:
        db.close()


def list_conversations(
    agent_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Conversation]:
    """List conversations, optionally filtered by agent type."""
    db = _get_db()
    try:
        q = db.query(Conversation)
        if agent_type:
            q = q.filter(Conversation.agent_type == agent_type)
        return q.order_by(Conversation.updated_at.desc()).limit(limit).offset(offset).all()
    finally:
        db.close()


def delete_conversation(conversation_id: str) -> bool:
    """Delete a conversation and all its messages."""
    db = _get_db()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conv:
            return False
        db.query(ConversationMessage).filter(ConversationMessage.conversation_id == conversation_id).delete()
        db.delete(conv)
        db.commit()
        return True
    finally:
        db.close()


def add_message(
    conversation_id: str,
    role: str,
    content: str,
    tool_name: str | None = None,
    tool_args: dict | None = None,
    tool_result: str | None = None,
) -> ConversationMessage:
    """Add a message to a conversation."""
    db = _get_db()
    try:
        msg = ConversationMessage(
            conversation_id=conversation_id,
            role=role,
            content=content,
            tool_name=tool_name,
            tool_args=tool_args,
            tool_result=tool_result,
        )
        db.add(msg)

        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if conv:
            conv.message_count = (conv.message_count or 0) + 1
            conv.last_message_at = datetime.now(UTC)

        db.commit()
        db.refresh(msg)
        return msg
    finally:
        db.close()


def get_history(
    conversation_id: str,
    limit: int = MAX_HISTORY_MESSAGES,
) -> list[dict]:
    """Get conversation history as a list of message dicts."""
    db = _get_db()
    try:
        messages = (
            db.query(ConversationMessage)
            .filter(ConversationMessage.conversation_id == conversation_id)
            .order_by(ConversationMessage.created_at.asc())
            .limit(limit)
            .all()
        )
        return [
            {
                "role": m.role,
                "content": m.content,
                **({"tool_name": m.tool_name} if m.tool_name else {}),
                **({"tool_args": m.tool_args} if m.tool_args else {}),
                **({"tool_result": m.tool_result} if m.tool_result else {}),
            }
            for m in messages
        ]
    finally:
        db.close()


def get_recent_history_for_context(
    agent_type: str,
    limit: int = 20,
) -> list[dict]:
    """Get recent messages from the most recent conversation for context injection."""
    db = _get_db()
    try:
        conv = (
            db.query(Conversation)
            .filter(Conversation.agent_type == agent_type)
            .order_by(Conversation.updated_at.desc())
            .first()
        )
        if not conv:
            return []

        messages = (
            db.query(ConversationMessage)
            .filter(ConversationMessage.conversation_id == conv.id)
            .order_by(ConversationMessage.created_at.desc())
            .limit(limit)
            .all()
        )
        messages.reverse()
        return [{"role": m.role, "content": m.content} for m in messages]
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Long-term memory
# ---------------------------------------------------------------------------


def store_memory(
    agent_type: str,
    category: str,
    key: str,
    value: str,
    source_conversation_id: str | None = None,
    confidence: float = 1.0,
) -> AgentMemory:
    """Store or update a long-term memory fact."""
    db = _get_db()
    try:
        existing = (
            db.query(AgentMemory)
            .filter(
                AgentMemory.agent_type == agent_type,
                AgentMemory.key == key,
            )
            .first()
        )
        if existing:
            existing.value = value
            existing.category = category
            existing.confidence = confidence
            existing.is_stale = False
            existing.source_conversation_id = source_conversation_id
            existing.updated_at = datetime.now(UTC)
            db.commit()
            db.refresh(existing)
            return existing

        memory = AgentMemory(
            agent_type=agent_type,
            category=category,
            key=key,
            value=value,
            source_conversation_id=source_conversation_id,
            confidence=confidence,
        )
        db.add(memory)

        count = db.query(AgentMemory).filter(AgentMemory.agent_type == agent_type).count()
        if count > MAX_MEMORY_FACTS:
            stale = (
                db.query(AgentMemory)
                .filter(AgentMemory.agent_type == agent_type, AgentMemory.is_stale)
                .order_by(AgentMemory.updated_at.asc())
                .limit(count - MAX_MEMORY_FACTS)
                .all()
            )
            for m in stale:
                db.delete(m)

        db.commit()
        db.refresh(memory)
        return memory
    finally:
        db.close()


def recall_memory(
    agent_type: str,
    category: str | None = None,
    query: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """Recall memory facts, optionally filtered by category or keyword."""
    db = _get_db()
    try:
        q = db.query(AgentMemory).filter(
            AgentMemory.agent_type == agent_type,
            AgentMemory.is_stale.is_(False),
        )
        if category:
            q = q.filter(AgentMemory.category == category)
        if query:
            q = q.filter(AgentMemory.key.contains(query) | AgentMemory.value.contains(query))
        memories = q.order_by(AgentMemory.confidence.desc()).limit(limit).all()
        return [
            {
                "category": m.category,
                "key": m.key,
                "value": m.value,
                "confidence": m.confidence,
            }
            for m in memories
        ]
    finally:
        db.close()


def forget_memory(memory_id: str) -> bool:
    """Mark a memory as stale (soft delete)."""
    db = _get_db()
    try:
        m = db.query(AgentMemory).filter(AgentMemory.id == memory_id).first()
        if not m:
            return False
        m.is_stale = True
        db.commit()
        return True
    finally:
        db.close()


def build_memory_context(agent_type: str) -> str:
    """Build a context string from memories for injection into system prompts."""
    memories = recall_memory(agent_type, limit=30)
    if not memories:
        return ""

    lines = ["[User Preferences & Facts]"]
    for m in memories:
        lines.append(f"- {m['key']}: {m['value']}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Voice chat settings persistence
# ---------------------------------------------------------------------------


def get_voice_chat_settings() -> dict:
    """Get persisted voice chat settings."""
    from ..utils.secret_store import decrypt_secret

    db = _get_db()
    try:
        settings = db.query(VoiceChatSettings).first()
        if not settings:
            result = {
                "stt_model": "base",
                "tts_engine": "kokoro",
                "language": "en",
                "enable_tools": True,
                "voice_changer_enabled": False,
                "voice_changer_port": 17494,
                "llm_provider": None,
                "llm_model": None,
                "llm_api_key": "",
                "llm_base_url": None,
            }
        else:
            result = {
                "stt_model": settings.stt_model,
                "tts_engine": settings.tts_engine,
                "tts_voice": settings.tts_voice,
                "llm_provider": settings.llm_provider,
                "llm_model": settings.llm_model,
                "llm_api_key": decrypt_secret(settings.llm_api_key or ""),
                "llm_base_url": settings.llm_base_url,
                "language": settings.language,
                "system_prompt": settings.system_prompt,
                "enable_tools": settings.enable_tools,
                "voice_changer_enabled": settings.voice_changer_enabled,
                "voice_changer_port": settings.voice_changer_port,
            }

        # Layer A (model_providers "llm" domain) is the canonical BYOK source.
        # VoiceChatSettings.llm_* columns are only a fallback mirror.
        try:
            from . import model_providers as mp

            llm_row = mp.get_default_provider(db, "llm")
            if llm_row is not None:
                creds = mp.provider_credentials(llm_row)
                result["llm_provider"] = llm_row.name
                result["llm_model"] = creds.get("model") or result.get("llm_model")
                result["llm_api_key"] = creds.get("api_key") or ""
                result["llm_base_url"] = creds.get("base_url") or result.get("llm_base_url")
        except Exception:
            logger.debug("Could not overlay llm provider from model_providers", exc_info=True)

        return result
    finally:
        db.close()


def save_voice_chat_settings(settings: dict) -> None:
    """Persist voice chat settings."""
    from ..utils.secret_store import encrypt_secret

    db = _get_db()
    try:
        existing = db.query(VoiceChatSettings).first()
        if not existing:
            existing = VoiceChatSettings(id=1)
            db.add(existing)

        for field in [
            "stt_model",
            "tts_engine",
            "tts_voice",
            "llm_provider",
            "llm_model",
            "llm_base_url",
            "language",
            "system_prompt",
            "enable_tools",
            "voice_changer_enabled",
            "voice_changer_port",
        ]:
            if field in settings:
                setattr(existing, field, settings[field])

        # Encrypt the API key before storing
        if "llm_api_key" in settings:
            existing.llm_api_key = encrypt_secret(settings["llm_api_key"] or "")

        # Keep the canonical BYOK store (model_providers "llm" domain) in sync
        # so a key set here is also used by /assistant/chat (single source of truth).
        if any(k in settings for k in ("llm_provider", "llm_model", "llm_api_key", "llm_base_url")):
            try:
                from . import model_providers as mp

                existing_provider = mp.get_default_provider(db, "llm")
                patch = {}
                if settings.get("llm_base_url"):
                    patch["base_url"] = settings["llm_base_url"]
                if "llm_model" in settings:
                    patch["model"] = settings["llm_model"]
                if "llm_provider" in settings:
                    patch["name"] = settings["llm_provider"] or "VoiceChat LLM"
                if "llm_api_key" in settings:
                    patch["api_key"] = settings["llm_api_key"]
                if existing_provider is not None:
                    mp.update_provider(db, existing_provider.id, patch)
                else:
                    mp.create_provider(
                        db,
                        domain="llm",
                        name=patch.get("name") or "VoiceChat LLM",
                        base_url=patch.get("base_url", ""),
                        api_key=settings.get("llm_api_key"),
                        model=settings.get("llm_model"),
                        is_default=True,
                    )
            except Exception:
                logger.warning("Failed to sync llm provider to model_providers", exc_info=True)

        existing.updated_at = datetime.now(UTC)
        db.commit()
    finally:
        db.close()

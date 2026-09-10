"""Memory and conversation persistence API endpoints.

Provides endpoints for:
- Conversation CRUD (list, get, create, delete)
- Message history
- Long-term memory (store, recall, forget)
- Voice chat settings persistence
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.memory import (
    add_message,
    build_memory_context,
    create_conversation,
    delete_conversation,
    forget_memory,
    get_conversation,
    get_history,
    get_recent_history_for_context,
    get_voice_chat_settings,
    list_conversations,
    recall_memory,
    save_voice_chat_settings,
    store_memory,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/memory", tags=["memory"])


# ---------------------------------------------------------------------------
# Request/Response models
# ---------------------------------------------------------------------------


class ConversationCreate(BaseModel):
    agent_type: str = "assistant"
    title: str | None = None
    model_id: str | None = None
    provider_id: str | None = None
    system_prompt: str | None = None


class ConversationResponse(BaseModel):
    id: str
    agent_type: str
    title: str | None
    model_id: str | None
    provider_id: str | None
    message_count: int
    is_favorited: bool
    created_at: str | None
    updated_at: str | None


class MessageAdd(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system|tool)$")
    content: str = ""
    tool_name: str | None = None
    tool_args: dict | None = None
    tool_result: str | None = None


class MemoryStore(BaseModel):
    agent_type: str = "assistant"
    category: str = "preference"
    key: str
    value: str
    confidence: float = 1.0


class MemoryResponse(BaseModel):
    id: str
    category: str
    key: str
    value: str
    confidence: float
    is_stale: bool


class VoiceChatSettingsUpdate(BaseModel):
    stt_model: str | None = None
    tts_engine: str | None = None
    tts_voice: str | None = None
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    language: str | None = None
    system_prompt: str | None = None
    enable_tools: bool | None = None
    voice_changer_enabled: bool | None = None
    voice_changer_port: int | None = None


# ---------------------------------------------------------------------------
# Conversation endpoints
# ---------------------------------------------------------------------------


@router.get("/conversations")
def api_list_conversations(
    agent_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """List conversations."""
    try:
        convs = list_conversations(agent_type=agent_type, limit=limit, offset=offset)
    except Exception as exc:
        logger.debug("list_conversations failed", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list conversations: {exc}") from exc
    return [
        ConversationResponse(
            id=c.id,
            agent_type=c.agent_type,
            title=c.title,
            model_id=c.model_id,
            provider_id=c.provider_id,
            message_count=c.message_count or 0,
            is_favorited=c.is_favorited or False,
            created_at=c.created_at.isoformat() if c.created_at else None,
            updated_at=c.updated_at.isoformat() if c.updated_at else None,
        )
        for c in convs
    ]


@router.post("/conversations")
def api_create_conversation(body: ConversationCreate):
    """Create a new conversation."""
    try:
        conv = create_conversation(
            agent_type=body.agent_type,
            title=body.title,
            model_id=body.model_id,
            provider_id=body.provider_id,
            system_prompt=body.system_prompt,
        )
    except Exception as exc:
        logger.debug("create_conversation failed", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create conversation: {exc}") from exc
    return {"id": conv.id, "agent_type": conv.agent_type}


@router.get("/conversations/{conversation_id}")
def api_get_conversation(conversation_id: str):
    """Get a conversation with its messages."""
    try:
        conv = get_conversation(conversation_id)
    except Exception as exc:
        logger.debug("get_conversation failed", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get conversation: {exc}") from exc
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    history = get_history(conversation_id)
    return {
        "id": conv.id,
        "agent_type": conv.agent_type,
        "title": conv.title,
        "model_id": conv.model_id,
        "provider_id": conv.provider_id,
        "message_count": conv.message_count or 0,
        "messages": history,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
    }


@router.delete("/conversations/{conversation_id}")
def api_delete_conversation(conversation_id: str):
    """Delete a conversation."""
    try:
        ok = delete_conversation(conversation_id)
    except Exception as exc:
        logger.debug("delete_conversation failed", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete conversation: {exc}") from exc
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"deleted": True}


@router.post("/conversations/{conversation_id}/messages")
def api_add_message(conversation_id: str, body: MessageAdd):
    """Add a message to a conversation."""
    try:
        conv = get_conversation(conversation_id)
    except Exception as exc:
        logger.debug("get_conversation failed", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get conversation: {exc}") from exc
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    try:
        msg = add_message(
            conversation_id=conversation_id,
            role=body.role,
            content=body.content,
            tool_name=body.tool_name,
            tool_args=body.tool_args,
            tool_result=body.tool_result,
        )
    except Exception as exc:
        logger.debug("add_message failed", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to add message: {exc}") from exc
    return {"id": msg.id, "role": msg.role}


@router.get("/conversations/{conversation_id}/history")
def api_get_history(conversation_id: str, limit: int = 100):
    """Get message history for a conversation."""
    try:
        conv = get_conversation(conversation_id)
    except Exception as exc:
        logger.debug("get_conversation failed", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get conversation: {exc}") from exc
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return get_history(conversation_id, limit=limit)


# ---------------------------------------------------------------------------
# Memory endpoints
# ---------------------------------------------------------------------------


@router.get("/recall")
def api_recall_memory(
    agent_type: str = "assistant",
    category: str | None = None,
    query: str | None = None,
    limit: int = 20,
):
    """Recall memory facts."""
    return recall_memory(agent_type=agent_type, category=category, query=query, limit=limit)


@router.post("/store")
def api_store_memory(body: MemoryStore):
    """Store or update a memory fact."""
    try:
        memory = store_memory(
            agent_type=body.agent_type,
            category=body.category,
            key=body.key,
            value=body.value,
            confidence=body.confidence,
        )
    except Exception as exc:
        logger.debug("store_memory failed", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to store memory: {exc}") from exc
    return {"id": memory.id, "key": memory.key}


@router.delete("/forget/{memory_id}")
def api_forget_memory(memory_id: str):
    """Mark a memory as stale."""
    try:
        ok = forget_memory(memory_id)
    except Exception as exc:
        logger.debug("forget_memory failed", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to forget memory: {exc}") from exc
    if not ok:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"forgotten": True}


@router.get("/context/{agent_type}")
def api_get_memory_context(agent_type: str):
    """Get memory context string for injection into system prompts."""
    return {"context": build_memory_context(agent_type)}


# ---------------------------------------------------------------------------
# Recent history for context
# ---------------------------------------------------------------------------


@router.get("/recent-history/{agent_type}")
def api_get_recent_history(agent_type: str, limit: int = 20):
    """Get recent messages from the last conversation for context."""
    return get_recent_history_for_context(agent_type, limit=limit)


# ---------------------------------------------------------------------------
# Voice chat settings
# ---------------------------------------------------------------------------


@router.get("/voice-chat-settings")
def api_get_voice_chat_settings():
    """Get persisted voice chat settings."""
    return get_voice_chat_settings()


@router.post("/voice-chat-settings")
def api_save_voice_chat_settings(body: VoiceChatSettingsUpdate):
    """Persist voice chat settings."""
    try:
        settings = {k: v for k, v in body.model_dump().items() if v is not None}
        save_voice_chat_settings(settings)
    except Exception as exc:
        logger.debug("save_voice_chat_settings failed", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {exc}") from exc
    return {"saved": True}

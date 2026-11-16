"""Coding-agent discovery and ACP session endpoints.

Otoyin is the ACP client: each session spawns a hidden coding-agent CLI,
keeps its process handle in memory, and persists the conversation in the
same ``conversations`` table the in-app assistant uses. That keeps one
history surface for both agents.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..database.conversation import Conversation, ConversationMessage
from ..services import acp_client, coding_agents as agents

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/coding-agents", tags=["coding-agents"])

_REGISTRY_URL = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json"


class CreateSessionRequest(BaseModel):
    agent_id: str
    cwd: str | None = None
    title: str | None = None
    # Explicit argv for user-defined ACP agents; overrides registry lookup.
    command: list[str] | None = None


class CustomAgentRequest(BaseModel):
    name: str
    command: list[str]


class PromptRequest(BaseModel):
    text: str


def _session_dict(row: Conversation) -> dict[str, Any]:
    return {
        "id": row.id,
        "agent_id": row.provider_id,
        "title": row.title,
        "status": row.acp_status or "idle",
        "cwd": row.acp_cwd,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "message_count": row.message_count or 0,
        "live": acp_client.get(row.id) is not None,
    }


def _text_chunk(params: dict[str, Any]) -> str | None:
    """Extract assistant text from an ACP ``session/update`` payload.

    The variant lives under ``params.update`` — reading it off ``params``
    directly silently drops every reply.
    """
    update = params.get("update") or {}
    if update.get("sessionUpdate") != "agent_message_chunk":
        return None
    content = update.get("content") or {}
    if isinstance(content, dict) and content.get("type") == "text":
        return str(content.get("text") or "")
    return None


def _message_dict(row: ConversationMessage) -> dict[str, Any]:
    return {
        "id": row.id,
        "role": row.role,
        "content": row.content,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _default_cwd() -> str:
    """A safe workspace inside Otoyin's own data directory."""
    workspace = config.get_data_dir() / "coding-agents"
    workspace.mkdir(parents=True, exist_ok=True)
    return str(workspace.resolve())


def _get_conversation(db: Session, conversation_id: str) -> Conversation:
    row = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.agent_type == "coding_agent",
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Coding session not found")
    return row


def _resolve_argv(argv: list[str]) -> list[str]:
    """Resolve argv[0] to an executable path (Windows npm shims need .cmd)."""
    command = [str(part) for part in argv if str(part)]
    if not command:
        return command
    executable = agents.find_executable(command[0])
    if executable:
        command[0] = executable
    return command


def _session_command(row: Conversation) -> list[str] | None:
    """Stored argv for custom agents, registry lookup otherwise."""
    if row.acp_command:
        try:
            command = json.loads(row.acp_command)
            if isinstance(command, list) and command:
                return _resolve_argv(command)
        except ValueError:
            logger.debug("Invalid stored ACP command for %s", row.id)
    return agents.acp_command_for(row.provider_id or "")


def _attach(db: Session, row: Conversation, sink: acp_client.UpdateSink) -> acp_client.AcpSession:
    """Return a live ACP session, respawning and reloading if necessary."""
    session = acp_client.get(row.id)
    if session is not None and session.alive:
        session.on_update = sink
        return session
    if session is not None:
        session.close()
        acp_client.unregister(row.id)
    argv = _session_command(row)
    if not argv:
        raise HTTPException(status_code=409, detail="Coding agent is no longer installed")
    session = acp_client.AcpSession(argv, row.acp_cwd or _default_cwd(), on_update=sink)
    try:
        session.start()
        if row.acp_session_id and session.capabilities.get("loadSession"):
            session.load_session(row.acp_session_id, row.acp_cwd or _default_cwd())
        else:
            row.acp_session_id = session.new_session(row.acp_cwd or _default_cwd())
            db.commit()
    except Exception as exc:
        session.close()
        logger.warning("Could not reattach coding agent %s: %s", row.provider_id, exc)
        raise HTTPException(status_code=502, detail=f"Could not start coding agent: {exc}") from exc
    acp_client.register(row.id, session)
    return session


@router.get("")
async def list_coding_agents():
    """List installed coding agents and how each one starts in ACP mode."""
    return {"agents": agents.detect_available()}


@router.post("/registry/refresh")
async def refresh_registry():
    """Refresh the bundled ACP registry snapshot (explicit, online only).

    Detection itself stays fully offline — this is an opt-in update so new
    harnesses appear without shipping a new app build. A failure leaves the
    bundled snapshot untouched.
    """
    import urllib.request

    try:
        with urllib.request.urlopen(_REGISTRY_URL, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
        agents.save_registry(payload)
    except Exception as exc:
        logger.warning("ACP registry refresh failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Could not refresh ACP registry: {exc}") from exc
    return {"agents": len(payload.get("agents", []))}


@router.get("/custom")
async def list_custom_agents():
    """List user-defined ACP agents."""
    return {"agents": agents.list_custom_agents()}


@router.post("/custom", status_code=201)
async def add_custom_agent(payload: CustomAgentRequest):
    """Register an arbitrary ACP command (any harness that speaks ACP)."""
    try:
        return agents.add_custom_agent(payload.name, payload.command)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/custom/{agent_id}")
async def delete_custom_agent(agent_id: str):
    """Remove a user-defined ACP agent."""
    if not agents.remove_custom_agent(agent_id):
        raise HTTPException(status_code=404, detail="Custom agent not found")
    return {"deleted": agent_id}


@router.get("/sessions")
async def list_sessions(db: Session = Depends(get_db)):
    """List past coding-agent conversations, newest first."""
    rows = (
        db.query(Conversation)
        .filter(Conversation.agent_type == "coding_agent")
        .order_by(Conversation.updated_at.desc())
        .all()
    )
    return {"sessions": [_session_dict(row) for row in rows]}


@router.post("/sessions", status_code=201)
async def create_session(payload: CreateSessionRequest, db: Session = Depends(get_db)):
    """Spawn a hidden coding agent and create its ACP session."""
    argv = payload.command or agents.acp_command_for(payload.agent_id)
    if not argv:
        raise HTTPException(status_code=400, detail="Coding agent is not installed or has no ACP mode")
    if not all(isinstance(part, str) and part for part in argv):
        raise HTTPException(status_code=400, detail="Command must be a non-empty list of strings")
    argv = _resolve_argv(argv)
    if agents.find_executable(argv[0]) is None:
        raise HTTPException(status_code=400, detail=f"Executable not found: {argv[0]}")
    cwd = Path(payload.cwd or _default_cwd()).expanduser().resolve()
    if not cwd.is_dir():
        raise HTTPException(status_code=400, detail="Working directory does not exist")
    row = Conversation(
        id=str(uuid.uuid4()),
        agent_type="coding_agent",
        title=(payload.title or "New coding session").strip()[:200],
        provider_id=payload.agent_id,
        acp_command=json.dumps(argv) if payload.command else None,
        acp_cwd=str(cwd),
        acp_status="idle",
    )
    db.add(row)
    db.commit()
    session = acp_client.AcpSession(argv, str(cwd))
    try:
        session.start()
        row.acp_session_id = session.new_session(str(cwd))
        db.commit()
    except Exception as exc:
        db.delete(row)
        db.commit()
        session.close()
        logger.warning("Could not create coding session with %s: %s", payload.agent_id, exc)
        raise HTTPException(status_code=502, detail=f"Could not start coding agent: {exc}") from exc
    acp_client.register(row.id, session)
    return _session_dict(row)


@router.get("/sessions/{conversation_id}")
async def get_session(conversation_id: str, db: Session = Depends(get_db)):
    """Return one coding session and its persisted messages."""
    row = _get_conversation(db, conversation_id)
    messages = (
        db.query(ConversationMessage)
        .filter(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at)
        .all()
    )
    return {**_session_dict(row), "messages": [_message_dict(m) for m in messages]}


@router.post("/sessions/{conversation_id}/prompt")
async def prompt(conversation_id: str, payload: PromptRequest, db: Session = Depends(get_db)):
    """Stream one ACP prompt turn as SSE, then persist it to history."""
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")
    row = _get_conversation(db, conversation_id)

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    chunks: list[str] = []

    def sink(params: dict[str, Any]) -> None:
        update = params.get("update") or {}
        loop.call_soon_threadsafe(queue.put_nowait, update)
        text = _text_chunk(params)
        if text is not None:
            chunks.append(text)

    session = _attach(db, row, sink)
    user_message = ConversationMessage(id=str(uuid.uuid4()), conversation_id=row.id, role="user", content=text)
    db.add(user_message)
    row.message_count = (row.message_count or 0) + 1
    row.acp_status = "running"
    db.commit()

    async def stream():
        task = asyncio.create_task(asyncio.to_thread(session.prompt, row.acp_session_id, text))
        try:
            while not task.done():
                try:
                    update = await asyncio.wait_for(queue.get(), timeout=0.5)
                except TimeoutError:
                    continue
                yield f"data: {json.dumps({'type': 'update', 'update': update})}\n\n"
            # A few agents flush their last chunk just after the prompt
            # response; give the reader thread a moment before draining.
            await asyncio.sleep(0.2)
            while not queue.empty():
                update = queue.get_nowait()
                yield f"data: {json.dumps({'type': 'update', 'update': update})}\n\n"
            try:
                stop_reason = await task
            except Exception as exc:
                logger.warning("ACP prompt failed for %s: %s", row.id, exc)
                yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
                row.acp_status = "error"
            else:
                reply = "".join(chunks)
                if reply:
                    db.add(
                        ConversationMessage(
                            id=str(uuid.uuid4()),
                            conversation_id=row.id,
                            role="assistant",
                            content=reply,
                        )
                    )
                    row.message_count = (row.message_count or 0) + 1
                row.acp_status = "done" if stop_reason == "end_turn" else "cancelled"
                yield f"data: {json.dumps({'type': 'done', 'stop_reason': stop_reason})}\n\n"
            db.commit()
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.post("/sessions/{conversation_id}/cancel")
async def cancel(conversation_id: str, db: Session = Depends(get_db)):
    """Cancel the in-flight ACP turn."""
    row = _get_conversation(db, conversation_id)
    session = acp_client.get(conversation_id)
    if session is not None and row.acp_session_id:
        session.cancel(row.acp_session_id)
    row.acp_status = "cancelled"
    db.commit()
    return {"status": "cancelled"}


@router.delete("/sessions/{conversation_id}")
async def delete_session(conversation_id: str, db: Session = Depends(get_db)):
    """Terminate the agent and delete its persisted conversation."""
    row = _get_conversation(db, conversation_id)
    session = acp_client.unregister(conversation_id)
    if session is not None:
        session.close()
    db.query(ConversationMessage).filter(ConversationMessage.conversation_id == conversation_id).delete(
        synchronize_session=False
    )
    db.delete(row)
    db.commit()
    return {"deleted": conversation_id}

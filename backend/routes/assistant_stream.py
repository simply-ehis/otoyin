"""SSE streaming logic for the AI assistant chat."""

import json
import logging
import os
import re
import time
from collections.abc import AsyncIterator

from ..backends import get_llm_backend
from ..services.settings import (
    get_assistant_thinking_enabled,
    get_assistant_token_settings_for,
)
from .assistant_tools import (
    CLIENT_COMMAND_TOOLS,
    MAX_TOOL_ITERATIONS,
    TOOLS,
    build_structured_result,
    execute_tool,
    execute_tools_parallel,
    format_tool_error,
    sse_event,
    suggest_fallback,
)
from .assistant_tools.grammar import build_tool_call_grammar
from .assistant_tools.harness import (
    ExecutionRecord,
    ExecutionStatus,
    HarnessState,
    compact_tool_response,
    create_harness_session,
    estimate_messages_tokens,
)
from .assistant_tools.tool_call_middleware import (
    _fill_missing_defaults,
    build_no_tool_response,
    build_retry_prompt,
    enforce_tool_call_budget,
    filter_low_confidence_calls,
    parse_tool_calls,
    validate_tool_call,
)

# Inlined from small_model_harness (broken external package)
_THINKING_MODEL_PATTERNS = ("qwen3", "deepseek-r1", "deepseek-r2", "r1-distill", "o1", "o3", "planner")
# Explicitly non-reasoning families (mostly TTS/STT): everything else
# defaults to thinking, which is the safe direction for grammar selection.
_NON_THINKING_MODEL_PATTERNS = ("chatterbox", "piper", "whisper", "bark")


def _is_thinking_model(model_id: str) -> bool:
    """Return True if *model_id* refers to a reasoning/thinking model."""
    mid = model_id.lower()
    if any(p in mid for p in _NON_THINKING_MODEL_PATTERNS):
        return False
    if any(p in mid for p in _THINKING_MODEL_PATTERNS):
        return True
    return True


def _split_thinking(text: str) -> tuple[str, str]:
    """Split ``<think>...</think>`` reasoning from the visible response.

    Returns ``(thinking_text, visible_text)``.  If no ``<think>``
    block is present, ``thinking_text`` is empty.
    """
    m = re.search(r"<think>(.*?)</think>", text, re.DOTALL)
    if not m:
        return "", text.strip()
    thinking = m.group(1).strip()
    visible = text[: m.start()] + text[m.end() :]
    return thinking, visible.strip()


logger = logging.getLogger(__name__)

# Maximum retries for malformed tool calls before falling back to plain text
_MAX_PARSE_RETRIES = 2


async def stream_local(
    messages: list[dict],
    system_prompt: str,
    use_tools: bool,
    base_url: str,
    model_id: str | None = None,
    harness: HarnessState | None = None,
) -> AsyncIterator[str]:
    """Stream response from a local GGUF planner with a tool-call loop.

    The model is prompted (via system prompt + TOOLS schema) to emit a JSON
    object with a ``tool_calls`` list when it wants to act. The middleware
    layer parses, validates, and retries malformed output before falling
    back to plain text.

    When ``harness`` is provided, the stream loop records every tool call,
    monitors context pressure, injects steering hints into the system prompt,
    and compacts tool responses under pressure.  This is critical for 2B--4B
    models which have no native function-calling and limited context.
    """
    from ..backends.configs.llm import resolve_planner_size
    from ..services.settings import select_llm_model_size
    from ..utils.startup_defer import ensure_planner_preloaded

    model_id = resolve_planner_size(model_id)
    model_id = select_llm_model_size(model_id)
    await ensure_planner_preloaded()

    backend = get_llm_backend()
    from ..utils.model_lifecycle import lifecycle_manager

    lifecycle_manager.mark_model_used("gguf_llm")
    n_ctx, gen_tokens = get_assistant_token_settings_for(model_id)
    iterations = 0

    # Auto-create harness if not provided (backward compatible)
    if harness is None:
        harness = create_harness_session(n_ctx=n_ctx)

    # Grammar-constrained planning: auto-detect thinking models.  The jackrong
    # Qwen3.5 planners are *thinking* models — constraining their content to
    # JSON suppresses chain-of-thought.  Non-thinking models (Chatterbox,
    # Piper, etc.) benefit from grammar because it eliminates malformed JSON
    # entirely.  The env var TWENTYLABS_PLANNER_GRAMMAR still overrides.
    grammar_env = os.environ.get("TWENTYLABS_PLANNER_GRAMMAR")
    if grammar_env is not None:
        use_grammar = grammar_env == "1"
    else:
        use_grammar = not _is_thinking_model(model_id)
    grammar = build_tool_call_grammar(TOOLS) if use_grammar else None
    thinking_enabled = get_assistant_thinking_enabled()

    # Emit session start event
    yield sse_event("harness_session", harness.session_id, n_ctx=n_ctx)

    while iterations < MAX_TOOL_ITERATIONS:
        iterations += 1

        # --- Harness: update context pressure before each generation ---
        estimated_tokens = estimate_messages_tokens(messages)
        harness.update_context_pressure(estimated_tokens, n_ctx)

        # --- Harness: inject steering hints into system prompt ---
        active_system = system_prompt
        steering = harness.get_steering_prompt()
        if steering:
            active_system = system_prompt + steering

        # --- Harness: check budget ---
        if harness.is_budget_exhausted:
            logger.warning("Harness budget exhausted — stopping tool loop")
            yield sse_event("harness_warning", "Budget exhausted")
            break

        # --- Harness: context pressure critical — break to text ---
        if harness.is_context_critical:
            logger.warning("Context pressure critical (%.0f%%) — breaking to text", harness.context_pressure * 100)
            yield sse_event("harness_warning", "Context full — generating final answer")
            # Let one more generation happen without tools to get a final answer
            use_tools = False

        try:
            full_text = await backend.generate(
                prompt=messages[-1]["content"],
                system=active_system,
                max_tokens=gen_tokens,
                temperature=0.7,
                model_size=model_id,
                chat_messages=messages,
                ctx_override=n_ctx,
                grammar=grammar,
            )
        except RuntimeError as exc:
            if grammar:
                logger.warning("Grammar-constrained generation failed (%s); retrying without grammar", exc)
                grammar = None
                full_text = await backend.generate(
                    prompt=messages[-1]["content"],
                    system=active_system,
                    max_tokens=gen_tokens,
                    temperature=0.7,
                    model_size=model_id,
                    chat_messages=messages,
                    ctx_override=n_ctx,
                )
            else:
                raise

        if not use_tools:
            if thinking_enabled:
                thinking, text = _split_thinking(full_text)
                if thinking:
                    yield sse_event("thinking", thinking)
                yield sse_event("text", text)
            else:
                yield sse_event("text", full_text.strip())
            # Emit session summary
            yield sse_event("harness_summary", harness.to_dict())
            return

        # --- Middleware: parse with retries for malformed JSON ---
        tool_calls = None
        last_error = ""
        previous_attempts: list[str] = []
        for attempt in range(_MAX_PARSE_RETRIES + 1):
            try:
                parsed_calls = parse_tool_calls(full_text)
                validated = []
                for tc in parsed_calls:
                    err = validate_tool_call(tc)
                    if err and err.startswith("Missing required argument"):
                        filled = _fill_missing_defaults(tc["name"], tc["arguments"])
                        tc_after = dict(tc, arguments=filled)
                        err_after = validate_tool_call(tc_after)
                        if err_after is None:
                            logger.debug("Auto-filled defaults for %s", tc["name"])
                            tc = tc_after
                            err = None
                    if err:
                        last_error = err
                        previous_attempts.append(err)
                        logger.debug("Tool call validation failed (attempt %d): %s", attempt + 1, err)
                        raise ValueError(err)
                    validated.append(tc)
                tool_calls = validated
                break
            except (ValueError, json.JSONDecodeError) as exc:
                last_error = str(exc)
                if attempt < _MAX_PARSE_RETRIES:
                    retry_prompt = build_retry_prompt(
                        full_text,
                        last_error,
                        previous_attempts,
                    )
                    messages.append({"role": "user", "content": retry_prompt})
                    try:
                        full_text = await backend.generate(
                            prompt=retry_prompt,
                            system=active_system,
                            max_tokens=gen_tokens,
                            temperature=0.3,
                            model_size=model_id,
                            chat_messages=messages,
                            ctx_override=n_ctx,
                        )
                    finally:
                        if messages and messages[-1].get("content") == retry_prompt:
                            messages.pop()
                    logger.debug("Tool call retry %d after: %s", attempt + 1, last_error)

        if tool_calls is None:
            logger.warning("Tool call parsing failed after %d retries: %s", _MAX_PARSE_RETRIES, last_error)
            fallback = build_no_tool_response(last_error)
            yield sse_event("text", fallback)
            yield sse_event("harness_summary", harness.to_dict())
            return

        # --- Post-parse middleware: confidence filter + budget enforcement ---
        tool_calls, rejected = filter_low_confidence_calls(tool_calls)
        if rejected:
            for r in rejected:
                logger.warning(
                    "Rejected low-confidence tool call: %s (score=%.2f, warnings=%s)",
                    r.name,
                    r.score,
                    r.warnings,
                )
        tool_calls = enforce_tool_call_budget(tool_calls)

        if not tool_calls:
            if thinking_enabled:
                thinking, text = _split_thinking(full_text)
                if thinking:
                    yield sse_event("thinking", thinking)
                yield sse_event("text", text)
            else:
                yield sse_event("text", full_text.strip())
            yield sse_event("harness_summary", harness.to_dict())
            return

        # Model requested tool calls — execute them, feed results back, loop.
        assistant_msg: dict = {"role": "assistant", "content": full_text}
        assistant_msg["tool_calls"] = [
            {"id": tc["id"], "function": {"name": tc["name"], "arguments": tc["arguments"]}} for tc in tool_calls
        ]
        messages.append(assistant_msg)

        # Emit tool call start events
        for tc in tool_calls:
            name = tc["name"]
            args = tc["arguments"]
            yield sse_event("tool_call", f"Calling {name}...", tool_name=name, tool_args=args)

        # Separate CLIENT_COMMAND_TOOLS (executed immediately) from backend tools
        client_commands = [tc for tc in tool_calls if tc["name"] in CLIENT_COMMAND_TOOLS]
        backend_tools = [tc for tc in tool_calls if tc["name"] not in CLIENT_COMMAND_TOOLS]

        # Execute client commands first (they're instant)
        for tc in client_commands:
            name = tc["name"]
            args = tc["arguments"]
            yield sse_event("command", "", intent=name, tool_args=args)
            result = "Command dispatched to the app UI."
            yield sse_event("tool_result", result, tool_name=name, tool_result=result)
            messages.append(
                {
                    "role": "tool",
                    "content": result,
                    "tool_call_id": tc["id"],
                    "name": name,
                }
            )
            # --- Harness: record client command execution ---
            harness.record_execution(
                ExecutionRecord(
                    timestamp=time.time().__class__.__name__,
                    tool_name=name,
                    arguments=args,
                    status=ExecutionStatus.COMPLETED,
                    result=result,
                    duration_ms=0.0,
                )
            )

        # Execute backend tools in parallel where possible
        if backend_tools:
            results = await execute_tools_parallel(backend_tools, base_url)
            for tc, result in zip(backend_tools, results, strict=True):
                name = tc["name"]
                args = tc["arguments"]
                start_time = time.monotonic()
                is_error = isinstance(result, str) and (result.startswith("Error") or "failed" in result.lower())
                fallback = suggest_fallback(name, result) if is_error else None
                if is_error:
                    result = format_tool_error(name, result, args)
                    if fallback:
                        result += f" Suggestion: {fallback}"

                # --- Harness: compact response under context pressure ---
                if harness.is_context_warned and not is_error:
                    result, was_compacted = compact_tool_response(name, result)
                    if was_compacted:
                        logger.debug(
                            "Compacted response from %s (pressure=%.0f%%)", name, harness.context_pressure * 100
                        )

                # --- Harness: record execution ---
                duration_ms = (time.monotonic() - start_time) * 1000
                harness.record_execution(
                    ExecutionRecord(
                        timestamp=time.time().__class__.__name__,
                        tool_name=name,
                        arguments=args,
                        status=ExecutionStatus.FAILED if is_error else ExecutionStatus.COMPLETED,
                        result=result,
                        error=result if is_error else None,
                        duration_ms=duration_ms,
                    )
                )

                structured = build_structured_result(name, result, args, fallback=fallback)
                yield sse_event(
                    "tool_result",
                    result,
                    tool_name=name,
                    tool_result=result,
                    structured=structured,
                )
                messages.append(
                    {
                        "role": "tool",
                        "content": result,
                        "tool_call_id": tc["id"],
                        "name": name,
                    }
                )

    # Emit session summary at end
    yield sse_event("harness_summary", harness.to_dict())
    yield sse_event("text", "Reached maximum tool call iterations.")


async def stream_api(
    messages: list[dict],
    system_prompt: str,
    api_key: str,
    api_base_url: str,
    model_id: str,
    use_tools: bool,
    local_base_url: str = "",
) -> AsyncIterator[str]:
    """Stream response from an OpenAI-compatible API endpoint.

    ``local_base_url`` is the otoyin backend URL used for tool execution —
    server-side tools always run locally, never against the external API.
    """
    import aiohttp

    from ..utils.ssrf import is_url_safe as _is_safe_url

    if not _is_safe_url(api_base_url):
        yield sse_event("error", "URL blocked (private/internal network)")
        return

    api_url = f"{api_base_url.rstrip('/')}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    full_messages = [{"role": "system", "content": system_prompt}] + [
        {
            k: v
            for k, v in {
                "role": m["role"],
                "content": m.get("content", ""),
                "tool_calls": m.get("tool_calls"),
                "tool_call_id": m.get("tool_call_id"),
                "name": m.get("name"),
            }.items()
            if v is not None
        }
        for m in messages
    ]
    iterations = 0

    while iterations < MAX_TOOL_ITERATIONS:
        iterations += 1
        payload: dict = {
            "model": model_id,
            "messages": full_messages,
            "stream": True,
            "max_tokens": 1024,
        }
        if use_tools:
            payload["tools"] = TOOLS

        accumulated = ""
        tool_calls_data: list[dict] = []

        try:
            async with (
                aiohttp.ClientSession() as session,
                session.post(
                    api_url,
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=120),
                ) as resp,
            ):
                if resp.status != 200:
                    body = await resp.text()
                    yield sse_event("error", f"API error {resp.status}: {body[:500]}")
                    return
                async for line in resp.content:
                    decoded = line.decode("utf-8").strip()
                    if not decoded or not decoded.startswith("data: "):
                        continue
                    data_str = decoded[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    choices = chunk.get("choices", [])
                    if not choices:
                        continue
                    delta = choices[0].get("delta", {})
                    if delta.get("content"):
                        accumulated += delta["content"]
                        yield sse_event("text", delta["content"])
                    if "tool_calls" in delta:
                        _accumulate_tool_calls(delta["tool_calls"], tool_calls_data)
        except Exception as e:
            yield sse_event("error", f"API request failed: {e}")
            return

        if not tool_calls_data:
            return

        full_messages.append(
            {
                "role": "assistant",
                "content": accumulated or "",
                "tool_calls": tool_calls_data,
            }
        )
        for tc in tool_calls_data:
            fn = tc.get("function", {})
            name = fn.get("name", "")
            try:
                args = json.loads(fn.get("arguments", "{}"))
            except json.JSONDecodeError:
                args = {}
            yield sse_event("tool_call", f"Calling {name}...", tool_name=name, tool_args=args)
            if name in CLIENT_COMMAND_TOOLS:
                yield sse_event("command", "", intent=name, tool_args=args)
                result = "Command dispatched to the app UI."
                yield sse_event("tool_result", result, tool_name=name, tool_result=result)
            else:
                result = await execute_tool(name, args, local_base_url or api_base_url)
                is_error = isinstance(result, str) and (result.startswith("Error") or "failed" in result.lower())
                fallback = suggest_fallback(name, result) if is_error else None
                if is_error:
                    result = format_tool_error(name, result, args)
                    if fallback:
                        result += f" Suggestion: {fallback}"
                structured = build_structured_result(name, result, args, fallback=fallback)
                yield sse_event(
                    "tool_result",
                    result,
                    tool_name=name,
                    tool_result=result,
                    structured=structured,
                )
            full_messages.append({"role": "tool", "content": result, "tool_call_id": tc.get("id", ""), "name": name})

    yield sse_event("text", "Reached maximum tool call iterations.")


def _accumulate_tool_calls(delta_tcs: list, out: list) -> None:
    """Merge streamed tool call chunks into the accumulator list."""
    for tc in delta_tcs:
        idx = tc.get("index", 0)
        while len(out) <= idx:
            out.append({"id": "", "function": {"name": "", "arguments": ""}})
        if tc.get("id"):
            out[idx]["id"] = tc["id"]
        fn = tc.get("function", {})
        if fn.get("name"):
            out[idx]["function"]["name"] = fn["name"]
        if fn.get("arguments"):
            out[idx]["function"]["arguments"] += fn["arguments"]

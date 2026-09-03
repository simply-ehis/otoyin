"""GBNF grammar that constrains the local planner to emit valid tool-call JSON.

The jackrong planner has no native function-calling; it is steered by the
system prompt (``constants.build_local_tool_prompt``) to emit a JSON object
with a ``tool_calls`` list. Small on-device models frequently emit malformed
JSON (trailing commas, code fences, mixed prose), which ``tool_call_middleware``
repairs via retry. Constraining the model with a llama.cpp GBNF grammar makes
malformed output structurally impossible, so the middleware becomes a backstop
rather than a hot path.

Gating: grammar is applied ONLY when ``TWENTYLABS_PLANNER_GRAMMAR=1``. It is
off by default because the jackrong planners are *thinking* models — they emit
chain-of-thought into ``content``/``reasoning_content`` before the tool-call
JSON, and a grammar that constrains ``content`` to JSON would suppress that
thinking. Until that interaction is validated against the real cached GGUF, the
feature stays opt-in so default behavior is unchanged. ``stream_local`` also
falls back to a no-grammar generation if a grammar call errors, so enabling it
can never dead-end a chat.
"""

from __future__ import annotations

import os

# GBNF primitives for arbitrary JSON values (objects/arrays/strings/numbers/
# booleans/null). Whitespace is allowed but optional so the model is not forced
# to emit pretty-printed JSON.
_JSON_GRAMMAR = r"""
json ::= object | array | string | number | "true" | "false" | "null"
object ::= "{" ws (pair ("," ws pair)*)? ws "}"
pair ::= string ws ":" ws json
array ::= "[" ws (json ("," ws json)*)? ws "]"
string ::= "\"" (
    [^"\\] |
    "\\" (["\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F])
)* "\""
number ::= ("-"? ([0-9] | [1-9] [0-9]*)) ("." [0-9]+)? ([eE] [-+]? [0-9]+)?
ws ::= [ \t\n\r]*
"""

_ROOT = 'root ::= "{" ws "\\"tool_calls\\"" ws ":" ws "[" toolcall ("," ws toolcall)* "]" ws "}"'
_TOOLCALL = (
    'toolcall ::= "{" ws "\\"id\\"" ws ":" ws string ws "," ws '
    '"\\"function\\"" ws ":" ws "{" ws "\\"name\\"" ws ":" ws toolname ws "," ws '
    '"\\"arguments\\"" ws ":" ws json ws "}" ws "}"'
)


def _quote_gbnf(literal: str) -> str:
    """Escape a tool name for use as a GBNF string literal."""
    return '"' + literal.replace("\\", "\\\\").replace('"', '\\"') + '"'


def build_tool_call_grammar(tools: list[dict]) -> str:
    """Build a GBNF grammar string constraining output to a tool_calls object.

    ``toolname`` is an alternation over every canonical tool name so the model
    cannot emit a name that fails ``validate_tool_call``. The ``arguments``
    value is a generic JSON object; argument-level validation still happens in
    ``tool_call_middleware.validate_tool_call`` (types/required fields), so the
    grammar only guarantees *structural* validity, not semantic correctness.
    """
    names = []
    for t in tools:
        fn = t.get("function", {})
        name = fn.get("name", "")
        if name:
            names.append(name)
    if not names:
        raise ValueError("Cannot build a tool-call grammar with zero tools")

    # Dedupe preserving order; longest-first so a prefix-collision doesn't
    # shadow a longer name during GBNF alternation matching.
    seen: set[str] = set()
    unique = []
    for n in names:
        if n not in seen:
            seen.add(n)
            unique.append(n)
    unique.sort(key=len, reverse=True)
    toolname_rule = "toolname ::= " + " | ".join(_quote_gbnf(n) for n in unique)

    return "\n".join(
        [
            _ROOT,
            _TOOLCALL,
            toolname_rule,
            _JSON_GRAMMAR,
        ]
    )


def planner_grammar_enabled() -> bool:
    """Whether grammar-constrained planning is enabled (opt-in, default off)."""
    return os.environ.get("TWENTYLABS_PLANNER_GRAMMAR", "0") == "1"

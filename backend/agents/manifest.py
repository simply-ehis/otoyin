"""Single source of truth for the otoyin agent surface.

Every agent entry point — the in-app assistant (local + OpenAI-compatible
cloud), and the external MCP server — should describe the SAME product and
expose the SAME tool capabilities. This module is the canonical owner of:

* the agent system prompt (base text shared by all surfaces),
* the canonical OpenAI-style tool schema list (``CANONICAL_TOOLS``),
* the MCP ``instructions`` blurb (derived from the same base),
* an observable tool-parity report so divergence between surfaces is
  explicit rather than silent.

Implementation note: the in-app assistant and MCP tools currently have
DIFFERENT backends (assistant calls REST endpoints; MCP returns base64 WAV,
and each side has a few capabilities the other lacks — RVC packs/Freesound
on MCP). Unifying the *schemas and prompt* here is the first, safe step;
unifying implementations is tracked separately. ``get_tool_parity_report``
makes the remaining gaps visible.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .instructions import AGENT_INSTRUCTIONS

logger = logging.getLogger(__name__)

# MCP tool names are dotted (``21labs.speak``); the assistant uses the bare
# snake_case stem. This maps canonical stems -> MCP-registered names so a tool
# defined once can be referenced from both surfaces.
MCP_NAME_PREFIX = "21labs."


@dataclass(frozen=True, slots=True)
class SkillSpec:
    """A reusable workflow contract shared by the assistant and MCP."""

    skill_id: str
    name: str
    description: str
    triggers: tuple[str, ...]
    steps: tuple[str, ...]
    tools: dict[str, tuple[str, ...]]
    pitfalls: tuple[str, ...] = ()

    def as_dict(self, surface: str | None = None) -> dict[str, Any]:
        """Return the public, JSON-safe representation for an agent surface."""
        tools = self.tools if surface is None else {surface: self.tools.get(surface, ())}
        return {
            "id": self.skill_id,
            "name": self.name,
            "description": self.description,
            "triggers": list(self.triggers),
            "steps": list(self.steps),
            "tools": {key: list(value) for key, value in tools.items()},
            "pitfalls": list(self.pitfalls),
        }


# Keep workflow knowledge separate from individual tool descriptions. This
# gives both agent surfaces a dependable playbook instead of asking a model to
# rediscover sequencing from 200+ independent tools.
SKILL_SPECS: tuple[SkillSpec, ...] = (
    SkillSpec(
        "voiceover",
        "Voiceover and narration",
        "Create polished single-speaker narration and deliver it at a platform-ready level.",
        ("voiceover", "narration", "read this", "voice track"),
        ("Resolve a suitable voice", "Generate speech", "Measure loudness", "Export with a delivery preset"),
        {
            "assistant": ("list_voices", "generate_speech", "measure_loudness", "export_audio"),
            "mcp": ("list_profiles", "speak", "analyze_loudness", "apply_export_preset"),
        },
        ("Do not claim completion until the output is rendered and measured.",),
    ),
    SkillSpec(
        "podcast",
        "Podcast episode",
        "Build a multi-speaker episode with dialogue leveling, ducking, and podcast loudness delivery.",
        ("podcast", "interview", "panel", "episode"),
        (
            "Resolve voices for each speaker",
            "Generate or stage each line",
            "Auto-level and duck overlapping dialogue",
            "Run the podcast recipe and export",
        ),
        {
            "assistant": (
                "list_voices",
                "generate_speech",
                "conversation_auto_duck",
                "conversation_auto_level",
                "run_recipe",
                "export_audio",
            ),
            "mcp": (
                "list_profiles",
                "speak",
                "conversation_auto_duck",
                "conversation_auto_level",
                "run_recipe",
                "apply_export_preset",
            ),
        },
        ("Do not use a nonexistent conversation render endpoint.",),
    ),
    SkillSpec(
        "audiobook",
        "Audiobook production",
        "Turn a long-form script into chapters with cast, rendering, and export checkpoints.",
        ("audiobook", "book", "chapter", "long-form narration"),
        (
            "Create or resolve the audiobook project",
            "Parse and cast the chapter",
            "Render the chapter",
            "Export and verify the finished audio",
        ),
        {
            "assistant": (
                "list_audiobooks",
                "create_audiobook",
                "parse_audiobook_script",
                "render_audiobook_chapter",
                "export_audiobook",
            ),
            "mcp": (
                "list_audiobooks",
                "create_audiobook",
                "parse_audiobook_script",
                "render_audiobook_chapter",
                "apply_export_preset",
            ),
        },
        ("Keep chapters separate until each render passes its quality checks.",),
    ),
    SkillSpec(
        "clean-master",
        "Clean and master",
        "Repair noisy audio, apply transparent processing, and finish to a measured loudness target.",
        ("clean this", "remove noise", "master", "loudness", "finish this audio"),
        (
            "Inspect the source",
            "Reduce noise and apply only needed effects",
            "Measure loudness and true peak",
            "Master and export a new version",
        ),
        {
            "assistant": ("noise_reduce", "apply_effects", "measure_loudness", "master_audio", "export_audio"),
            "mcp": ("noise_reduce", "apply_effects", "analyze_loudness", "master_audio", "apply_export_preset"),
        },
        ("Never overwrite the source; processing must remain non-destructive.",),
    ),
    SkillSpec(
        "adr",
        "ADR replacement",
        "Manage an acted dialogue replacement pass from guide upload through scored take selection and alignment.",
        ("ADR", "replace dialogue", "dub a line", "sync a take"),
        (
            "Create or inspect the ADR session",
            "Upload the guide and replacement takes",
            "Score or auto-select the best take",
            "Align and verify the chosen take",
        ),
        {
            "assistant": (
                "adr_create_session",
                "adr_upload_guide",
                "adr_upload_take",
                "adr_auto_select",
                "adr_select_take",
                "adr_align",
                "adr_score",
            ),
            "mcp": (
                "adr_create_session",
                "adr_upload_guide",
                "adr_upload_take",
                "adr_auto_select",
                "adr_select_take",
                "adr_align",
                "adr_score",
            ),
        },
        ("The live audio graph remains human-controlled; the agent stages and scores takes.",),
    ),
    SkillSpec(
        "voice-design",
        "Voice design and cloning",
        "Find or create an on-device voice profile, then use it consistently for generation.",
        ("clone a voice", "voice design", "make a character", "reference voice"),
        (
            "Resolve a bundled reference or local sample",
            "Create or update the voice profile",
            "Generate a short quality check",
            "Reuse the approved profile for production",
        ),
        {
            "assistant": (
                "list_reference_voices",
                "use_reference_voice",
                "clone_voice",
                "create_profile",
                "generate_speech",
            ),
            "mcp": ("list_reference_voices", "use_reference_voice", "clone_voice", "create_profile", "speak"),
        },
        ("Keep reference audio local and never imply cloud voice cloning is available.",),
    ),
    SkillSpec(
        "dubbing",
        "Video dubbing",
        "Replace the speech in a video with a target-language voiceover end to end.",
        ("dub this video", "translate video", "dub into spanish", "video voiceover"),
        (
            "Check target language support",
            "Start the dub job on the source video",
            "Poll status until render completes",
            "Download or preview the dubbed output",
        ),
        {
            "assistant": (
                "dub_languages",
                "dub_video",
                "dub_status",
                "dub_preview",
                "dub_download",
                "dub_cancel",
            ),
            "mcp": (
                "dub_languages",
                "dub_video",
                "dub_status",
                "dub_preview",
                "dub_download",
                "dub_cancel",
            ),
        },
        ("Long renders are async — poll dub_status; never claim done before download succeeds.",),
    ),
    SkillSpec(
        "transcribe",
        "Transcription and subtitles",
        "Turn speech into text, speaker-labeled transcripts, or timed subtitle files.",
        ("transcribe this", "make subtitles", "speaker labels", "srt file"),
        (
            "Transcribe the source audio",
            "Diarize speakers when more than one voice is present (assistant: via capture flow)",
            "Export subtitles in the requested format",
        ),
        {
            "assistant": ("transcribe", "export_subtitles"),
            "mcp": ("transcribe", "diarize", "export_subtitles"),
        },
        ("Subtitle timing comes from the STT segments — do not fabricate timestamps.",),
    ),
    SkillSpec(
        "batch",
        "Batch production",
        "Render many text items through one voice with progress tracking and per-item retry.",
        ("batch generate", "render all lines", "bulk tts", "queue these"),
        (
            "Create the batch job from an ordered item list",
            "Poll progress until every item settles",
            "Retry only the failed items",
            "Fetch final per-item results",
        ),
        {
            "assistant": (
                "batch_create_from_list",
                "batch_job_progress",
                "batch_job_items",
                "batch_job_retry",
            ),
            "mcp": (
                "batch_create_from_list",
                "batch_job_progress",
                "batch_job_items",
                "batch_job_retry",
            ),
        },
        ("Never re-create a whole job to fix one item — use batch_job_retry.",),
    ),
)


def get_canonical_tools() -> list[dict[str, Any]]:
    """Return the single OpenAI-style tool schema list (canonical).

    Both the in-app assistant and the MCP surface should ultimately describe
    capabilities from this list.
    """
    from ..routes.assistant_tools import TOOLS

    return TOOLS


class _CustomSkillProxy:
    """Adapts a database CustomSkill row to the SkillSpec duck-type interface."""

    __slots__ = ("description", "name", "pitfalls", "skill_id", "steps", "tools", "triggers")

    def __init__(self, row: Any, surface: str | None = None) -> None:
        self.skill_id = row.skill_id
        self.name = row.name
        self.description = row.description or ""
        self.triggers = tuple(row.triggers or [])
        self.steps = tuple(row.steps or [])
        raw_tools = row.tools or {}
        if surface:
            self.tools = {surface: tuple(raw_tools.get(surface, []))}
        else:
            self.tools = {k: tuple(v) for k, v in raw_tools.items()}
        self.pitfalls = tuple(row.pitfalls or [])

    def as_dict(self, surface: str | None = None) -> dict[str, Any]:
        tools = self.tools if surface is None else {surface: self.tools.get(surface, ())}
        return {
            "id": self.skill_id,
            "name": self.name,
            "description": self.description,
            "triggers": list(self.triggers),
            "steps": list(self.steps),
            "tools": {key: list(value) for key, value in tools.items()},
            "pitfalls": list(self.pitfalls),
            "is_custom": True,
        }


# Lazy singleton — avoids importing the entire assistant_tools package at
# module scope, which cascades through ~10 tool-schema modules and costs
# ~1s of cold-start time every time anything touches agents.manifest.
_CANONICAL_TOOL_NAMES: set[str] | None = None


def _get_canonical_tool_names() -> set[str]:
    global _CANONICAL_TOOL_NAMES
    if _CANONICAL_TOOL_NAMES is None:
        _CANONICAL_TOOL_NAMES = {t["function"]["name"] for t in get_canonical_tools()}
    return _CANONICAL_TOOL_NAMES


# Module-level alias so existing code that reads CANONICAL_TOOL_NAMES keeps
# working without changes — but the heavy import only happens on first access.
class _LazyCanonicalNames:
    """Proxy that defers the real lookup until first use (set membership, len, iteration)."""

    def __contains__(self, item: str) -> bool:
        return item in _get_canonical_tool_names()

    def __iter__(self):
        return iter(_get_canonical_tool_names())

    def __len__(self):
        return len(_get_canonical_tool_names())

    def __sub__(self, other):
        return _get_canonical_tool_names() - set(other)

    def __rsub__(self, other):
        return set(other) - _get_canonical_tool_names()

    def __and__(self, other):
        return _get_canonical_tool_names() & set(other)

    def __rand__(self, other):
        return set(other) & _get_canonical_tool_names()

    def __or__(self, other):
        return _get_canonical_tool_names() | set(other)

    def __ror__(self, other):
        return set(other) | _get_canonical_tool_names()

    def __repr__(self):
        return repr(_get_canonical_tool_names())

    def __hash__(self):
        return hash(frozenset(_get_canonical_tool_names()))


CANONICAL_TOOL_NAMES: set[str] = _LazyCanonicalNames()  # type: ignore[assignment]


def _base_prompt() -> str:
    """Crafted agent instructions shared by all surfaces (see agents/instructions)."""
    return AGENT_INSTRUCTIONS


def get_agent_system_prompt(
    with_tools: bool = False,
    query: str | None = None,
    base_override: str | None = None,
) -> str:
    """Canonical system prompt for the in-app/cloud assistant.

    When ``with_tools`` is set (local llama.cpp path, which has no native
    function calling), append the compact tool catalog so the model knows how
    to emit tool calls.

    ``query`` enables offline tool retrieval: instead of dumping every tool
    into the context, only the top-K most relevant tools are rendered in full
    (the rest stay visible by name). This is the "system-prompt router"
    replacement for the unavailable Needle 2 model — no finetune, no binary.

    ``base_override`` replaces the built-in base prompt (the editable assistant
    system prompt stored in settings); the tool schema is still appended.
    """
    base = base_override.strip() if base_override else _base_prompt()
    skill_prompt = _build_skill_prompt(query)
    if with_tools:
        from ..routes.assistant_tools import build_local_tool_prompt
        from ..routes.assistant_tools.schemas import TOOLS
        from ..routes.assistant_tools.tool_router import select_tools_for_prompt

        detailed, _remaining, meta = select_tools_for_prompt(query, TOOLS)
        if query:
            return base + skill_prompt + build_local_tool_prompt(detailed, meta=meta)
        return base + skill_prompt + build_local_tool_prompt(None)
    return base + skill_prompt


def get_skill_catalog(surface: str | None = None, query: str | None = None) -> list[dict[str, Any]]:
    """Return shared workflow skills (built-in + custom), optionally filtered for a surface/query."""
    if surface not in (None, "assistant", "mcp"):
        raise ValueError("surface must be 'assistant', 'mcp', or None")
    skills = [skill for skill in SKILL_SPECS if surface is None or surface in skill.tools]

    # Merge custom skills from the database
    try:
        from ..database.models import CustomSkill
        from ..database.session import SessionLocal

        if SessionLocal:
            db = SessionLocal()
            try:
                custom_rows = db.query(CustomSkill).filter(CustomSkill.enabled).all()
                for row in custom_rows:
                    tools_dict = row.tools or {}
                    if surface and surface not in tools_dict:
                        continue
                    skills.append(_CustomSkillProxy(row, surface))
            finally:
                db.close()
    except Exception:
        pass  # database not ready or table missing — return built-in only

    if query and query.strip():
        terms = [term.strip(".,!?;:") for term in query.lower().split() if len(term.strip(".,!?;:")) >= 3]

        def score(skill: SkillSpec | _CustomSkillProxy) -> int:
            haystack = " ".join((skill.skill_id, skill.name, skill.description, *skill.triggers)).lower()
            return sum(haystack.count(term) for term in terms)

        ranked = sorted(skills, key=lambda skill: (-score(skill), skill.name))
        skills = [skill for skill in ranked if score(skill) > 0] or ranked
    return [skill.as_dict(surface) for skill in skills]


def validate_skill_catalog() -> list[str]:
    """Return skill metadata errors before it is exposed to either agent."""
    errors: list[str] = []
    seen: set[str] = set()
    surfaces = {"assistant": CANONICAL_TOOL_NAMES, "mcp": _collect_mcp_tool_names()}
    for skill in SKILL_SPECS:
        if skill.skill_id in seen:
            errors.append(f"duplicate skill id: {skill.skill_id}")
        seen.add(skill.skill_id)
        for surface, tools in skill.tools.items():
            if surface not in surfaces:
                errors.append(f"{skill.skill_id}: unsupported surface {surface}")
                continue
            missing = sorted(set(tools) - surfaces[surface])
            errors.extend(f"{skill.skill_id}: {surface} tool missing: {name}" for name in missing)
    return errors


def _build_skill_prompt(query: str | None) -> str:
    """Build a compact skill router prompt for local and API-backed agents."""
    skills = get_skill_catalog(surface="assistant", query=query)
    lines = ["\n\nWorkflow skills (choose the closest playbook before sequencing tools):"]
    for skill in skills:
        tools = ", ".join(skill["tools"].get("assistant", []))
        lines.append(f"- {skill['id']}: {skill['description']} Tools: {tools}.")
    return "\n".join(lines)


def get_mcp_instructions(query: str | None = None) -> str:
    """Unified MCP ``instructions`` blurb, derived from the shared base.

    When ``query`` is provided (item 7: MCP routing), the instructions are
    tailored to the detected task category so MCP clients with small context
    windows see a focused tool subset.  Without a query, returns the full
    discoverability hint.
    """
    base = "Otoyin Studios is a fully local, on-device AI audio studio. All processing is offline."

    # Category-specific routing hints for MCP clients (item 7)
    _category_hints: dict[str, str] = {
        "generation": (
            " Use 21labs.speak to render text in a voice profile, "
            "21labs.generate_sfx for sound effects, or 21labs.generate_music "
            "for music. Use 21labs.list_profiles to find available voices."
        ),
        "voice": (
            " Use 21labs.list_profiles to browse voices, 21labs.clone_voice "
            "to create a voice from reference audio, or 21labs.speak to render."
        ),
        "editing": (
            " Use 21labs.apply_effects to add reverb/EQ/compression, "
            "21labs.normalize_audio for loudness, or 21labs.trim_audio to cut."
        ),
        "transcription": (" Use 21labs.transcribe for audio-to-text. Supports multiple languages and model sizes."),
        "analysis": (
            " Use 21labs.measure_loudness for LUFS analysis, "
            "21labs.analyze_pitch for pitch detection, or "
            "21labs.list_captures to browse recorded audio."
        ),
        "export": (
            " Use 21labs.export_audio to render the project. Supports platform presets (Spotify, YouTube, podcast)."
        ),
    }

    if query:
        # Simple category detection from query keywords
        lower = query.lower()
        for category, hint in _category_hints.items():
            keywords = _CATEGORY_KEYWORDS.get(category, ())
            if any(kw in lower for kw in keywords):
                return base + hint

    return (
        base + " Use 21labs.speak to render text in a voice profile, "
        "21labs.transcribe for audio→text, and 21labs.list_skills to select a "
        "workflow playbook before chaining tools. Use list_* tools to discover "
        "profiles, captures, models, and presets."
    )


# Keyword-to-category mapping for MCP routing (item 7)
_CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "generation": ("speech", "voice", "speak", "tts", "sfx", "sound", "music", "generate"),
    "voice": ("voice", "clone", "profile", "speaker"),
    "editing": ("effect", "reverb", "eq", "compress", "normalize", "trim", "cut", "edit"),
    "transcription": ("transcribe", "stt", "whisper", "subtitle", "caption"),
    "analysis": ("loudness", "lufs", "pitch", "analyze", "measure"),
    "export": ("export", "render", "download", "mp3", "wav"),
}


def get_tool_parity_report() -> dict[str, Any]:
    """Observable divergence between the assistant and MCP tool surfaces.

    Returns the set of canonical tool names missing from MCP and the set of
    MCP-registered names with no canonical assistant counterpart. Surfaced so
    the gap is tracked, not hidden.
    """

    # Collect MCP-registered names without importing FastMCP side effects:
    # register_tools builds the tool set; we introspect via the module's own
    # registry helper if present, else fall back to the documented prefixes.
    mcp_names: set[str] = set()
    try:
        mcp_names = _collect_mcp_tool_names()
    except Exception as exc:  # pragma: no cover - defensive
        logger.debug("MCP name collection skipped: %s", exc)

    canonical = CANONICAL_TOOL_NAMES
    # Canonical stems that have no MCP equivalent.
    missing_in_mcp = sorted(canonical - mcp_names)
    # MCP stems with no canonical assistant tool.
    missing_in_assistant = sorted(mcp_names - canonical)
    return {
        "canonical_tool_count": len(canonical),
        "mcp_tool_count": len(mcp_names),
        "missing_in_mcp": missing_in_mcp,
        "missing_in_assistant": missing_in_assistant,
    }


def _collect_mcp_tool_names() -> set[str]:
    """Best-effort extraction of registered MCP tool stems.

    FastMCP registers tools on a server instance; to avoid importing the full
    server (which mounts onto FastAPI), we scan every module in
    ``mcp_server/tools/`` line-by-line for ``@mcp.tool`` decorators,
    capturing an explicit ``name=`` (same-line or the line below, since the
    decorators are formatted across multiple lines) or, when absent, the
    following ``async def`` function name. Names are normalized to the bare
    stem (dotted ``21labs.`` prefix stripped) so they compare directly
    against the canonical assistant tool names.
    """
    import re

    tools_dir = Path(__file__).resolve().parent.parent / "mcp_server" / "tools"
    if not tools_dir.is_dir():
        return set()
    lines: list[str] = []
    for py_file in sorted(tools_dir.glob("*.py")):
        lines.extend(py_file.read_text(encoding="utf-8").splitlines())
    stems: set[str] = set()
    name_re = re.compile(r'@mcp\.tool\(\s*name\s*=\s*["\']([^"\']+)["\']')
    bare_re = re.compile(r"@mcp\.tool\s*\(")
    multiline_name_re = re.compile(r'^\s*name\s*=\s*["\']([^"\']+)["\']')
    def_re = re.compile(r"^\s*async\s+def\s+(\w+)")
    pending_bare = False
    for line in lines:
        m = name_re.search(line)
        if m:
            stems.add(_normalize_stem(m.group(1)))
            pending_bare = False
            continue
        if bare_re.search(line):
            pending_bare = True
            continue
        if pending_bare:
            m2 = multiline_name_re.match(line)
            if m2:
                stems.add(_normalize_stem(m2.group(1)))
                pending_bare = False
                continue
            d = def_re.match(line)
            if d:
                stems.add(_normalize_stem(d.group(1)))
                pending_bare = False
    return stems


def _normalize_stem(name: str) -> str:
    """Strip MCP/function prefixes so a name compares to a canonical stem."""
    name = name.split(".")[-1]
    if name.startswith("21labs_"):
        name = name[len("21labs_") :]
    if name.startswith("twentylabs_"):
        name = name[len("twentylabs_") :]
    return name


__all__ = [
    "AGENT_INSTRUCTIONS",
    "CANONICAL_TOOL_NAMES",
    "MCP_NAME_PREFIX",
    "get_agent_system_prompt",
    "get_canonical_tools",
    "get_mcp_instructions",
    "get_skill_catalog",
    "get_tool_parity_report",
    "validate_skill_catalog",
]

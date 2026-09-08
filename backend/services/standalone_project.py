"""Standalone project management — create projects without Leone."""

import json
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass
class ProjectScene:
    id: str
    name: str
    duration: float = 60.0
    dialogue: list[dict] = field(default_factory=list)
    markers: list[dict] = field(default_factory=list)


@dataclass
class ProjectCharacter:
    id: str
    name: str
    voice_profile_id: str | None = None
    description: str = ""


@dataclass
class StandaloneProject:
    id: str
    name: str
    description: str = ""
    fps: float = 24.0
    sample_rate: int = 48000
    created_at: str = ""
    updated_at: str = ""
    scenes: list[ProjectScene] = field(default_factory=list)
    characters: list[ProjectCharacter] = field(default_factory=list)
    script_text: str = ""
    script_format: str = "plain"
    audio_files: list[dict] = field(default_factory=list)


def create_standalone_project(
    name: str,
    description: str = "",
    fps: float = 24.0,
    sample_rate: int = 48000,
) -> StandaloneProject:
    now = datetime.now(UTC).isoformat()
    project = StandaloneProject(
        id=str(uuid.uuid4()),
        name=name,
        description=description,
        fps=fps,
        sample_rate=sample_rate,
        created_at=now,
        updated_at=now,
    )
    project.scenes.append(
        ProjectScene(
            id=str(uuid.uuid4()),
            name="Scene 1",
            duration=60.0,
        )
    )
    return project


def project_to_dict(project: StandaloneProject) -> dict:
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "fps": project.fps,
        "sample_rate": project.sample_rate,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "scenes": [
            {
                "id": s.id,
                "name": s.name,
                "duration": s.duration,
                "dialogue": s.dialogue,
                "markers": s.markers,
            }
            for s in project.scenes
        ],
        "characters": [
            {
                "id": c.id,
                "name": c.name,
                "voice_profile_id": c.voice_profile_id,
                "description": c.description,
            }
            for c in project.characters
        ],
        "script_text": project.script_text,
        "script_format": project.script_format,
        "audio_files": project.audio_files,
    }


def project_from_json(json_str: str) -> StandaloneProject:
    data = json.loads(json_str)
    project = StandaloneProject(
        id=data.get("id", str(uuid.uuid4())),
        name=data.get("name", "Untitled"),
        description=data.get("description", ""),
        fps=data.get("fps", 24.0),
        sample_rate=data.get("sample_rate", 48000),
        created_at=data.get("created_at", ""),
        updated_at=data.get("updated_at", ""),
        script_text=data.get("script_text", ""),
        script_format=data.get("script_format", "plain"),
        audio_files=data.get("audio_files", []),
    )
    for s in data.get("scenes", []):
        project.scenes.append(
            ProjectScene(
                id=s.get("id", str(uuid.uuid4())),
                name=s.get("name", "Scene"),
                duration=s.get("duration", 60.0),
                dialogue=s.get("dialogue", []),
                markers=s.get("markers", []),
            )
        )
    for c in data.get("characters", []):
        project.characters.append(
            ProjectCharacter(
                id=c.get("id", str(uuid.uuid4())),
                name=c.get("name", ""),
                voice_profile_id=c.get("voice_profile_id"),
                description=c.get("description", ""),
            )
        )
    return project


def import_script(project: StandaloneProject, text: str, format: str = "plain") -> int:
    """Import a script into the project, creating scenes from it.

    Supports: plain text, Fountain screenplay format, Markdown, JSON.
    Returns number of scenes created.
    """
    project.script_text = text
    project.script_format = format

    if format == "fountain":
        scenes = _parse_fountain(text)
    elif format == "markdown":
        scenes = _parse_markdown(text)
    elif format == "json":
        scenes = _parse_json(text)
    else:
        scenes = _parse_plain_text(text)

    project.scenes = scenes
    project.updated_at = datetime.now(UTC).isoformat()
    return len(scenes)


def _parse_fountain(text: str) -> list[ProjectScene]:
    """Parse Fountain screenplay format into scenes."""
    scenes = []
    current_scene = None
    for line in text.split("\n"):
        line = line.strip()
        if line.startswith("=== "):
            if current_scene:
                scenes.append(current_scene)
            scene_name = line[4:].strip() or f"Scene {len(scenes) + 1}"
            current_scene = ProjectScene(
                id=str(uuid.uuid4()),
                name=scene_name,
            )
        elif current_scene and line:
            if line.startswith(("@", ".", "!")):
                continue
            if line.isupper() and len(line) < 60:
                current_scene.dialogue.append({"character": line, "text": ""})
            elif current_scene.dialogue and not current_scene.dialogue[-1].get("text"):
                current_scene.dialogue[-1]["text"] = line
            elif line:
                if not current_scene.dialogue:
                    current_scene.dialogue.append({"character": "Narrator", "text": line})
                else:
                    current_scene.dialogue[-1]["text"] += " " + line
    if current_scene:
        scenes.append(current_scene)
    if not scenes:
        scenes.append(ProjectScene(id=str(uuid.uuid4()), name="Scene 1"))
    return scenes


def _parse_markdown(text: str) -> list[ProjectScene]:
    """Parse Markdown into scenes using heading hierarchy.

    Headings (# ## ###) become scene boundaries. Paragraphs become dialogue.
    """
    try:
        from markdown_it import MarkdownIt
    except ImportError:
        # Fallback to plain text if markdown-it-py not available
        return _parse_plain_text(text)

    md = MarkdownIt()
    tokens = md.parse(text)

    scenes = []
    current_scene = None
    current_paragraph = []

    def flush_paragraph():
        nonlocal current_scene, current_paragraph
        if current_paragraph and current_scene:
            para_text = "\n".join(current_paragraph).strip()
            if para_text:
                if not current_scene.dialogue:
                    current_scene.dialogue.append({"character": "Narrator", "text": para_text})
                else:
                    current_scene.dialogue[-1]["text"] += " " + para_text
        current_paragraph = []

    in_heading = False
    heading_text = ""

    for token in tokens:
        if token.type == "heading_open":
            flush_paragraph()
            in_heading = True
            heading_text = ""
        elif token.type == "inline" and in_heading:
            heading_text = token.content.strip()
            if current_scene:
                scenes.append(current_scene)
            current_scene = ProjectScene(
                id=str(uuid.uuid4()),
                name=heading_text or f"Scene {len(scenes) + 1}",
            )
            in_heading = False
        elif token.type == "heading_close":
            in_heading = False
        elif token.type == "paragraph_open":
            continue
        elif token.type == "inline" and not in_heading:
            current_paragraph.append(token.content)
        elif token.type == "paragraph_close":
            flush_paragraph()
        # Skip code blocks, tables, lists, blockquotes, etc.

    flush_paragraph()
    if current_scene:
        scenes.append(current_scene)

    if not scenes:
        scenes.append(ProjectScene(id=str(uuid.uuid4()), name="Scene 1"))

    return scenes


def _parse_json(text: str) -> list[ProjectScene]:
    """Parse JSON script format into scenes.

    Expected format:
    {
        "scenes": [
            {
                "name": "Scene 1",
                "dialogue": [
                    {"character": "Alice", "text": "Hello"},
                    {"character": "Bob", "text": "Hi there"}
                ],
                "markers": []
            }
        ],
        "characters": [
            {"name": "Alice", "voice_profile_id": "..."},
            {"name": "Bob", "voice_profile_id": "..."}
        ]
    }
    """
    import json

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Fallback to plain text if invalid JSON
        return _parse_plain_text(text)

    scenes = []
    for s in data.get("scenes", []):
        scene = ProjectScene(
            id=str(uuid.uuid4()),
            name=s.get("name", "Scene"),
            duration=s.get("duration", 60.0),
        )
        for d in s.get("dialogue", []):
            scene.dialogue.append(
                {
                    "character": d.get("character", "Narrator"),
                    "text": d.get("text", ""),
                }
            )
        scene.markers = s.get("markers", [])
        scenes.append(scene)

    # If project has characters, update them
    if "characters" in data:
        # This is handled by the caller updating project.characters
        pass

    if not scenes:
        scenes.append(ProjectScene(id=str(uuid.uuid4()), name="Scene 1"))

    return scenes


def _parse_plain_text(text: str) -> list[ProjectScene]:
    """Parse plain text into a single scene with paragraphs as dialogue."""
    scenes = []
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    scene = ProjectScene(id=str(uuid.uuid4()), name="Imported Text")
    for i, para in enumerate(paragraphs):
        scene.dialogue.append(
            {
                "character": f"Line {i + 1}",
                "text": para,
            }
        )
    scenes.append(scene)
    return scenes


def list_builtin_templates() -> list[dict]:
    """List project templates for quick start."""
    return [
        {"id": "blank", "name": "Blank Project", "description": "Start from scratch"},
        {"id": "dialogue", "name": "Dialogue Scene", "description": "Two-character dialogue scene"},
        {"id": "podcast", "name": "Podcast Episode", "description": "Single-host podcast structure"},
        {"id": "audiobook", "name": "Audiobook Chapter", "description": "Narrator with character voices"},
        {"id": "short-film", "name": "Short Film", "description": "Multi-scene film structure"},
    ]

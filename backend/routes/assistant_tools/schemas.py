"""Tool schemas (OpenAI-style) exposed to the LLM.

The ``TOOLS`` list is assembled from the category modules under this package
to keep each file under the project's per-file line cap. The assistant can
call any of these; execution is backend-side via ``ENDPOINT_MAP`` +
``TOOL_METHODS``.
"""

from .tools_audio_prim import AUDIO_PRIM_TOOLS
from .tools_dialogue_studio import DIALOGUE_STUDIO_TOOLS
from .tools_file_io import FILE_IO_TOOLS
from .tools_generation import GENERATION_TOOLS
from .tools_instruments import INSTRUMENTS_TOOLS
from .tools_library import LIBRARY_TOOLS
from .tools_mcp_wired import MCP_WIRED_TOOLS
from .tools_projects import PROJECT_TOOLS
from .tools_session_models import SESSION_MODELS_TOOLS
from .tools_studio import STUDIO_TOOLS

TOOLS = (
    GENERATION_TOOLS
    + DIALOGUE_STUDIO_TOOLS
    + LIBRARY_TOOLS
    + FILE_IO_TOOLS
    + AUDIO_PRIM_TOOLS
    + SESSION_MODELS_TOOLS
    + INSTRUMENTS_TOOLS
    + PROJECT_TOOLS
    + STUDIO_TOOLS
    + MCP_WIRED_TOOLS
)

__all__ = [
    "AUDIO_PRIM_TOOLS",
    "DIALOGUE_STUDIO_TOOLS",
    "GENERATION_TOOLS",
    "INSTRUMENTS_TOOLS",
    "LIBRARY_TOOLS",
    "PROJECT_TOOLS",
    "SESSION_MODELS_TOOLS",
    "STUDIO_TOOLS",
    "TOOLS",
]

"""ORM model definitions for the otoyin SQLite database.

All model classes live in domain-specific modules under ``backend.database.*``
and are re-exported here so that ``from backend.database.models import X``
continues to work unchanged.
"""

from .audio_studio import (  # noqa: F401
    AudioStudioSession,
    CompingSession,
    LauncherSession,
    MixerSession,
    Project,
    SessionAutosaveSnapshot,
    StandaloneProjectRow,
)
from .audiobooks import (  # noqa: F401
    Audiobook,
    AudiobookChapter,
    AudiobookUtterance,
    AudiobookVoiceCast,
)
from .base import Base  # noqa: F401
from .conversation import (  # noqa: F401
    ADRLine,
    ADRSession,
    ADRTake,
    AgentMemory,
    Conversation,
    ConversationMessage,
    MCPClientBinding,
    ModelProvider,
)
from .generation import (  # noqa: F401
    EffectPreset,
    Generation,
    GenerationSettings,
    GenerationVersion,
)
from .library import (  # noqa: F401
    LibraryItemTag,
    LibraryTag,
)
from .marketplace import (  # noqa: F401
    Entitlement,
    InstalledPlugin,
    License,
    ProductReview,
)
from .misc import (  # noqa: F401
    AgentProject,
    AgentProjectSource,
    AppSetting,
    Capture,
    ClipboardHistory,
    ClipboardItem,
    CustomSkill,
    InstrumentPack,
    ModelDownload,
    SongDraft,
    TelemetryEvent,
)
from .settings import (  # noqa: F401
    AssistantSettings,
    CaptureSettings,
    PerformanceSettings,
)
from .stories import (  # noqa: F401
    Story,
    StoryEditSnapshot,
    StoryItem,
)
from .voice import (  # noqa: F401
    AudioChannel,
    ChannelDeviceMapping,
    ProfileChannelMapping,
    ProfileSample,
    VoiceChatSettings,
    VoiceProfile,
)

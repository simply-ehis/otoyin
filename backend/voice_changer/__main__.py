"""Standalone entry point for the headless voice-changer service.

Usage:
    python -m backend.voice_changer              # default 127.0.0.1:17494
    python -m backend.voice_changer --port 17495
    python -m backend.voice_changer --host 0.0.0.0 --port 17494
"""

import argparse
import logging
import os
import sys

import uvicorn

# Ensure the project root is on sys.path when run as `python -m backend.voice_changer`
_project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [voice-changer] %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("voice_changer")

DEFAULT_PORT = int(os.environ.get("VOICE_CHANGER_PORT", "17494"))
DEFAULT_HOST = os.environ.get("VOICE_CHANGER_HOST", "127.0.0.1")


def main() -> None:
    parser = argparse.ArgumentParser(description="otoyin headless voice-changer")
    parser.add_argument(
        "--host",
        type=str,
        default=DEFAULT_HOST,
        help="Host to bind to (use 0.0.0.0 for remote access)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help="Port to bind to",
    )
    args = parser.parse_args()

    logger.info("Starting voice-changer on %s:%d", args.host, args.port)

    uvicorn.run(
        "backend.voice_changer.server:create_app",
        host=args.host,
        port=args.port,
        reload=False,
        factory=True,
    )


if __name__ == "__main__":
    main()

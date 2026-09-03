"""Entry point for the otoyin backend.

Imports the configured FastAPI app and provides a ``python -m backend.main``
entry point for development.
"""

import argparse
import logging
import os
import sys

import uvicorn

from . import config, database
from .app import app  # noqa: F401 — re-exported for uvicorn `backend.main:app`

logger = logging.getLogger(__name__)


def _env_host() -> str:
    """Resolve server host: ``OTOYIN_HOST`` wins, legacy ``TWENTYLABS_HOST`` still honored."""
    return os.environ.get("OTOYIN_HOST") or os.environ.get("TWENTYLABS_HOST", "127.0.0.1")


def _env_port() -> int:
    """Resolve server port: ``OTOYIN_PORT`` wins, legacy ``TWENTYLABS_PORT`` still honored."""
    return int(os.environ.get("OTOYIN_PORT") or os.environ.get("TWENTYLABS_PORT", "17493"))


if __name__ == "__main__":
    if "TWENTYLABS_HOST" in os.environ and "OTOYIN_HOST" not in os.environ:
        logger.warning("TWENTYLABS_HOST is deprecated — use OTOYIN_HOST instead")
    if "TWENTYLABS_PORT" in os.environ and "OTOYIN_PORT" not in os.environ:
        logger.warning("TWENTYLABS_PORT is deprecated — use OTOYIN_PORT instead")
    parser = argparse.ArgumentParser(description="Otoyin backend server")
    parser.add_argument(
        "--host",
        type=str,
        default=_env_host(),
        help="Host to bind to (use 0.0.0.0 for remote access)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=_env_port(),
        help="Port to bind to",
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default=None,
        help="Data directory for database, profiles, and generated audio",
    )
    args = parser.parse_args()

    if args.data_dir:
        config.set_data_dir(args.data_dir)

    database.init_db()

    # Friendly port-in-use check before uvicorn's raw OSError traceback
    try:
        from .utils.port import require_port_free

        require_port_free(args.host, args.port, label="otoyin API")
    except OSError as e:
        print(f"\n{e}\n", file=sys.stderr)
        sys.exit(1)

    try:
        uvicorn.run(
            "backend.main:app",
            host=args.host,
            port=args.port,
            reload=False,
        )
    except OSError as e:
        # uvicorn wraps bind errors; surface the same friendly hint
        if "Address already in use" in str(e) or "address already in use" in str(e).lower():
            print(
                f"\nPort {args.port} on {args.host} is already in use. "
                f"Close the other process (just kill / lsof -i :{args.port}) "
                f"or use a different port: OTOYIN_PORT={args.port + 1} python -m backend.main --port {args.port + 1}\n",
                file=sys.stderr,
            )
            sys.exit(1)
        raise

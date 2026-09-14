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


def resolve_server_port(cli_port: int | None = None) -> int:
    """Resolve the serving port: explicit CLI flag > env > persisted
    in-app setting (``PUT /settings/server``) > 17493 default.

    The persisted setting lives in the data-dir SQLite ``app_settings``
    table and is read with stdlib sqlite3 (best-effort — any failure
    falls through to the default) so launchers that don't pass ``--port``
    still honor the in-app choice.
    """
    if cli_port:
        return cli_port
    env = os.environ.get("OTOYIN_PORT") or os.environ.get("TWENTYLABS_PORT")
    if env is not None:
        try:
            return int(env)
        except (ValueError, TypeError):
            logger.warning("Invalid port env value %r — trying persisted setting, else default", env)
    try:
        persisted = config.read_persisted_port()
        if persisted is not None:
            return persisted
    except Exception:
        pass
    return 17493


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
        default=None,
        help="Port to bind to (default: OTOYIN_PORT env, in-app setting, or 17493)",
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

    args.port = resolve_server_port(args.port)
    config.set_runtime_port(args.port)

    # Rendezvous file for the Tauri sidecar: it spawns us before any
    # frontend exists to tell it the port, and it cannot read SQLite
    # without a new dependency — but it shares our working directory, so
    # a tiny file under the data dir carries the bound port back.
    # Best-effort: a missing/stale file just means "use the default".
    try:
        runtime_dir = config.get_data_dir() / "runtime"
        runtime_dir.mkdir(parents=True, exist_ok=True)
        (runtime_dir / "backend_port.json").write_text(f'{{"port": {args.port}}}', encoding="utf-8")
    except Exception:
        pass

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

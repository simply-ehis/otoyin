"""Drive-by CSRF protection for mutating HTTP endpoints.

Threat model: the API binds to 127.0.0.1, but any webpage open in the
user's browser can fire "simple" cross-site POSTs at localhost with no
CORS preflight — reaching endpoints like ``/shutdown`` or the plugin
install chain while the studio runs.

Browsers always attach an ``Origin`` header on cross-site requests;
non-browser clients (curl, MCP clients, the Tauri shell) do not. The
guard is therefore deliberately one-sided: reject only when an Origin
IS present and is not in the trusted allowlist. That stops drive-by
pages without affecting any legitimate client.
"""

from __future__ import annotations

import logging

import starlette.responses
import starlette.types

logger = logging.getLogger(__name__)


class OriginGuardMiddleware:
    """Reject browser requests whose Origin is present but untrusted."""

    UNSAFE_METHODS = frozenset({"POST", "PUT", "DELETE", "PATCH"})

    def __init__(self, app, allowed_origins: list[str]) -> None:
        self.app = app
        self._allowed = set(allowed_origins)

    async def __call__(self, scope: starlette.types.Scope, receive, send) -> None:
        if scope["type"] == "http" and scope.get("method") in self.UNSAFE_METHODS:
            origin = None
            for key, value in scope.get("headers") or []:
                if key == b"origin":
                    origin = value.decode("latin-1")
                    break
            if origin and origin not in self._allowed:
                response = starlette.responses.JSONResponse(
                    status_code=403,
                    content={"detail": f"Cross-site request from untrusted origin rejected: {origin}"},
                )
                # Debug level: drive-by scanners could otherwise spam the log,
                # but keep enough context to diagnose false positives.
                logger.debug("OriginGuard rejected %s from origin %s", scope.get("path"), origin)
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)

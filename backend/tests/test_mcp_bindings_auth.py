import pytest
from fastapi import HTTPException

from backend.mcp_server.context import current_remote_addr
from backend.routes.mcp_bindings import _require_loopback_bindings


def test_binding_admin_allows_loopback():
    token = current_remote_addr.set("127.0.0.1")
    try:
        _require_loopback_bindings()
    finally:
        current_remote_addr.reset(token)


def test_binding_admin_denies_remote_clients():
    token = current_remote_addr.set("192.168.1.20")
    try:
        with pytest.raises(HTTPException) as exc:
            _require_loopback_bindings()
        assert exc.value.status_code == 403
    finally:
        current_remote_addr.reset(token)

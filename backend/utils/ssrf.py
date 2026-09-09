"""Shared SSRF guard for every network-egress path in the backend.

``is_url_safe`` rejects URLs that resolve to private, loopback, link-local
(including the cloud metadata endpoint 169.254.169.254) or unspecified
addresses. It is a *best-effort pre-check*: it validates the initial
hostname, not redirect targets, so callers that follow redirects (e.g.
yt-dlp) should additionally run inside a network-restricted context.

``is_host_allowed`` is stricter: it only permits an allowlisted set of
hosts, for cases where the backend must fetch a caller-supplied URL but
should only ever talk to a known domain (e.g. the Freesound preview CDN).
"""

from __future__ import annotations

import ipaddress
import os
import socket
from urllib.parse import urljoin, urlparse

import httpx

# Blocks: unspecified (0.0.0.0/8, ::/128), private (10/8, 172.16/12,
# 192.168/16), loopback (127/8, ::1), link-local (169.254/16, fe80::/10),
# ULA (fc00::/7), CGNAT shared space (100.64/10), and NAT64 translation
# space (64:ff9b::/96) which can wrap private v4 targets.
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("::/128"),
    ipaddress.ip_network("64:ff9b::/96"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def _scheme_ok(url: str, allowed_schemes: tuple[str, ...]) -> bool:
    """Scheme-only validation for the test loopback allowance (no host check)."""
    try:
        return urlparse(url).scheme in allowed_schemes
    except ValueError:
        return False


def _is_blocked(ip: object) -> bool:
    try:
        addr = ipaddress.ip_address(str(ip).split("%")[0])
        # Normalize IPv4-mapped IPv6 (::ffff:a.b.c.d) to its IPv4 form so
        # literals like [::ffff:127.0.0.1] can't dodge the v4 blocklist.
        if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
            addr = addr.ipv4_mapped
    except ValueError:
        return True
    return any(addr in net for net in _BLOCKED_NETWORKS)


# Read once at import (see is_url_safe docstring): E2E-only loopback allowance.
_ALLOW_LOOPBACK_FOR_TESTS = os.environ.get("OTOYIN_SSRF_ALLOW_LOOPBACK", "").strip() not in (
    "",
    "0",
    "false",
)


def is_url_safe(url: str, *, allowed_schemes=("http", "https")) -> bool:
    """Return True iff ``url`` uses an allowed scheme and resolves only to public IPs.

    Test escape hatch: when ``OTOYIN_SSRF_ALLOW_LOOPBACK`` is set to a truthy
    value, loopback/private targets are permitted. This exists for the E2E
    suites (test_marketplace_e2e, test_notices_e2e, ...) which boot fake
    services on 127.0.0.1 and point ``OTOYIN_CATALOG_URL``/``OTOYIN_NOTICES_URL``
    at them. The variable is read once at import; production builds never set
    it, and the shipped app config never does either.
    """
    if _ALLOW_LOOPBACK_FOR_TESTS:
        return _scheme_ok(url, allowed_schemes)
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in allowed_schemes:
        return False
    hostname = parsed.hostname
    if not hostname:
        return False
    # Bare IP literal — check directly, no DNS round-trip needed.
    if _is_blocked(hostname):
        return False
    # Hostname — resolve every A/AAAA record and reject if any is blocked.
    try:
        infos = socket.getaddrinfo(hostname, None)
    except (socket.gaierror, OSError, ValueError):
        return False
    return not any(_is_blocked(sockaddr[0]) for _f, _t, _p, _c, sockaddr in infos)


def is_host_allowed(url: str, allowed: set[str], *, allowed_schemes=("https",)) -> bool:
    """Return True only for an allowed scheme whose hostname is in ``allowed``."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in allowed_schemes:
        return False
    return parsed.hostname in allowed


def resolve_safe_redirects(url: str, *, max_hops: int = 6, timeout: float = 30.0) -> str:
    """Follow redirects manually, validating every hop resolves to a public IP.

    Clients that follow redirects internally (yt-dlp, ``requests``, etc.) bypass
    a hostname-only SSRF check on the *initial* URL: a 302 to
    ``http://169.254.169.254/`` or ``http://localhost:port`` would be followed
    before any guard runs. This resolves the chain ourselves and rejects any hop
    whose resolved address is private/loopback/link-local/metadata — closing the
    redirect-based SSRF bypass. Raises ``ValueError`` for unsafe URLs.
    """
    current = url
    for _ in range(max_hops):
        if not is_url_safe(current):
            raise ValueError(f"egress blocked to unsafe URL: {current}")
        resp = None
        try:
            resp = httpx.request("HEAD", current, follow_redirects=False, timeout=timeout)
            if resp.status_code in (405, 403, 501):
                resp.close()
                # Headers only — stream the GET so a hostile body is never
                # buffered into memory during the safety check itself.
                with httpx.stream("GET", current, follow_redirects=False, timeout=timeout) as get_resp:
                    status_code = get_resp.status_code
                    location = get_resp.headers.get("location")
            else:
                status_code = resp.status_code
                location = resp.headers.get("location")
        except httpx.HTTPError as exc:  # network/transport error on a safe URL
            raise RuntimeError(f"failed to resolve URL {current}: {exc}") from exc
        finally:
            if resp is not None:
                resp.close()
        if status_code in (301, 302, 303, 307, 308) and location:
            current = urljoin(current, location)
            continue
        if not is_url_safe(current):
            raise ValueError(f"egress blocked to unsafe URL: {current}")
        return current
    raise RuntimeError("too many redirects while resolving URL")

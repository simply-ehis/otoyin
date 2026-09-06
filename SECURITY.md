# Security Policy

## MCP server trust model (prompt 16)

The MCP server (`backend/mcp_server/`, namespace `21labs.*`) is
**local-only by construction**: the backend binds loopback by default
(`OTOYIN_HOST` defaults to `127.0.0.1`), and the MCP surface rides the same
in-process server — only local processes can reach it. No token gate exists
because loopback IS the gate. If remote mode ever exposes this server beyond
loopback, real authentication must land first; do not enable remote binds
without it. Marketplace admin routes (`/v1/notices`, crash reads) already
require Bearer `admin_key`; Paddle webhooks verify `Paddle-Signature`.

## Reporting a Vulnerability

If you discover a security vulnerability in otoyin, please report it by opening an issue or contacting the maintainers directly.

Please do not disclose security vulnerabilities publicly until they have been addressed.

## Scope

This security policy covers the otoyin application and its components.

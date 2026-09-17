#!/usr/bin/env bash
# Export the backend OpenAPI schema for client sync.
# The TS client (app/src/lib/api/) is hand-maintained per-domain; use the
# exported schema to check request/response shapes when adding endpoints.
# Backend must be running: just dev-backend (or TWENTYLABS_PORT=17494 just dev-backend).
set -euo pipefail
port=${TWENTYLABS_PORT:-17493}
host=${TWENTYLABS_HOST:-127.0.0.1}
out="app/src/lib/api/openapi.json"
curl -sf "http://$host:$port/openapi.json" -o "$out"
echo "Exported backend schema to $out — sync clientStories*/types.ts by hand."

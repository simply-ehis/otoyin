"""Vercel serverless entry point.

This file re-exports the FastAPI app for Vercel's serverless runtime.
All routes are handled by the FastAPI app — Vercel just invokes this function.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Add the marketplace directory to the path so imports work
sys.path.insert(0, str(Path(__file__).parent.parent))

from marketplace_server.app import app  # noqa: E402

# Vercel expects the FastAPI app to be exported as `app`
__all__ = ["app"]

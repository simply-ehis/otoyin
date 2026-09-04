# ── 21labs Backend — Railway Dockerfile ─────────────────────────────────
# Multi-stage build: slim Python image with only runtime deps.
# PyTorch CPU-only to keep image under 2GB.

FROM python:3.12-slim AS base

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps for audio processing and ML
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libsndfile1 \
    libfftw3-dev \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Install Python dependencies ────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Copy application code ──────────────────────────────────────────────
COPY . .

# ── Health check ───────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT:-17493}/health')" || exit 1

# ── Environment defaults (overridden by Railway) ───────────────────────
ENV OTOYIN_HOST=0.0.0.0 \
    OTOYIN_PORT=17493

EXPOSE 17493

CMD ["python", "-m", "backend.main", "--host", "0.0.0.0"]

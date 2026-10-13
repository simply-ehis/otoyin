FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8420

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir -r requirements.txt
COPY marketplace_server ./marketplace_server

EXPOSE 8420
CMD ["python", "-m", "uvicorn", "marketplace_server.app:app", "--host", "0.0.0.0", "--port", "8420"]

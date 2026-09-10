@echo off
cd /d C:\Users\ehis\Downloads\otoyin
set PYTHONUNBUFFERED=1
backend\venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 17493

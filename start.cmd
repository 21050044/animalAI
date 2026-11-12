@echo off
chcp 65001 >nul
cd /d "%~dp0"
title AnimalAI - Xuong AI nhan dien dong vat
where python >nul 2>nul && goto py
where py >nul 2>nul && goto pylauncher
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
goto end
:py
python server.py
goto end
:pylauncher
py server.py
:end
pause

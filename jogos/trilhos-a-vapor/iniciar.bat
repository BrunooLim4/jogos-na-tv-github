@echo off
chcp 65001 >nul
title Trilhos a Vapor na TV
cd /d "%~dp0"

if not exist node_modules (
  echo Instalando o que falta (so na primeira vez^)...
  call npm install --no-audit --no-fund
)

set OPEN_BROWSER=1
node server.js
pause

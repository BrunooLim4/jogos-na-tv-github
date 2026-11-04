@echo off
chcp 65001 >nul
title Robôs de teste - Lobisomem
cd /d "%~dp0"
echo.
echo   Abra primeiro o iniciar.bat (o jogo precisa estar ligado).
echo   Os robôs entram na sala assim que você entrar pelo celular.
echo   Você é o líder: de dia, toque em "Votar agora" para não esperar o relógio.
echo   Para tirar os robôs, feche esta janela.
echo.
node tools\robos.mjs 3 120
pause

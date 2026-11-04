@echo off
chcp 65001 >nul
title Robôs de teste - Resistência
cd /d "%~dp0"
echo.
echo   Abra primeiro o iniciar.bat (o jogo precisa estar ligado).
echo   Os robôs entram na sala assim que você entrar pelo celular.
echo   Para tirar os robôs, feche esta janela.
echo.
node tools\robos.mjs 4 120
pause

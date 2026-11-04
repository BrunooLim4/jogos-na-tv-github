@echo off
chcp 65001 >nul
title Robôs de teste - Operação Sombras
cd /d "%~dp0"
echo.
echo   Abra primeiro o iniciar.bat (o jogo precisa estar ligado).
echo   3 robôs entram na sala assim que você entrar pelo celular
echo   (com você, dá 4: dois times de 2).
echo   Para tirar os robôs, feche esta janela.
echo.
node tools\robos.mjs 3 120
pause

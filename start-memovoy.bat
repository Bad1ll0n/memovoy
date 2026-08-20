@echo off
REM ============================================================
REM  start-memovoy.bat
REM  Arranca a API (memovoy-api) e a Web (memovoy-web) em
REM  janelas separadas, cada uma a correr "npm run dev".
REM
REM  Coloca este ficheiro na pasta raiz do projeto:
REM    C:\Users\Badillon\memovoy\start-memovoy.bat
REM ============================================================

setlocal
set ROOT=%~dp0

echo Arrancar API (memovoy-api) em nova janela...
start "MemoVoy API" cmd /k "cd /d %ROOT%memovoy-api && npm run dev"

echo Arrancar Web (memovoy-web) em nova janela...
start "MemoVoy Web" cmd /k "cd /d %ROOT%memovoy-web && npm run dev"

echo.
echo Ambos os servicos foram lancados em janelas separadas:
echo   - API: http://localhost:4000
echo   - Web: http://localhost:3000
echo.
echo Fecha as respetivas janelas de cmd para parar cada servico.
endlocal

@echo off
REM sync.bat — Sincroniza Project_Roteiros com o bundle mais recente e envia para o GitHub
REM Uso: corre este script sempre que receberes um memovoy.bundle novo do Claude,
REM      colocando-o na MESMA pasta onde está este sync.bat (a raiz do repo).

setlocal enabledelayedexpansion

echo ===============================================
echo   MemoVoy — Sincronizacao com GitHub
echo ===============================================
echo.

REM Verificar que estamos dentro de um repo Git
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Esta pasta nao e um repositorio Git.
    echo Corre primeiro: git clone memovoy.bundle .
    pause
    exit /b 1
)

REM Verificar que o bundle existe nesta pasta
if not exist "memovoy.bundle" (
    echo [ERRO] memovoy.bundle nao encontrado nesta pasta.
    echo Coloca o ficheiro mais recente aqui antes de correr o sync.
    pause
    exit /b 1
)

echo [1/5] A verificar mudancas locais nao commitadas...
git status --porcelain > "%TEMP%\memovoy_status.txt"
for /f %%i in ("%TEMP%\memovoy_status.txt") do set SIZE=%%~zi

if not "!SIZE!"=="0" (
    echo.
    echo Tens mudancas locais nao guardadas:
    git status --short
    echo.
    set /p COMMITMSG="Mensagem para o commit destas mudancas (ou ENTER para ignorar): "
    if not "!COMMITMSG!"=="" (
        git add -A
        git commit -m "!COMMITMSG!"
        echo [OK] Commit local criado.
    ) else (
        echo [AVISO] Mudancas locais NAO guardadas. Continua por tua conta e risco.
    )
)
del "%TEMP%\memovoy_status.txt" >nul 2>&1

echo.
echo [2/5] A aplicar o bundle mais recente...
git fetch memovoy.bundle main:bundle-main 2>nul
if errorlevel 1 (
    echo [ERRO] Falha ao ler o bundle. Verifica se o ficheiro nao esta corrompido.
    pause
    exit /b 1
)

echo.
echo [3/5] A fazer merge das novidades do bundle em main...
git checkout main
git merge bundle-main --no-edit
if errorlevel 1 (
    echo.
    echo [CONFLITO] Houve conflitos no merge. Resolve manualmente:
    echo   1. Abre os ficheiros marcados com conflito
    echo   2. git add ^<ficheiros resolvidos^>
    echo   3. git commit
    echo   4. Corre este script outra vez
    pause
    exit /b 1
)
git branch -D bundle-main >nul 2>&1

echo.
echo [4/5] A sincronizar branch develop...
git fetch memovoy.bundle develop:bundle-develop 2>nul
if not errorlevel 1 (
    git checkout develop 2>nul
    git merge bundle-develop --no-edit 2>nul
    git branch -D bundle-develop >nul 2>&1
    git checkout main
)

echo.
echo [5/5] A enviar para o GitHub...
git push origin main
git push origin develop 2>nul

echo.
echo ===============================================
echo   Sincronizacao concluida!
echo   Repositorio: https://github.com/Bad1ll0n/memovoy
echo ===============================================
echo.
pause

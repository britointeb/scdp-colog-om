@echo off
setlocal
cd /d "%~dp0"
set "SCDP_NODE="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined SCDP_NODE set "SCDP_NODE=%%N"
if not defined SCDP_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "SCDP_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined SCDP_NODE (
  echo Node.js nao foi encontrado. Instale uma versao LTS do Node.js e abra novamente este arquivo.
  pause
  exit /b 1
)
"%SCDP_NODE%" scripts\iniciar.mjs %*
if errorlevel 1 (
  echo.
  echo O painel nao pode ser iniciado. Consulte a mensagem acima e o README.md.
  pause
)
endlocal

@echo off
REM Envoie les commits locaux sur GitHub (berullekkb/rag-agentique-rgpd)
chcp 65001 >nul
cd /d "%~dp0"
git push -u origin main
if errorlevel 1 (echo *** Le push a echoue *** & pause & exit /b 1)
echo Publie sur https://github.com/berullekkb/rag-agentique-rgpd
timeout /t 5 >nul

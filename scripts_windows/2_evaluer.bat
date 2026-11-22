@echo off
REM ==========================================================================
REM  2) Evaluation RAGAS comparative : RAG avance (baseline) vs RAG agentique
REM     Les arguments sont transmis au script, ex. :
REM       2_evaluer.bat --limit 3
REM       2_evaluer.bat --gold gold_set.json gold_set2.json
REM     Le script est reprenable : relancer reprend la ou il s'etait arrete.
REM ==========================================================================
chcp 65001 >nul
cd /d "%~dp0.."
set PY=python
if exist "venv\Scripts\python.exe" set PY=venv\Scripts\python.exe
set PYTHONUTF8=1
%PY% -c "import ragas, datasets" 2>nul || (echo Installation de RAGAS sans scikit-network ^(inutile pour la notation, ne compile pas sous Python 3.14^)... & %PY% -m pip install --no-deps "ragas==0.4.4" & %PY% -m pip install "datasets>=4.0.0" tiktoken nest-asyncio appdirs "diskcache>=5.6.3" typer rich "openai>=1.0.0" instructor "pillow>=10.4.0" networkx tenacity langchain-openai)
%PY% -c "import transformers, sentence_transformers" 2>nul || (echo Remise en ordre de huggingface-hub... & %PY% -m pip install "huggingface-hub>=1.5.0,<2.0" "datasets==5.0.0")
%PY% -c "import ragas.llms" 2>nul || (echo Mise a jour de RAGAS 0.4.4... & %PY% -m pip install --no-deps "ragas==0.4.4")
%PY% -u evaluation\evaluation_comparative.py %*
if errorlevel 1 (echo. & echo *** L'evaluation s'est arretee sur une erreur : voir evaluation\results\run_log.txt *** & pause)
exit /b %errorlevel%

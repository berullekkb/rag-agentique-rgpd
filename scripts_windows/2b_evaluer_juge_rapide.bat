@echo off
REM Evaluation avec un juge plus rapide (qwen2.5:7b au lieu de qwen2.5:14b)
call "%~dp02_evaluer.bat" --judge-model qwen2.5:7b %*

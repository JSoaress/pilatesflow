@echo off
title PilatesFlow - porta 3004
cd /d C:\pilates\pilatesflow
echo Iniciando o PilatesFlow em http://localhost:3004 ...
call npx next dev --turbopack -p 3004
pause

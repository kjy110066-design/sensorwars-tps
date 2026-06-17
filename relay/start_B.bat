@echo off
chcp 65001 > nul
echo.
echo ╔══════════════════════════════════════════╗
echo ║      SENSOR WARS 릴레이 - Player B        ║
echo ╚══════════════════════════════════════════╝
echo.

REM ─── 설정 ───────────────────────────────────────────
REM 아래 두 줄을 본인 환경에 맞게 수정하세요.

set SERIAL_PORT=COM4
set SERVER_URL=ws://localhost:3000

REM ────────────────────────────────────────────────────

set PLAYER=B
node relay.js %PLAYER% %SERIAL_PORT% %SERVER_URL%
pause

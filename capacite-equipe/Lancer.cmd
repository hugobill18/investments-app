@echo off
rem Launches the Team Capacity app, passing along the Windows login for
rem automatic sign-in. Keep this file in the same folder as index.html.
setlocal
set "P=%~dp0index.html"
set "P=%P:\=/%"
set "URL=file:///%P%?login=%USERNAME%"
rem Edge ships on every Windows 10/11 PC; fall back to the default browser.
start "" msedge "%URL%" || start "" "%URL%"
endlocal

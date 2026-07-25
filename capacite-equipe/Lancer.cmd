@echo off
rem Lance l'application Capacite Equipe en transmettant le login Windows
rem pour la connexion automatique. A garder dans le meme dossier que index.html.
setlocal
set "P=%~dp0index.html"
set "P=%P:\=/%"
set "URL=file:///%P%?login=%USERNAME%"
rem Edge est present sur tous les Windows 10/11 ; sinon navigateur par defaut.
start "" msedge "%URL%" || start "" "%URL%"
endlocal

@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set /p "BRANCH=What branch should be used for this build? "
if "%BRANCH%"=="" (
  echo Branch name cannot be empty.
  exit /b 1
)

set /p "COMMIT_MESSAGE=What commit message should be used? "
if "%COMMIT_MESSAGE%"=="" (
  echo Commit message cannot be empty.
  exit /b 1
)

echo ^>^> git fetch origin
git fetch origin
if errorlevel 1 exit /b 1

git show-ref --verify --quiet "refs/heads/%BRANCH%"
if %errorlevel%==0 (
  echo ^>^> git checkout %BRANCH%
  git checkout %BRANCH%
  if errorlevel 1 exit /b 1
) else (
  git ls-remote --exit-code --heads origin %BRANCH% >nul 2>nul
  if %errorlevel%==0 (
    echo ^>^> git checkout -b %BRANCH% origin/%BRANCH%
    git checkout -b %BRANCH% origin/%BRANCH%
    if errorlevel 1 exit /b 1
  ) else (
    echo ^>^> git checkout -b %BRANCH%
    git checkout -b %BRANCH%
    if errorlevel 1 exit /b 1
  )
)

echo ^>^> git add -A
git add -A
if errorlevel 1 exit /b 1

git diff --cached --quiet
if %errorlevel%==0 (
  echo No staged changes to commit. Skipping commit step.
) else (
  echo ^>^> git commit -m "%COMMIT_MESSAGE%"
  git commit -m "%COMMIT_MESSAGE%"
  if errorlevel 1 exit /b 1
)

echo ^>^> git push -u origin %BRANCH%
git push -u origin %BRANCH%
if errorlevel 1 exit /b 1

set "DOCKER_REPO=%DOCKER_IMAGE_REPO%"
if "%DOCKER_REPO%"=="" set "DOCKER_REPO=sortedsheep/oxidized-core"

set "BRANCH_TAG=%BRANCH%"
set "BRANCH_TAG=%BRANCH_TAG:\=-%"
set "BRANCH_TAG=%BRANCH_TAG:/=-%"
set "BRANCH_TAG=%BRANCH_TAG: =-%"

echo ^>^> docker build -t %DOCKER_REPO%:latest -t %DOCKER_REPO%:%BRANCH_TAG% .
docker build -t %DOCKER_REPO%:latest -t %DOCKER_REPO%:%BRANCH_TAG% .
if errorlevel 1 exit /b 1

echo ^>^> docker push %DOCKER_REPO%:latest
docker push %DOCKER_REPO%:latest
if errorlevel 1 exit /b 1

echo ^>^> docker push %DOCKER_REPO%:%BRANCH_TAG%
docker push %DOCKER_REPO%:%BRANCH_TAG%
if errorlevel 1 exit /b 1

echo.
echo Done.
echo Git branch pushed: %BRANCH%
echo Docker tags pushed: %DOCKER_REPO%:latest and %DOCKER_REPO%:%BRANCH_TAG%
exit /b 0

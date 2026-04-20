@echo off
REM ============================================================
REM mjmap - 로컬 개발 서버 원클릭 실행
REM   proxy.py     : 8080 포트 (CORS 프록시)
REM   http.server  : 3000 포트 (정적 index.html)
REM   브라우저 자동: http://localhost:3000
REM 종료: 각 cmd 창에서 Ctrl+C 또는 창 닫기
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0"

REM Python 실행 명령 자동 감지
set "PYEXE="
where python >nul 2>nul && set "PYEXE=python"
if not defined PYEXE where py >nul 2>nul && set "PYEXE=py"
if not defined PYEXE (
    echo [ERROR] Python not found in PATH. Install from python.org and check "Add to PATH".
    pause
    exit /b 1
)
echo [info] Python: %PYEXE%

REM 프록시 환경변수 (localhost:3000 Origin 허용)
REM API 키(OPINET_API_KEY, GG_API_KEY) 는 같은 폴더의 .env 에서 proxy.py 가 자동 로드합니다.
REM   - .env 파일이 없으면 /api/gas /api/gg 엔드포인트는 500 을 반환합니다.
REM   - 템플릿: .env.example 참고 (cp .env.example .env 후 값 채우기)
set "ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost,http://127.0.0.1"
set "ALLOWED_UPSTREAM_HOSTS=openapi.gg.go.kr,opinet.co.kr,dapi.kakao.com"
set "PORT=8080"

REM 서버 2개 동시 실행 (별도 cmd 창)
start "mjmap-proxy 8080" cmd /k "%PYEXE% proxy.py"
start "mjmap-web 3000" cmd /k "%PYEXE% -m http.server 3000"

timeout /t 2 >nul
start "" http://localhost:3000

echo.
echo [info] Two servers are running in separate windows.
echo [info] Web:    http://localhost:3000
echo [info] Proxy:  http://localhost:8080/health
echo.
pause

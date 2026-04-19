"""
간단한 CORS 프록시 서버 (보안 강화판)
================================
경기도 공공데이터 API / Opinet API 가 CORS 차단될 경우 이 스크립트를 실행하세요.

로컬 실행:
  python proxy.py
  → http://localhost:8080 에서 프록시 실행

Synology NAS / Docker / Render 배포:
  - 환경변수 PORT            : 리스닝 포트 (default 8080)
  - 환경변수 ALLOWED_ORIGINS : CORS 허용 Origin (콤마 구분)
      default: https://stepersjmj-hash.github.io,http://localhost,http://127.0.0.1
  - 환경변수 ALLOWED_UPSTREAM_HOSTS : 프록시가 중계 허용하는 upstream 호스트 (콤마 구분, 부분일치)
      default: openapi.gg.go.kr,opinet.co.kr,dapi.kakao.com

  index.html 의 API_BASE 예시:
    const API_BASE = 'https://stepersjmj.synology.me/mjmap-proxy/proxy?url=https://openapi.gg.go.kr';
"""

import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs, unquote, quote, urlsplit, urlunsplit
from urllib.request import urlopen, Request, HTTPRedirectHandler, build_opener
from urllib.error import HTTPError, URLError
import traceback


# ─── 보안 설정 (환경변수) ───────────────────────────────────────────────
# Origin 허용 목록 (브라우저가 보내는 Origin 헤더와 일치 여부 확인)
_DEFAULT_ORIGINS = "https://stepersjmj-hash.github.io,http://localhost,http://127.0.0.1"
ALLOWED_ORIGINS = [
    o.strip().rstrip('/')
    for o in os.environ.get('ALLOWED_ORIGINS', _DEFAULT_ORIGINS).split(',')
    if o.strip()
]

# Upstream 호스트 허용 목록 (target URL 의 hostname 이 이 중 하나를 포함해야 함)
_DEFAULT_UPSTREAM = "openapi.gg.go.kr,opinet.co.kr,dapi.kakao.com"
ALLOWED_UPSTREAM_HOSTS = [
    h.strip().lower()
    for h in os.environ.get('ALLOWED_UPSTREAM_HOSTS', _DEFAULT_UPSTREAM).split(',')
    if h.strip()
]

print(f"[proxy] 🔐 ALLOWED_ORIGINS = {ALLOWED_ORIGINS}")
print(f"[proxy] 🔐 ALLOWED_UPSTREAM_HOSTS = {ALLOWED_UPSTREAM_HOSTS}")


def _origin_allowed(origin: str) -> bool:
    """Origin 헤더가 허용 목록에 있는지 확인. Origin 이 없으면 True(직접 호출 허용)."""
    if not origin:
        return True
    origin = origin.rstrip('/')
    return origin in ALLOWED_ORIGINS


def _upstream_allowed(target_url: str) -> bool:
    """target URL 의 hostname 이 허용 목록 중 하나와 정확히 같거나, 그 서브도메인이면 허용.

    예) 'opinet.co.kr' 허용 시 → 'www.opinet.co.kr' OK, 'opinet.co.kr.evil.com' NG.
    """
    try:
        host = (urlparse(target_url).hostname or '').lower()
    except Exception:
        return False
    if not host:
        return False
    for allowed in ALLOWED_UPSTREAM_HOSTS:
        allowed = allowed.lower()
        if host == allowed or host.endswith('.' + allowed):
            return True
    return False


class DebugRedirectHandler(HTTPRedirectHandler):
    """리다이렉트 발생 시 Location 헤더를 콘솔에 출력하고 계속 따라감"""
    def http_error_301(self, req, fp, code, msg, headers):
        self._log(code, headers)
        return HTTPRedirectHandler.http_error_301(self, req, fp, code, msg, headers)
    def http_error_302(self, req, fp, code, msg, headers):
        self._log(code, headers)
        return HTTPRedirectHandler.http_error_302(self, req, fp, code, msg, headers)
    def http_error_303(self, req, fp, code, msg, headers):
        self._log(code, headers)
        return HTTPRedirectHandler.http_error_303(self, req, fp, code, msg, headers)
    def http_error_307(self, req, fp, code, msg, headers):
        self._log(code, headers)
        return HTTPRedirectHandler.http_error_307(self, req, fp, code, msg, headers)
    def _log(self, code, headers):
        location = headers.get('Location', '(Location 헤더 없음)')
        print(f"[proxy] 🔀 {code} redirect → {location}")


def _safe_url(raw_url):
    """한글 등 non-ASCII 문자를 포함한 URL을 urlopen이 처리할 수 있도록 안전하게 인코딩."""
    parts = urlsplit(raw_url)
    # path: non-ASCII만 quote (기존 %xx는 유지하려고 safe 매개변수 사용)
    safe_path = quote(parts.path, safe="/%:@!$&'()*+,;=~-._")
    # query: & 와 = 구분자는 유지하고 값의 non-ASCII만 인코딩
    safe_query = quote(parts.query, safe="=&%:@!$'()*+,;?/~-._")
    return urlunsplit((parts.scheme, parts.netloc, safe_path, safe_query, parts.fragment))


class ProxyHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        # 요청 Origin 이 허용 목록에 있으면 그 값을 그대로 반환, 아니면 기본값
        origin = self.headers.get('Origin', '')
        if origin and _origin_allowed(origin):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        else:
            # Origin 헤더가 없는 경우 (curl / 서버간 호출) → 첫 번째 허용 Origin 을 반환
            self.send_header('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] if ALLOWED_ORIGINS else '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')

    def _write_err(self, code, msg):
        try:
            self.send_response(code)
            self._send_cors_headers()
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(msg.encode('utf-8', errors='replace'))
        except Exception:
            pass

    def do_OPTIONS(self):
        # preflight 도 Origin 검증
        origin = self.headers.get('Origin', '')
        if origin and not _origin_allowed(origin):
            self._write_err(403, f'Origin not allowed: {origin}')
            return
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            # 헬스체크 (Render/Synology/Docker 등에서 / 로 핑 보낼 때 대응)
            # 헬스체커는 헤더만 확인하고 바디 읽기 전에 연결을 닫는 경우가 있어
            # BrokenPipe/ConnectionReset 예외는 정상으로 간주하고 조용히 무시
            if parsed.path in ('/', '/health', '/healthz'):
                try:
                    self.send_response(200)
                    self._send_cors_headers()
                    self.send_header('Content-Type', 'text/plain; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(b'OK - mjmap proxy is running. Use /proxy?url=<target>')
                except (BrokenPipeError, ConnectionResetError):
                    pass
                return

            if not parsed.path.startswith('/proxy'):
                self._write_err(404, 'Use /proxy?url=<target>')
                return

            # ─── Origin 검증 ────────────────────────────────────────
            origin = self.headers.get('Origin', '')
            if origin and not _origin_allowed(origin):
                print(f"[proxy] 🚫 403 Origin not allowed: {origin}")
                self._write_err(403, f'Origin not allowed: {origin}')
                return

            qs = parse_qs(parsed.query, keep_blank_values=True)
            if 'url' not in qs:
                self._write_err(400, 'Missing url parameter')
                return

            target = qs['url'][0]  # parse_qs는 이미 unquote 처리함

            # ─── Upstream 호스트 화이트리스트 검증 ──────────────────
            if not _upstream_allowed(target):
                host = urlparse(target).hostname or '(invalid)'
                print(f"[proxy] 🚫 403 Upstream host not allowed: {host}")
                self._write_err(403, f'Upstream host not allowed: {host}')
                return

            extra_params = {k: v for k, v in qs.items() if k != 'url'}
            if extra_params:
                # 값을 URL 인코딩 (한글 등 non-ASCII 안전 처리)
                extra_qs = '&'.join(f"{quote(k, safe='')}={quote(v[0], safe='')}" for k, v in extra_params.items())
                connector = '&' if '?' in target else '?'
                target = f"{target}{connector}{extra_qs}"

            # 최종 URL 안전 인코딩 (urlopen은 ASCII만 허용)
            safe_target = _safe_url(target)
            print(f"[proxy] → {safe_target}")

            try:
                headers = {'User-Agent': 'Mozilla/5.0 (MJ-Map Proxy)'}
                # 클라이언트가 보낸 Authorization 헤더 (Kakao KakaoAK 등) 전달
                if 'Authorization' in self.headers:
                    headers['Authorization'] = self.headers['Authorization']
                # Opinet은 Referer 검증이 있을 가능성 — 브라우저처럼 보이게 헤더 보강
                if 'opinet.co.kr' in safe_target:
                    headers['Referer'] = 'https://www.opinet.co.kr/'
                    headers['User-Agent'] = (
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                        'AppleWebKit/537.36 (KHTML, like Gecko) '
                        'Chrome/122.0.0.0 Safari/537.36'
                    )
                    print(f"[proxy] 🔑 Opinet 요청 — Referer/UA 보강 적용")
                req = Request(safe_target, headers=headers)
                opener = build_opener(DebugRedirectHandler())
                # timeout: 30 → 60 (경기도 API 가 큰 pSize 요청에 느릴 때 대비)
                with opener.open(req, timeout=60) as resp:
                    content_type = resp.headers.get('Content-Type', 'application/json; charset=utf-8')
                    final_url = resp.url
                    if final_url != safe_target:
                        print(f"[proxy] ✅ 최종 URL: {final_url}")
                    print(f"[proxy] ← {resp.status} {content_type} (스트리밍 시작)")

                    # 헤더부터 즉시 클라이언트에 전달 (응답 첫 바이트가 빨라짐)
                    self.send_response(200)
                    self.send_header('Content-Type', content_type)
                    self._send_cors_headers()
                    self.end_headers()

                    # 8KB chunk 단위로 upstream 에서 읽으면서 바로 클라이언트에 write
                    # 이점: (1) 메모리 사용량 최소화, (2) upstream 이 천천히 보내도 timeout 회피,
                    #       (3) 디버깅용 preview 는 첫 chunk 만 출력
                    total = 0
                    first_preview = None
                    chunk_size = 8192
                    while True:
                        try:
                            chunk = resp.read(chunk_size)
                        except TimeoutError as te:
                            # 스트리밍 도중 timeout — 이미 전송한 데이터는 살리고 로그만 남김
                            print(f"[proxy] ⏱️  upstream read timeout (전송 {total} bytes 까지): {te}")
                            return
                        if not chunk:
                            break
                        if first_preview is None:
                            first_preview = chunk[:200]
                        try:
                            self.wfile.write(chunk)
                            total += len(chunk)
                        except (BrokenPipeError, ConnectionResetError) as cce:
                            # 클라이언트가 연결을 끊었음 — 정상 케이스, 조용히 종료
                            print(f"[proxy] ⚠️  클라이언트 연결 끊김 (전송 {total} bytes): {cce}")
                            return
                    print(f"[proxy] ← 전송 완료 {total} bytes / preview: {first_preview!r}")
            except HTTPError as e:
                # upstream 이 4xx/5xx 응답 — 본문(에러 페이지)을 클라이언트에 전달
                err_body = b''
                try:
                    err_body = e.read() if hasattr(e, 'read') else b''
                except Exception:
                    pass
                detail = f'HTTP {e.code} {e.reason}'
                preview = err_body[:200] if err_body else b'(empty)'
                print(f"[proxy] ❌ HTTPError {detail} / preview: {preview!r}")
                self.send_response(e.code)
                self._send_cors_headers()
                self.send_header('Content-Type', e.headers.get('Content-Type', 'text/plain'))
                self.end_headers()
                try:
                    self.wfile.write(err_body if err_body else f'Upstream {detail}'.encode('utf-8', errors='replace'))
                except (BrokenPipeError, ConnectionResetError):
                    pass
            except URLError as e:
                # 네트워크/TLS/timeout 등 (Opinet IP 차단 케이스도 여기로)
                reason = getattr(e, 'reason', e)
                print(f"[proxy] ❌ URLError: {reason!r}")
                self._write_err(502, f'Upstream URLError: {reason}')
        except Exception as e:
            print(f"[proxy] 예외 발생: {e}")
            traceback.print_exc()
            self._write_err(500, f'Proxy error: {e}')

    def log_message(self, fmt, *args):
        print(f"[proxy] {self.address_string()} - {fmt % args}")


def main():
    # Render / Heroku 등 PaaS 는 PORT 환경변수로 포트를 지정함. 없으면 로컬용 8080.
    port = int(os.environ.get('PORT', 8080))
    server = HTTPServer(('0.0.0.0', port), ProxyHandler)
    print(f"🚀 CORS 프록시 서버가 포트 {port} 에서 실행 중입니다. (0.0.0.0:{port})")
    print(f"   헬스체크:  /  또는  /health")
    print(f"   사용 예:   /proxy?url=https://openapi.gg.go.kr/RegionMnyFacltStus&KEY=...&Type=json")
    print("   Ctrl+C 로 종료")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[proxy] 종료합니다.")
        server.server_close()


if __name__ == '__main__':
    main()

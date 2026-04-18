"""
간단한 CORS 프록시 서버
================================
경기도 공공데이터 API / Opinet API 가 CORS 차단될 경우 이 스크립트를 실행하세요.

로컬 실행:
  python proxy.py
  → http://localhost:8080 에서 프록시 실행

Render 등 클라우드 배포:
  - 환경변수 PORT 가 자동으로 주입됨
  - index.html 의 API_BASE 를 배포된 URL 로 교체
    예) const API_BASE = 'https://mjmap-proxy.onrender.com/proxy?url=https://openapi.gg.go.kr';

(추가 경로와 쿼리는 자동으로 append됩니다)
"""

import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs, unquote, quote, urlsplit, urlunsplit
from urllib.request import urlopen, Request, HTTPRedirectHandler, build_opener
from urllib.error import HTTPError, URLError
import traceback


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
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')

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
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            # 헬스체크 (Render 등에서 / 로 핑 보낼 때 대응)
            if parsed.path in ('/', '/health', '/healthz'):
                self.send_response(200)
                self._send_cors_headers()
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.end_headers()
                self.wfile.write(b'OK - mjmap proxy is running. Use /proxy?url=<target>')
                return

            if not parsed.path.startswith('/proxy'):
                self._write_err(404, 'Use /proxy?url=<target>')
                return

            qs = parse_qs(parsed.query, keep_blank_values=True)
            if 'url' not in qs:
                self._write_err(400, 'Missing url parameter')
                return

            target = qs['url'][0]  # parse_qs는 이미 unquote 처리함
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
                with opener.open(req, timeout=30) as resp:
                    body = resp.read()
                    content_type = resp.headers.get('Content-Type', 'application/json; charset=utf-8')
                    final_url = resp.url
                    if final_url != safe_target:
                        print(f"[proxy] ✅ 최종 URL: {final_url}")
                    print(f"[proxy] ← {resp.status} {content_type} / {len(body)} bytes / preview: {body[:200]!r}")
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(body)
            except HTTPError as e:
                err_body = b''
                try:
                    err_body = e.read() if hasattr(e, 'read') else b''
                except Exception:
                    pass
                self.send_response(e.code)
                self._send_cors_headers()
                self.send_header('Content-Type', e.headers.get('Content-Type', 'text/plain'))
                self.end_headers()
                self.wfile.write(err_body if err_body else str(e).encode('utf-8', errors='replace'))
            except URLError as e:
                self._write_err(502, f'Upstream error: {e}')
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

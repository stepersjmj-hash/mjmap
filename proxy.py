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
import re
import json
import math
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs, unquote, quote, urlsplit, urlunsplit
from urllib.request import urlopen, Request, HTTPRedirectHandler, build_opener
from urllib.error import HTTPError, URLError
import traceback

from coordinates import wgs84_to_katec, katec_to_wgs84, coord_self_test


# ─── .env 자동 로더 (stdlib only, 의존성 없음) ───────────────────────────
# proxy.py 와 같은 폴더의 `.env` 파일을 읽어 환경변수로 주입합니다.
# - 이미 셸/docker 가 설정한 값은 **절대 덮어쓰지 않음** (shell/docker 우선)
# - 빈 줄 / '#' 시작 주석 / '=' 없는 줄은 무시
# - 값 양옆 따옴표(" 또는 ')는 벗겨냄
# - 파일이 없으면 조용히 건너뜀 (로그만 남김)
def _load_dotenv(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, _, v = line.partition('=')
                k, v = k.strip(), v.strip()
                if len(v) >= 2 and v[0] == v[-1] and v[0] in ('"', "'"):
                    v = v[1:-1]
                if k and k not in os.environ:
                    os.environ[k] = v
        return True
    except FileNotFoundError:
        return False

_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if _load_dotenv(_ENV_PATH):
    print(f"[proxy] 📄 .env 로드됨: {_ENV_PATH}")
else:
    print(f"[proxy] ℹ️  .env 없음 — 환경변수는 shell/docker 에서만 읽음")


# ─── 튜닝 파라미터 (매직 넘버 한곳 모음) ─────────────────────────
MAX_OPINET_RADIUS_M   = 5000   # Opinet aroundAll API 제한 (m)
UPSTREAM_TIMEOUT_SEC  = 60     # 일반/경기도 upstream 타임아웃 (pSize 큰 요청 대응)
OPINET_TIMEOUT_SEC    = 30     # Opinet 추상 엔드포인트 타임아웃 (대체로 응답 빠름)
STREAM_CHUNK_SIZE     = 8192   # upstream → 클라이언트 스트리밍 청크 (bytes)
BROWSER_UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/122.0.0.0 Safari/537.36'
)
OPINET_REFERER = 'https://www.opinet.co.kr/'
PROXY_UA = 'Mozilla/5.0 (MJ-Map Proxy)'


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

# ─── 추상 엔드포인트용 서버 보관 API 키 ─────────────────────────
# 프론트는 이 키를 전혀 모름. /api/gas/around 등의 엔드포인트에서만 사용.
OPINET_API_KEY = os.environ.get('OPINET_API_KEY', '').strip()
if OPINET_API_KEY:
    print(f"[proxy] 🔑 OPINET_API_KEY 설정됨 (****{OPINET_API_KEY[-4:]})")
else:
    print(f"[proxy] ⚠️  OPINET_API_KEY 미설정 — /api/gas/around 엔드포인트 사용 불가")

GG_API_KEY = os.environ.get('GG_API_KEY', '').strip()
if GG_API_KEY:
    print(f"[proxy] 🔑 GG_API_KEY 설정됨 (****{GG_API_KEY[-4:]})")
else:
    print(f"[proxy] ⚠️  GG_API_KEY 미설정 — /api/gg/<service> 엔드포인트 사용 불가")

# 경기도 OpenAPI 서비스명 허용 패턴 (SSRF/경로 삽입 차단)
#   - 알파벳 시작, 영문/숫자/언더스코어만, 2~61자
_GG_SERVICE_RE = re.compile(r'^[A-Za-z][A-Za-z0-9_]{1,60}$')


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


# ============================================================
# KATEC ↔ WGS84 좌표 변환은 coordinates.py 로 분리되었습니다.
#   - wgs84_to_katec(lat°, lng°) -> (x_m, y_m)
#   - katec_to_wgs84(x_m, y_m)   -> (lat°, lng°)
#   - coord_self_test()          : 시작 시 정확도 점검
# ============================================================


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

    # ============================================================
    # 추상 엔드포인트: /api/gas/around
    # 클라이언트는 서버 API 키를 모름. 좌표도 WGS84 그대로 전달.
    # 서버에서: 키 주입 + KATEC 변환 + Opinet 호출 + XML→JSON + 역좌표변환
    # ============================================================
    def _handle_gas_around(self, parsed_url):
        qs = parse_qs(parsed_url.query, keep_blank_values=True)

        # 1) 입력 파싱 & 검증 (키 확인 전에 먼저 — 4xx 를 5xx 보다 우선 반환)
        try:
            lat    = float(qs.get('lat', [''])[0])
            lng    = float(qs.get('lng', [''])[0])
            radius = int(float(qs.get('radius', ['3000'])[0]))
            prodcd = qs.get('prodcd', ['B027'])[0]
        except (ValueError, IndexError) as e:
            self._write_err(400, f'Invalid parameters: {e}')
            return

        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            self._write_err(400, f'Coordinates out of range: lat={lat}, lng={lng}')
            return
        radius = max(1, min(radius, MAX_OPINET_RADIUS_M))  # Opinet 제한 5km

        _ALLOWED_PRODCD = {'B027', 'D047', 'B034', 'K015', 'C004'}
        if prodcd not in _ALLOWED_PRODCD:
            self._write_err(400, f'Unknown prodcd: {prodcd} (allowed: {sorted(_ALLOWED_PRODCD)})')
            return

        # 2) 서버 키 확인 (입력 검증 통과 후)
        if not OPINET_API_KEY:
            self._write_err(500, 'OPINET_API_KEY not configured on server')
            return

        # 3) WGS84 → KATEC
        try:
            kx, ky = wgs84_to_katec(lat, lng)
        except Exception as e:
            self._write_err(500, f'Coordinate conversion failed: {e}')
            return

        # 4) Opinet URL 구성 (서버 키 주입)
        opinet_url = (
            'https://www.opinet.co.kr/api/aroundAll.do'
            f'?code={quote(OPINET_API_KEY, safe="")}'
            f'&x={kx:.1f}&y={ky:.1f}'
            f'&radius={radius}&sort=1&prodcd={prodcd}&out=xml'
        )
        print(f"[proxy] 🛢️  gas/around → KATEC({kx:.1f}, {ky:.1f}) r={radius} prodcd={prodcd}")

        # 5) 호출 (Referer/UA 보강 — Opinet 방어 회피)
        try:
            req = Request(opinet_url, headers={
                'Referer': OPINET_REFERER,
                'User-Agent': BROWSER_UA,
            })
            opener = build_opener(DebugRedirectHandler())
            with opener.open(req, timeout=OPINET_TIMEOUT_SEC) as resp:
                xml_bytes = resp.read()
        except HTTPError as e:
            self._write_err(502, f'Opinet HTTPError: {e.code} {e.reason}')
            return
        except URLError as e:
            self._write_err(502, f'Opinet URLError: {getattr(e, "reason", e)}')
            return

        # 6) XML 파싱
        try:
            root = ET.fromstring(xml_bytes)
        except ET.ParseError as e:
            preview = xml_bytes[:200].decode('utf-8', errors='replace')
            self._write_err(502, f'Opinet XML parse error: {e} | preview: {preview}')
            return

        # 7) OIL 순회 + KATEC → WGS84 역변환
        items = []
        for oil in root.findall('.//OIL'):
            def _t(tag):
                el = oil.find(tag)
                return (el.text or '').strip() if el is not None else ''

            try:
                ox = float(_t('GIS_X_COOR'))
                oy = float(_t('GIS_Y_COOR'))
                w_lat, w_lng = katec_to_wgs84(ox, oy)
            except (ValueError, TypeError):
                continue  # 좌표 파싱 실패 → 스킵

            price_str    = _t('PRICE')
            distance_str = _t('DISTANCE')
            items.append({
                'id':         _t('UNI_ID'),
                'name':       _t('OS_NM'),
                'brand':      _t('POLL_DIV_CO'),    # SKE, GSC, SOL 등 (프론트에서 한글 매핑)
                'addr':       _t('NEW_ADR') or _t('VAN_ADR'),
                'tel':        _t('TEL'),
                'price':      int(price_str) if price_str.isdigit() else 0,
                'distance_m': int(float(distance_str)) if distance_str else 0,
                'prodcd':     prodcd,
                'lat':        round(w_lat, 6),
                'lng':        round(w_lng, 6),
            })

        # 8) JSON 응답
        payload = json.dumps({
            'count':  len(items),
            'prodcd': prodcd,
            'radius': radius,
            'items':  items
        }, ensure_ascii=False).encode('utf-8')

        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self._send_cors_headers()
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass
        print(f"[proxy] ← gas/around 반환 {len(items)}개 주유소")

    # ============================================================
    # 추상 엔드포인트: /api/gg/<service>
    # 경기도 OpenAPI 패스스루 — 서버가 GG_API_KEY 주입, JSON 스트리밍.
    # 예) /api/gg/RegionMnyFacltStus?pIndex=1&pSize=100&SIGUN_NM=수원시
    #  → https://openapi.gg.go.kr/RegionMnyFacltStus?KEY=<서버키>&Type=json&pIndex=1&...
    # ============================================================
    def _handle_gg_api(self, parsed_url):
        # 1) 서비스명 추출 & 검증 (SSRF 방지)
        service = parsed_url.path[len('/api/gg/'):].strip('/')
        if not _GG_SERVICE_RE.match(service):
            self._write_err(400, f'Invalid service name: {service!r}')
            return

        # 2) 서버 키 확인
        if not GG_API_KEY:
            self._write_err(500, 'GG_API_KEY not configured on server')
            return

        # 3) 쿼리 파라미터 파싱 — KEY 는 클라이언트가 보냈더라도 무시 (덮어쓰기 시도 차단)
        qs = parse_qs(parsed_url.query, keep_blank_values=True)
        qs.pop('KEY', None)
        qs.pop('key', None)

        # Type 기본값 json (클라이언트가 지정했다면 유지)
        if 'Type' not in qs and 'type' not in qs:
            qs['Type'] = ['json']

        # 4) URL 구성 (서버 키 주입)
        params = [f'KEY={quote(GG_API_KEY, safe="")}']
        for k, vs in qs.items():
            for v in vs:
                params.append(f'{quote(k, safe="")}={quote(v, safe="")}')
        upstream_url = f'https://openapi.gg.go.kr/{service}?' + '&'.join(params)

        # 로그에는 KEY 마스킹
        log_params = [f'KEY=****{GG_API_KEY[-4:]}'] + params[1:]
        log_url = f'https://openapi.gg.go.kr/{service}?' + '&'.join(log_params)
        print(f"[proxy] 🏛️  gg/{service} → {log_url}")

        # 5) 호출 + 스트리밍 (기존 /proxy 방식 재사용)
        try:
            req = Request(upstream_url, headers={'User-Agent': PROXY_UA})
            opener = build_opener(DebugRedirectHandler())
            with opener.open(req, timeout=UPSTREAM_TIMEOUT_SEC) as resp:
                content_type = resp.headers.get('Content-Type', 'application/json; charset=utf-8')
                print(f"[proxy] ← gg/{service} {resp.status} {content_type} (스트리밍 시작)")

                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self._send_cors_headers()
                self.end_headers()

                total = 0
                chunk_size = STREAM_CHUNK_SIZE
                while True:
                    try:
                        chunk = resp.read(chunk_size)
                    except TimeoutError as te:
                        print(f"[proxy] ⏱️  gg/{service} upstream timeout ({total} bytes): {te}")
                        return
                    if not chunk:
                        break
                    try:
                        self.wfile.write(chunk)
                        total += len(chunk)
                    except (BrokenPipeError, ConnectionResetError) as cce:
                        print(f"[proxy] ⚠️  gg/{service} 클라이언트 연결 끊김 ({total} bytes): {cce}")
                        return
                print(f"[proxy] ← gg/{service} 전송 완료 {total} bytes")
        except HTTPError as e:
            err_body = b''
            try:
                err_body = e.read() if hasattr(e, 'read') else b''
            except Exception:
                pass
            detail = f'HTTP {e.code} {e.reason}'
            preview = err_body[:200] if err_body else b'(empty)'
            print(f"[proxy] ❌ gg/{service} HTTPError {detail} / preview: {preview!r}")
            self.send_response(e.code)
            self._send_cors_headers()
            self.send_header('Content-Type', e.headers.get('Content-Type', 'text/plain'))
            self.end_headers()
            try:
                self.wfile.write(err_body if err_body else f'Upstream {detail}'.encode('utf-8', errors='replace'))
            except (BrokenPipeError, ConnectionResetError):
                pass
        except URLError as e:
            reason = getattr(e, 'reason', e)
            print(f"[proxy] ❌ gg/{service} URLError: {reason!r}")
            self._write_err(502, f'Upstream URLError: {reason}')

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

            # ─── 추상 엔드포인트: /api/gas/around ──────────────────
            # 서버 측 OPINET_API_KEY 주입 + KATEC 좌표변환까지 처리
            if parsed.path == '/api/gas/around':
                origin = self.headers.get('Origin', '')
                if origin and not _origin_allowed(origin):
                    print(f"[proxy] 🚫 403 Origin not allowed: {origin}")
                    self._write_err(403, f'Origin not allowed: {origin}')
                    return
                self._handle_gas_around(parsed)
                return

            # ─── 추상 엔드포인트: /api/gg/<service> ────────────────
            # 서버 측 GG_API_KEY 주입 + JSON 스트리밍 패스스루
            if parsed.path.startswith('/api/gg/'):
                origin = self.headers.get('Origin', '')
                if origin and not _origin_allowed(origin):
                    print(f"[proxy] 🚫 403 Origin not allowed: {origin}")
                    self._write_err(403, f'Origin not allowed: {origin}')
                    return
                self._handle_gg_api(parsed)
                return

            if not parsed.path.startswith('/proxy'):
                self._write_err(404, 'Use /proxy?url=<target>, /api/gas/around, or /api/gg/<service>')
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
                headers = {'User-Agent': PROXY_UA}
                # 클라이언트가 보낸 Authorization 헤더 (Kakao KakaoAK 등) 전달
                if 'Authorization' in self.headers:
                    headers['Authorization'] = self.headers['Authorization']
                # Opinet은 Referer 검증이 있을 가능성 — 브라우저처럼 보이게 헤더 보강
                if 'opinet.co.kr' in safe_target:
                    headers['Referer'] = OPINET_REFERER
                    headers['User-Agent'] = BROWSER_UA
                    print(f"[proxy] 🔑 Opinet 요청 — Referer/UA 보강 적용")
                req = Request(safe_target, headers=headers)
                opener = build_opener(DebugRedirectHandler())
                # timeout: 30 → 60 (경기도 API 가 큰 pSize 요청에 느릴 때 대비)
                with opener.open(req, timeout=UPSTREAM_TIMEOUT_SEC) as resp:
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
                    chunk_size = STREAM_CHUNK_SIZE
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
    # 좌표 변환 자체 검증 (시작 시 1회)
    coord_self_test()

    # Render / Heroku 등 PaaS 는 PORT 환경변수로 포트를 지정함. 없으면 로컬용 8080.
    port = int(os.environ.get('PORT', 8080))
    server = HTTPServer(('0.0.0.0', port), ProxyHandler)
    print(f"🚀 CORS 프록시 서버가 포트 {port} 에서 실행 중입니다. (0.0.0.0:{port})")
    print(f"   헬스체크:  /  또는  /health")
    print(f"   레거시:    /proxy?url=<target>")
    print(f"   추상 API:  /api/gas/around?lat=<>&lng=<>&radius=<>&prodcd=<>")
    print(f"   추상 API:  /api/gg/<service>?pIndex=<>&pSize=<>&...  (Type 기본=json)")
    print("   Ctrl+C 로 종료")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[proxy] 종료합니다.")
        server.server_close()


if __name__ == '__main__':
    main()

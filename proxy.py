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
# KATEC ↔ WGS84 좌표 변환 (pyproj 불필요 — 순수 Python 수식)
# ------------------------------------------------------------
# proj4 정의:
#   KATEC: +proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999
#          +x_0=400000 +y_0=600000 +ellps=bessel +units=m
#          +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43
# 알고리즘:
#   (1) 타원체 간 변환: ECEF 기반 7-parameter Helmert (Position Vector)
#   (2) Transverse Mercator: Snyder 공식 (USGS Map Projections, 1987)
# ============================================================

# 타원체 매개변수
_BESSEL = {'a': 6377397.155, 'f': 1.0 / 299.1528128}
_WGS84  = {'a': 6378137.0,   'f': 1.0 / 298.257223563}
for _e in (_BESSEL, _WGS84):
    _e['b']   = _e['a'] * (1 - _e['f'])
    _e['e2']  = 2 * _e['f'] - _e['f'] ** 2          # 제1 이심률 제곱
    _e['ep2'] = _e['e2'] / (1 - _e['e2'])           # 제2 이심률 제곱

# KATEC TM 원점/상수
_KATEC_LAT0 = math.radians(38.0)
_KATEC_LON0 = math.radians(128.0)
_KATEC_K0   = 0.9999
_KATEC_X0   = 400000.0
_KATEC_Y0   = 600000.0

# 7-parameter Helmert (Bessel → WGS84, Position Vector convention)
# translation (m), rotation (arc-sec→rad), scale (ppm→dimensionless)
_TOWGS84_DX = -115.80
_TOWGS84_DY =  474.99
_TOWGS84_DZ =  674.11
_TOWGS84_RX = math.radians( 1.16 / 3600)
_TOWGS84_RY = math.radians(-2.31 / 3600)
_TOWGS84_RZ = math.radians(-1.63 / 3600)
_TOWGS84_DS = 6.43 * 1e-6


def _geodetic_to_ecef(lat, lng, ell):
    """위경도(rad) → ECEF 직교좌표 (m)"""
    a, e2 = ell['a'], ell['e2']
    sin_lat = math.sin(lat)
    N = a / math.sqrt(1 - e2 * sin_lat * sin_lat)
    X = N * math.cos(lat) * math.cos(lng)
    Y = N * math.cos(lat) * math.sin(lng)
    Z = N * (1 - e2) * sin_lat
    return X, Y, Z


def _ecef_to_geodetic(X, Y, Z, ell):
    """ECEF → 위경도(rad). Bowring(1976) 근사 — 지표면 근처 오차 sub-mm."""
    a, b, e2, ep2 = ell['a'], ell['b'], ell['e2'], ell['ep2']
    p = math.sqrt(X * X + Y * Y)
    theta = math.atan2(Z * a, p * b)
    sin_t, cos_t = math.sin(theta), math.cos(theta)
    lat = math.atan2(Z + ep2 * b * sin_t ** 3,
                     p - e2  * a * cos_t ** 3)
    lng = math.atan2(Y, X)
    return lat, lng


def _helmert_bessel_to_wgs84(X, Y, Z):
    """Bessel ECEF → WGS84 ECEF (Position Vector)"""
    sc = 1.0 + _TOWGS84_DS
    Xw = _TOWGS84_DX + sc * ( X - _TOWGS84_RZ * Y + _TOWGS84_RY * Z)
    Yw = _TOWGS84_DY + sc * ( _TOWGS84_RZ * X + Y - _TOWGS84_RX * Z)
    Zw = _TOWGS84_DZ + sc * (-_TOWGS84_RY * X + _TOWGS84_RX * Y + Z)
    return Xw, Yw, Zw


def _helmert_wgs84_to_bessel(X, Y, Z):
    """WGS84 ECEF → Bessel ECEF (역변환 — 소규모 매개변수 근사)"""
    sc = 1.0 - _TOWGS84_DS
    dX = X - _TOWGS84_DX
    dY = Y - _TOWGS84_DY
    dZ = Z - _TOWGS84_DZ
    Xb = sc * ( dX + _TOWGS84_RZ * dY - _TOWGS84_RY * dZ)
    Yb = sc * (-_TOWGS84_RZ * dX + dY + _TOWGS84_RX * dZ)
    Zb = sc * ( _TOWGS84_RY * dX - _TOWGS84_RX * dY + dZ)
    return Xb, Yb, Zb


def _tm_meridional_arc(phi, ell):
    """적도~phi 자오선 호장 (Snyder 3-21)"""
    a, e2 = ell['a'], ell['e2']
    return a * (
        (1 - e2/4 - 3*e2**2/64 - 5*e2**3/256) * phi
        - (3*e2/8 + 3*e2**2/32 + 45*e2**3/1024) * math.sin(2*phi)
        + (15*e2**2/256 + 45*e2**3/1024) * math.sin(4*phi)
        - (35*e2**3/3072) * math.sin(6*phi)
    )


def _tm_forward(lat, lng, ell, lat0, lon0, k0, x0, y0):
    """TM 정투영: 위경도(rad) → x,y(m) — Snyder 8-5,6"""
    a, e2, ep2 = ell['a'], ell['e2'], ell['ep2']
    sin_lat, cos_lat = math.sin(lat), math.cos(lat)
    tan_lat = math.tan(lat)
    N = a / math.sqrt(1 - e2 * sin_lat * sin_lat)
    T = tan_lat * tan_lat
    C = ep2 * cos_lat * cos_lat
    A = (lng - lon0) * cos_lat
    M  = _tm_meridional_arc(lat,  ell)
    M0 = _tm_meridional_arc(lat0, ell)
    x = x0 + k0 * N * (
        A + (1 - T + C) * A**3 / 6
        + (5 - 18*T + T*T + 72*C - 58*ep2) * A**5 / 120
    )
    y = y0 + k0 * (
        M - M0 + N * tan_lat * (
            A*A/2
            + (5 - T + 9*C + 4*C*C) * A**4 / 24
            + (61 - 58*T + T*T + 600*C - 330*ep2) * A**6 / 720
        )
    )
    return x, y


def _tm_inverse(x, y, ell, lat0, lon0, k0, x0, y0):
    """TM 역투영: x,y(m) → 위경도(rad) — Snyder 8-6"""
    a, e2, ep2 = ell['a'], ell['e2'], ell['ep2']
    M0 = _tm_meridional_arc(lat0, ell)
    M  = M0 + (y - y0) / k0
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    mu = M / (a * (1 - e2/4 - 3*e2**2/64 - 5*e2**3/256))
    phi1 = mu + (
        (3*e1/2 - 27*e1**3/32) * math.sin(2*mu)
        + (21*e1**2/16 - 55*e1**4/32) * math.sin(4*mu)
        + (151*e1**3/96) * math.sin(6*mu)
        + (1097*e1**4/512) * math.sin(8*mu)
    )
    sin_p1, cos_p1 = math.sin(phi1), math.cos(phi1)
    tan_p1 = math.tan(phi1)
    N1 = a / math.sqrt(1 - e2 * sin_p1 * sin_p1)
    T1 = tan_p1 * tan_p1
    C1 = ep2 * cos_p1 * cos_p1
    R1 = a * (1 - e2) / (1 - e2 * sin_p1 * sin_p1) ** 1.5
    D = (x - x0) / (N1 * k0)
    lat = phi1 - (N1 * tan_p1 / R1) * (
        D*D/2
        - (5 + 3*T1 + 10*C1 - 4*C1*C1 - 9*ep2) * D**4 / 24
        + (61 + 90*T1 + 298*C1 + 45*T1*T1 - 252*ep2 - 3*C1*C1) * D**6 / 720
    )
    lng = lon0 + (
        D - (1 + 2*T1 + C1) * D**3 / 6
        + (5 - 2*C1 + 28*T1 - 3*C1*C1 + 8*ep2 + 24*T1*T1) * D**5 / 120
    ) / cos_p1
    return lat, lng


def wgs84_to_katec(lat_deg, lng_deg):
    """WGS84 (lat°, lng°) → KATEC (x m, y m)"""
    lat = math.radians(lat_deg)
    lng = math.radians(lng_deg)
    Xw, Yw, Zw = _geodetic_to_ecef(lat, lng, _WGS84)
    Xb, Yb, Zb = _helmert_wgs84_to_bessel(Xw, Yw, Zw)
    lat_b, lng_b = _ecef_to_geodetic(Xb, Yb, Zb, _BESSEL)
    return _tm_forward(lat_b, lng_b, _BESSEL,
                       _KATEC_LAT0, _KATEC_LON0, _KATEC_K0, _KATEC_X0, _KATEC_Y0)


def katec_to_wgs84(x, y):
    """KATEC (x m, y m) → WGS84 (lat°, lng°)"""
    lat_b, lng_b = _tm_inverse(x, y, _BESSEL,
                               _KATEC_LAT0, _KATEC_LON0, _KATEC_K0, _KATEC_X0, _KATEC_Y0)
    Xb, Yb, Zb = _geodetic_to_ecef(lat_b, lng_b, _BESSEL)
    Xw, Yw, Zw = _helmert_bessel_to_wgs84(Xb, Yb, Zb)
    lat, lng = _ecef_to_geodetic(Xw, Yw, Zw, _WGS84)
    return math.degrees(lat), math.degrees(lng)


def _coord_self_test():
    """시작 시 좌표 변환 자체 검증 — Round-trip 오차 및 샘플 좌표 확인"""
    # 샘플 1: Opinet 공식 예시 KATEC (314681.8, 544837) — 서울 강남/서초 예상
    lat, lng = katec_to_wgs84(314681.8, 544837.0)
    print(f"[self-test] KATEC(314681.8, 544837) → WGS84({lat:.5f}, {lng:.5f})")
    in_range = 36.5 < lat < 38.0 and 126.5 < lng < 127.5
    if not in_range:
        print(f"[self-test] ⚠️  예상 범위(서울 근처) 밖 — 변환 공식 점검 필요")

    # 샘플 2: Round-trip 오차 측정 (서울 강남 37.47, 127.04)
    orig_lat, orig_lng = 37.47, 127.04
    kx, ky = wgs84_to_katec(orig_lat, orig_lng)
    back_lat, back_lng = katec_to_wgs84(kx, ky)
    # 위도 1° ≈ 111 km, 경도 1° ≈ 111 km × cos(lat)
    d_lat_m = abs(orig_lat - back_lat) * 111000
    d_lng_m = abs(orig_lng - back_lng) * 111000 * math.cos(math.radians(orig_lat))
    err_m = math.sqrt(d_lat_m ** 2 + d_lng_m ** 2)
    status = "✅" if err_m < 1.0 else ("⚠️" if err_m < 10.0 else "❌")
    print(f"[self-test] {status} Round-trip 오차 {err_m:.4f}m "
          f"(WGS84→KATEC({kx:.1f}, {ky:.1f})→WGS84)")


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
        radius = max(1, min(radius, 5000))  # Opinet 제한 5km

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
                'Referer': 'https://www.opinet.co.kr/',
                'User-Agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                               'AppleWebKit/537.36 (KHTML, like Gecko) '
                               'Chrome/122.0.0.0 Safari/537.36')
            })
            opener = build_opener(DebugRedirectHandler())
            with opener.open(req, timeout=30) as resp:
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
            req = Request(upstream_url, headers={'User-Agent': 'Mozilla/5.0 (MJ-Map Proxy)'})
            opener = build_opener(DebugRedirectHandler())
            with opener.open(req, timeout=60) as resp:
                content_type = resp.headers.get('Content-Type', 'application/json; charset=utf-8')
                print(f"[proxy] ← gg/{service} {resp.status} {content_type} (스트리밍 시작)")

                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self._send_cors_headers()
                self.end_headers()

                total = 0
                chunk_size = 8192
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
    # 좌표 변환 자체 검증 (시작 시 1회)
    _coord_self_test()

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

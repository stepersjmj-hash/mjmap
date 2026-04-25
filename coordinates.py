"""
coordinates.py — KATEC ↔ WGS84 좌표 변환 (pyproj 불필요, 순수 Python)
================================================================
Opinet 은 KATEC(Bessel TM) 좌표계를 쓰지만 브라우저 지오로케이션/Naver 지도는
WGS84 를 쓴다. 두 좌표계를 변환하는 공식을 한곳에 모아둔 모듈.

proj4 정의:
  KATEC: +proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999
         +x_0=400000 +y_0=600000 +ellps=bessel +units=m
         +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43

알고리즘:
  (1) 타원체 간 변환: ECEF 기반 7-parameter Helmert (Position Vector)
  (2) Transverse Mercator: Snyder 공식 (USGS Map Projections, 1987)

공개 API:
  wgs84_to_katec(lat_deg, lng_deg) -> (x_m, y_m)
  katec_to_wgs84(x_m, y_m)         -> (lat_deg, lng_deg)
  coord_self_test()                -> None  (시작 시 변환 정확도 점검용)
"""

import math


# ─── 타원체 매개변수 ──────────────────────────────────────────
_BESSEL = {'a': 6377397.155, 'f': 1.0 / 299.1528128}
_WGS84  = {'a': 6378137.0,   'f': 1.0 / 298.257223563}
for _e in (_BESSEL, _WGS84):
    _e['b']   = _e['a'] * (1 - _e['f'])
    _e['e2']  = 2 * _e['f'] - _e['f'] ** 2          # 제1 이심률 제곱
    _e['ep2'] = _e['e2'] / (1 - _e['e2'])           # 제2 이심률 제곱

# ─── KATEC TM 원점/상수 ──────────────────────────────────────
_KATEC_LAT0 = math.radians(38.0)
_KATEC_LON0 = math.radians(128.0)
_KATEC_K0   = 0.9999
_KATEC_X0   = 400000.0
_KATEC_Y0   = 600000.0

# ─── 7-parameter Helmert (Bessel → WGS84, Position Vector) ──
# translation (m), rotation (arc-sec → rad), scale (ppm → dimensionless)
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


def coord_self_test():
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


if __name__ == '__main__':
    coord_self_test()

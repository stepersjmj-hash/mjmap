"""
geocode_bluer.py — 블루리본 식당 주소를 Kakao Local API 로 좌표 변환

전제:
  - 입력: data/bluer_raw.json  (블루리본 수집 데이터, 각 항목에 "주소" 필드)
  - 출력:
      js/bluer/data.json         — 좌표 매칭된 항목들 (앱에서 fetch)
      js/bluer/data_failed.json  — 좌표 매칭 실패 항목들 (수동 보정용)

사전 준비:
  1) Kakao Developers 에서 REST API 키 발급
       https://developers.kakao.com/console/app
  2) 같은 폴더의 .env 에 추가:
       KAKAO_REST_API_KEY=발급받은_키

실행:
  python scripts/geocode_bluer.py

옵션:
  python scripts/geocode_bluer.py --input data/other.json --output js/bluer/other.json
  python scripts/geocode_bluer.py --limit 10            # 처음 10건만 (테스트용)
  python scripts/geocode_bluer.py --resume              # 기존 data.json 의 매칭은 건너뜀

알고리즘:
  1) 주소 그대로 1차 시도
  2) 실패 시 괄호() 안 내용 제거 + 빌딩명 제거 후 2차 시도
  3) 그래도 실패면 failed 배열로
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # mjmap/
DEFAULT_INPUT  = ROOT / 'data' / 'bluer_raw.json'
DEFAULT_OUTPUT = ROOT / 'js' / 'bluer' / 'data.json'
DEFAULT_FAILED = ROOT / 'js' / 'bluer' / 'data_failed.json'

# ─── .env 로더 (proxy.py 와 동일 방식) ──────────────────────────
def load_dotenv(path):
    if not path.exists():
        return False
    for raw in path.read_text(encoding='utf-8').splitlines():
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


# ─── 주소 정제 (2차 재시도용) ──────────────────────────────────
_PARENS_RE = re.compile(r'\s*\([^)]*\)\s*')
def clean_address(addr):
    """괄호() 안 내용 제거 + 빌딩명/추가 정보 제거 시도."""
    if not addr:
        return ''
    # (인계동), (옥천면) 같은 동 표기 제거
    cleaned = _PARENS_RE.sub(' ', addr)
    # 끝부분의 ", 의성빌딩" / " 의성빌딩" 같은 빌딩명 제거 시도
    # 도로명 + 번지 + 빌딩명 패턴: "...로 282 의성빌딩" → "...로 282"
    # 마지막 토큰이 한글로만 끝나면(번지·층 표기 없음) 제거
    parts = cleaned.split()
    # 마지막 토큰이 숫자/영문/특수문자 없는 순수 한글이면 빌딩명일 가능성 → 제거
    if len(parts) >= 4 and re.fullmatch(r'[가-힣]+', parts[-1]):
        cleaned = ' '.join(parts[:-1])
    return ' '.join(cleaned.split())  # 다중 공백 정리


# ─── Kakao Geocoding ──────────────────────────────────────────
def kakao_geocode(addr, key, timeout=10):
    """
    주소 1건 → (lat, lng, matched_addr) 또는 None.

    Kakao Local API: https://developers.kakao.com/docs/latest/ko/local/dev-guide
    rate limit: 분당 약 30~60 호출 권장 (너무 빠르면 429)
    """
    q = urllib.parse.quote(addr)
    url = f'https://dapi.kakao.com/v2/local/search/address.json?query={q}'
    req = urllib.request.Request(url, headers={'Authorization': f'KakaoAK {key}'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = ''
        try: body = e.read().decode('utf-8', errors='replace')
        except Exception: pass
        if e.code == 401:
            raise SystemExit(f'[error] Kakao API 인증 실패 (401). KAKAO_REST_API_KEY 확인 필요.\n  body: {body}')
        if e.code == 429:
            time.sleep(1.0)  # rate limit — 잠시 대기 후 재시도 한 번
            return kakao_geocode(addr, key, timeout)
        print(f'  [HTTP {e.code}] {addr[:40]} — {body[:100]}', file=sys.stderr)
        return None
    except (urllib.error.URLError, TimeoutError) as e:
        print(f'  [네트워크] {addr[:40]} — {e}', file=sys.stderr)
        return None

    docs = data.get('documents') or []
    if not docs:
        return None
    d = docs[0]
    try:
        lat = float(d['y'])
        lng = float(d['x'])
    except (KeyError, ValueError):
        return None
    matched = (d.get('address_name')
               or (d.get('road_address') or {}).get('address_name')
               or addr)
    return (lat, lng, matched)


def geocode_with_retry(addr, key):
    """1차 그대로 → 2차 정제 후. 둘 다 실패면 None."""
    if not addr:
        return None, 'empty'
    r = kakao_geocode(addr, key)
    if r:
        return r, 'direct'
    cleaned = clean_address(addr)
    if cleaned and cleaned != addr:
        r = kakao_geocode(cleaned, key)
        if r:
            return r, 'cleaned'
    return None, 'failed'


# ─── 메인 ─────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description='블루리본 식당 주소 → 좌표 매칭 (Kakao Local API)')
    ap.add_argument('--input',  default=str(DEFAULT_INPUT),  help='입력 JSON (기본: data/bluer_raw.json)')
    ap.add_argument('--output', default=str(DEFAULT_OUTPUT), help='출력 JSON (기본: js/bluer/data.json)')
    ap.add_argument('--failed', default=str(DEFAULT_FAILED), help='실패 항목 JSON (기본: js/bluer/data_failed.json)')
    ap.add_argument('--limit',  type=int, default=0, help='처음 N개만 처리 (0=전체)')
    ap.add_argument('--resume', action='store_true', help='기존 출력 JSON 의 매칭(_LAT 있음)은 건너뜀')
    ap.add_argument('--sleep',  type=float, default=0.05, help='호출 사이 대기 (초). rate limit 회피용')
    args = ap.parse_args()

    # .env 자동 로드
    load_dotenv(ROOT / '.env')
    KEY = os.environ.get('KAKAO_REST_API_KEY', '').strip()
    if not KEY:
        raise SystemExit('[error] KAKAO_REST_API_KEY 미설정 — .env 에 추가하거나 환경변수로 export 하세요.')
    print(f'[info] Kakao key: ****{KEY[-4:]}')

    # 입력 로드
    in_path = Path(args.input)
    if not in_path.exists():
        raise SystemExit(f'[error] 입력 파일 없음: {in_path}')
    raw = json.loads(in_path.read_text(encoding='utf-8'))
    if not isinstance(raw, list):
        raise SystemExit(f'[error] 입력이 배열 아님: {type(raw).__name__}')

    if args.limit and args.limit > 0:
        raw = raw[:args.limit]
    total = len(raw)
    print(f'[info] 입력 항목: {total}개')

    # resume 모드: 기존 output 에서 _LAT 있는 항목은 그대로 사용
    out_path = Path(args.output)
    cache = {}
    if args.resume and out_path.exists():
        try:
            existing = json.loads(out_path.read_text(encoding='utf-8'))
            for it in existing:
                key = it.get('주소') or it.get('_idx')
                if key and it.get('_LAT'):
                    cache[key] = it
            print(f'[info] resume — 기존 매칭 {len(cache)}개 재사용')
        except Exception as e:
            print(f'[warn] resume 실패, 처음부터 진행: {e}')

    success = []
    failed  = []
    stats   = {'direct': 0, 'cleaned': 0, 'failed': 0, 'cached': 0}

    for i, item in enumerate(raw, 1):
        addr = (item.get('주소') or '').strip()
        cache_key = addr or item.get('_idx')

        if cache_key in cache:
            success.append(cache[cache_key])
            stats['cached'] += 1
            continue

        result, reason = geocode_with_retry(addr, KEY)

        if result:
            lat, lng, matched = result
            new_item = dict(item)
            new_item['_LAT'] = lat
            new_item['_LNG'] = lng
            new_item['_MATCHED_ADDR'] = matched
            success.append(new_item)
            stats[reason] += 1
        else:
            failed.append(dict(item))
            stats['failed'] += 1

        # 진행률 (10건마다)
        if i % 10 == 0 or i == total:
            print(f'  [{i}/{total}] direct={stats["direct"]} cleaned={stats["cleaned"]} '
                  f'failed={stats["failed"]} cached={stats["cached"]}')

        time.sleep(args.sleep)

    # 출력 저장
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(success, ensure_ascii=False, indent=2), encoding='utf-8')
    Path(args.failed).write_text(json.dumps(failed, ensure_ascii=False, indent=2), encoding='utf-8')

    print()
    print('═' * 60)
    print(f'  ✅ 성공 {len(success)}개 → {out_path}')
    print(f'     - 주소 그대로 매칭: {stats["direct"]}')
    print(f'     - 괄호 제거 후 매칭: {stats["cleaned"]}')
    print(f'     - 캐시 재사용     : {stats["cached"]}')
    print(f'  ❌ 실패 {len(failed)}개 → {args.failed}')
    print('═' * 60)
    if failed:
        print('  실패 사례 (수동 보정 권장 — 처음 5건):')
        for it in failed[:5]:
            print(f"    - [{it.get('_idx')}] {it.get('제목')}: {it.get('주소')}")


if __name__ == '__main__':
    main()

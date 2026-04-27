# 🗺️ 나만의 경기도 지도

경기도 공공데이터(OpenAPI) + 블루리본 서베이 데이터로 **지역화폐 가맹점·주유소 가격·푸드트럭·지역 특화거리·블루리본 식당**을 한 지도에서 확인하는 개인 프로젝트입니다.

> 코드 공개는 학습·참고용입니다. 운영 인스턴스는 개인 환경(NAS·도메인·키)에 맞춰져 있어 fork 시 본인 환경에 맞게 환경변수와 도메인을 수정해야 합니다.

**데모**
- https://stepersjmj-hash.github.io/mjmap/
- https://stepersjmj.synology.me:28445/mjmap/ (NAS 미러)

---

## 주요 기능

- 📍 **내 위치 기반 검색** — GPS + 자동 시군 감지(역지오코딩)
- 🟦 **블루리본 식당** — 블루리본 서베이 선정 경기도 식당. **첫 진입 시 자동 활성화**, 리본수(1~3개) 마커 위 시각 표시
- 💳 **경기지역화폐 가맹점** — 시군 필터, 31개 시/군
- ⛽ **주유소 가격** — Opinet, 검색 반경 내 **최저가 1~5위**에 색상·가격 태그
- 🚚 **푸드트럭** — 영업 중인 사업장만 필터, 시군·반경 무시 (전체 표시)
- 🛍️ **지역 특화거리** — 31시군 내 특화거리, 시군·반경 무시 (전체 표시)
- ⭐ **즐겨찾기** — 브라우저 localStorage 보관
- 🔍 **클러스터링** — 같은 좌표 항목 자동 묶기
- 🔄 **지도 이동 후 재검색** — 원하는 지역 중심으로 재조회
- 📱 **모바일 반응형**
- 💬 **정보창 설명 2줄** — 블루리본 식당·특화거리 마커 클릭 시 설명 표시

---

## 아키텍처

```
[브라우저 — index.html + js/]
       │
       ├─→ 정적 데이터  (블루리본): js/bluer/data.json (672개 식당, 좌표 포함)
       │
       └─→ CORS 프록시 — proxy.py
              │
              ├─→ /api/gg/<service>      → openapi.gg.go.kr  (KEY 자동 주입)
              ├─→ /api/gas/around        → opinet.co.kr      (KEY + KATEC↔WGS84 자동 변환)
              └─→ /proxy?url=<target>    → 레거시 패스스루
```

핵심 설계:
- **API 키는 모두 서버 `.env` 에 저장.** 클라이언트엔 네이버 Maps clientId 만(난독화).
- Opinet 은 **해외 IP 차단** → 한국 IP에서 프록시를 돌려야 정상 응답. NAS / 국내 클라우드 권장.
- 좌표 변환은 `coordinates.py` (pyproj 불필요, Snyder TM 공식 + Helmert 7-parameter, round-trip 오차 0.005m).
- 블루리본 데이터는 **정적 JSON** 으로 보유 — geocoding 스크립트(Kakao API)로 1회 생성 후 fetch.

---

## 빠른 시작 — Windows

`start-local.bat` 더블클릭하면 `proxy.py` (포트 8080) + `python -m http.server` (포트 3000) 두 서버가 자동 실행되고 브라우저가 `http://localhost:3000` 을 엽니다.

사전 준비:
1. Python 3.10+ 설치 (PATH 등록)
2. 같은 폴더에 `.env` 작성 — `.env.example` 복사 후 키 입력
   ```
   OPINET_API_KEY=발급받은_오피넷_키
   GG_API_KEY=발급받은_경기데이터드림_키
   KAKAO_REST_API_KEY=발급받은_카카오_REST_키   # 블루리본 geocoding 시에만 필요
   ```
3. 진입 즉시 **블루리본 카테고리** 가 자동 활성화되어 식당 마커가 표시됩니다.

---

## API 키 발급

| 서비스 | 발급처 | 저장 위치 | 용도 |
|---|---|---|---|
| 네이버 Maps clientId | [NCP](https://www.ncloud.com) → Services → Maps → Application | `js/common/config.js` 의 `_CFG.k1` (XOR 난독화 권장) | 지도 + 역지오코딩 |
| 경기 OpenAPI 인증키 | [경기데이터드림](https://data.gg.go.kr) → 마이페이지 | `.env` 의 `GG_API_KEY` | 지역화폐·푸드트럭·특화거리 |
| Opinet 주유소 API | [오피넷](https://www.opinet.co.kr) → 개발자 정보 | `.env` 의 `OPINET_API_KEY` | 주유소 가격 |
| Kakao Local API (REST) | [Kakao Developers](https://developers.kakao.com/console/app) → REST API 키 | `.env` 의 `KAKAO_REST_API_KEY` | **블루리본 좌표 매칭(1회성)** |

NCP 추가 설정:
- **Web Dynamic Map** 서비스 활성화 (지도 표시용)
- **Reverse Geocoding** 서비스 활성화 (시군 자동 감지용)
- **Web 서비스 URL** 에 배포 도메인 등록 (예: `https://stepersjmj-hash.github.io`, `http://localhost:3000`)

경기 OpenAPI 신청 데이터셋:
- 경기지역화폐 가맹점 현황 — `RegionMnyFacltStus`
- 경기도 푸드트럭 — `Resrestrtfodtuck`
- 경기도 지역 특화거리 — `REGIONSPECLIZDSTNC`

---

## 수동 실행 — Linux / macOS

```bash
# 1) 환경 준비
cp .env.example .env
# .env 편집 → OPINET_API_KEY, GG_API_KEY 채우기 (블루리본 사용 시 KAKAO_REST_API_KEY 도)

# 2) 블루리본 데이터 생성 (1회성, 약 1~2분)
python3 scripts/geocode_bluer.py

# 3) 프록시 (별도 터미널)
python3 proxy.py
# → http://localhost:8080 에서 리스닝

# 4) 정적 서버 (다른 터미널)
python3 -m http.server 3000

# 5) 브라우저: http://localhost:3000
```

---

## 블루리본 데이터 갱신

블루리본은 **정적 JSON** 데이터입니다. 매년 발표되는 새 리스트로 갱신하려면:

```bash
# 1) 새 블루리본 raw 데이터를 data/bluer_raw.json 으로 저장
#    (블루리본 사이트에서 수집한 JSON, 각 항목에 "주소" 필드 필수)

# 2) Kakao Local API 로 좌표 매칭
python scripts/geocode_bluer.py

# 옵션:
#   --limit 10        처음 10건만 (테스트)
#   --resume          기존 매칭 결과 캐시 재사용
#   --input <path>    raw JSON 경로 변경
#   --output <path>   결과 JSON 경로 변경

# 3) 출력 확인
#    js/bluer/data.json         — 좌표 매칭된 식당
#    js/bluer/data_failed.json  — 매칭 실패 항목 (수동 보정용)

# 4) 브라우저 하드 리프레시 (Ctrl+Shift+R) — 새 데이터 반영
```

매칭 알고리즘:
1. 주소 그대로 1차 시도 (Kakao Local API)
2. 실패 시 괄호`()` 안 내용 + 빌딩명 제거 후 2차 시도
3. 그래도 실패면 `data_failed.json` 으로 누적 (수동 보정 권장)

---

## 배포 옵션

| 옵션 | 특징 | 가이드 |
|---|---|---|
| **Synology NAS (Docker)** | 한국 IP — Opinet 안정 응답. 운영 환경. | [SYNOLOGY_SETUP.md](SYNOLOGY_SETUP.md) |
| **Render (무료 Web Service)** | 빠른 배포. 기본 리전이 해외라 Opinet 차단 가능 — 한국 인접 리전(Singapore) 으로 설정해도 차단되는 경우 있음. | [DEPLOY.md](DEPLOY.md), `render.yaml` |
| **Docker 자체 호스팅** | 자유로운 환경. | `Dockerfile`, `docker-compose.yml` |
| **GitHub Pages (정적)** | `index.html` + `js/` 만 호스팅. 프록시는 별도 필요. | 본 레포의 main 브랜치 + Pages 설정 |

블루리본 정적 데이터(`js/bluer/data.json`)는 Pages·NAS·Docker 어디서든 동작.

---

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8080` | 프록시 리스닝 포트 |
| `OPINET_API_KEY` | (빈값) | 미설정 시 `/api/gas/*` 가 500 반환 |
| `GG_API_KEY` | (빈값) | 미설정 시 `/api/gg/*` 가 500 반환 |
| `KAKAO_REST_API_KEY` | (빈값) | **블루리본 geocoding 스크립트 전용**. 런타임 프록시는 사용 안 함 |
| `ALLOWED_ORIGINS` | 코드 기본값 | CORS 허용 Origin 콤마 구분. 운영 시 GitHub Pages·NAS 도메인 포함 필요 |
| `ALLOWED_UPSTREAM_HOSTS` | `openapi.gg.go.kr,opinet.co.kr,dapi.kakao.com` | 프록시가 중계 허용하는 외부 호스트 (endswith 매칭) |

---

## 사용법

**상단 헤더**
- 📋 목록 — 현재 표시 중인 항목 리스트 패널
- ⭐ 즐겨찾기 — 저장한 즐겨찾기 패널
- ⚙️ 설정 — 유종 / 반경 / 페이지 크기 / 시군 자동감지 / 시군 필터

**지도 위 필터 칩 (페이지 진입 시 블루리본 자동 활성화)**
- 🟦 블루리본, 💳 지역화폐, ⛽ 주유소, 🚚 푸드트럭, 🛍️ 특화거리 — 라디오 동작 (한 번에 하나)
- ⭐ 즐겨찾기 — 독립 토글

**지도 우측 컨트롤**
- 📍 내 위치 — 이동 + 자동 시군 감지 + 데이터 재로드
- 🔄 현재 지도에서 다시 검색

**마커 / 클러스터**
- 단일 마커 클릭 → 정보창 (이름·**설명 2줄**·주소·전화·길찾기·즐겨찾기 토글)
- 같은 좌표에 여러 항목 → 숫자 배지 클러스터, 클릭 시 사이드 패널에 전체 표시

**카테고리별 특이사항**
- 🟦 **블루리본**: 마커 위쪽에 **리본 1~3개** 표시(리본수 따라). 반경 필터 적용, 시군 필터는 해당 없음
- ⛽ **주유소**: 검색 반경 내 최저가 1~5위에 색상(금·은·동·올리브·테라코타) + 가격 태그
- 🚚 **푸드트럭** / 🛍️ **특화거리**: 시군·반경 필터 무시, 항상 경기도 전체 표시

---

## 파일 구조

```
mjmap/
├── index.html                    # 메인 HTML
├── proxy.py                      # CORS 프록시 (Python 표준 라이브러리만)
├── coordinates.py                # KATEC ↔ WGS84 좌표 변환
├── css/styles.css
├── js/
│   ├── app.js                    # 부트스트랩 (checkSetup 호출)
│   ├── common/                   # 공통 모듈 (7)
│   │   ├── config.js             # PROXY_*, ICONS({}), DATA_CATEGORIES, UNFILTERED_CATEGORIES
│   │   ├── state.js              # 전역 STATE (블루리본 active=true 초기값)
│   │   ├── api.js                # fetchGGApi, getLatLng/getName/getAddr/getCategory/getDescription
│   │   ├── map.js                # Naver SDK 로드, initMap, 역지오코딩, initActiveCategories 호출
│   │   ├── markers.js            # 마커 아이콘 (블루리본 리본 오버레이 포함), 클러스터, InfoWindow
│   │   ├── favorites.js          # 즐겨찾기 토글/렌더
│   │   └── ui.js                 # 설정 모달, 카테고리 토글, initActiveCategories, race-condition 방지
│   ├── money/                    # 지역화폐
│   │   ├── config.js             # ICONS.money, GG_SIGUNGU, MONEY_SERVICE_NAME
│   │   └── api.js                # loadMoneyData
│   ├── gas/                      # 주유소
│   │   ├── config.js             # ICONS.gas, POLL_DIV_LABEL, RANK_STYLES, GAS_PRODCD_OPTIONS
│   │   ├── api.js                # loadGasData (Opinet 필드 매핑)
│   │   └── markers.js            # assignGasRanks (최저가 1~5위)
│   ├── truck/                    # 푸드트럭
│   │   ├── config.js             # ICONS.truck, TRUCK_SERVICE_NAME, 영업상태 키워드
│   │   └── api.js                # loadTruckData (영업 중 필터, sigun 무시)
│   ├── street/                   # 특화거리
│   │   ├── config.js             # ICONS.street, STREET_SERVICE_NAME
│   │   └── api.js                # loadStreetData (sigun 무시)
│   └── bluer/                    # 블루리본 (정적 JSON)
│       ├── config.js             # ICONS.bluer (#6D8EA5), BLUER_DATA_URL
│       ├── api.js                # loadBluerData — fetch + 메모리 캐시
│       ├── data.json             # geocoded 식당 데이터 (geocode_bluer.py 가 생성)
│       └── data_failed.json      # 매칭 실패 항목 (수동 보정용)
├── scripts/
│   └── geocode_bluer.py          # Kakao Local API 좌표 매칭 (1회성 배치)
├── data/
│   └── bluer_raw.json            # 블루리본 raw 수집 데이터 (geocoding 입력)
├── .env.example                  # 키 템플릿
├── start-local.bat               # Windows 원클릭 실행
├── Dockerfile
├── docker-compose.yml
├── render.yaml                   # Render Blueprint
├── DEPLOY.md                     # Render 배포 가이드
├── SYNOLOGY_SETUP.md             # NAS 배포 가이드
├── CLAUDE.md                     # AI 협업 규칙
└── README.md                     # 이 문서
```

---

## 새 카테고리 추가 가이드

기존 5개 카테고리(money/gas/truck/street/bluer)는 모두 동일 패턴입니다. 새 데이터(예: "도서관")를 추가하려면:

1. `js/library/` 폴더 생성
2. `library/config.js` — `ICONS.library = {color, label, svg}` 와 `LIBRARY_SERVICE_NAME` 정의
3. `library/api.js` — `async function loadLibraryData()` 작성 (서버 API 또는 정적 JSON)
4. `js/common/config.js` — `DATA_CATEGORIES` 배열에 `'library'` 추가
   - 데이터가 적으면 `UNFILTERED_CATEGORIES` 에도 추가 (시군·반경 필터 무시)
5. `js/common/state.js` — `STATE.active / markers / data` 에 `library` 키 추가
6. `js/common/ui.js` — `loadAndRenderCategory` dispatch 에 `else if (cat === 'library') ...` 추가
7. `index.html` — 필터 바에 칩 추가 + `<script src="js/library/...">` 태그 2개 추가
8. `css/styles.css` — `--library` 색 변수 + `.chip[data-cat="library"]`, `.badge.library` 규칙

특수 렌더링 로직(주유소 랭크·블루리본 리본 등)이 필요하면 `<feature>/markers.js` 를 추가하거나 `common/markers.js::makeMarkerIcon` 안에서 카테고리 분기.

---

## 개발 워크플로우 — 데이터 수정 후 즉시 반영

`js/bluer/data.json` 등 정적 JSON 을 수정한 뒤 변경을 즉시 보려면:

| 방법 | 효과 |
|---|---|
| **F12 → Network → "Disable cache" 체크** (개발자 도구 열려있는 동안) | 매 새로고침마다 캐시 무시 — 가장 편함 |
| **`Ctrl + Shift + R`** (Windows/Linux) / **`Cmd + Shift + R`** (Mac) | 브라우저 캐시 + JS 메모리 캐시 무력화 (1회) |

`js/bluer/api.js` 에 메모리 캐시(`_BLUER_CACHE`)가 있어 같은 세션 내 재요청은 fetch 생략. 위 방법으로 무효화하세요.

---

## 문제 해결

| 증상 | 원인 · 해결 |
|---|---|
| 네이버 지도 인증 실패 | NCP에서 **Web Dynamic Map** 활성화, **Web 서비스 URL**에 현재 도메인 등록 |
| 시군 자동감지 동작 안 함 | NCP에서 **Reverse Geocoding** 추가 활성화 |
| `/api/gas/*` 500 | `.env` 의 `OPINET_API_KEY` 미설정 또는 빈값 |
| `/api/gg/*` 500 | `.env` 의 `GG_API_KEY` 미설정 또는 빈값 |
| 주유소 데이터 0개 | 해외 IP 환경에서 프록시 실행 (Opinet 차단). 한국 IP(NAS 등)에서 실행 필요 |
| CORS 에러 | `ALLOWED_ORIGINS` 환경변수에 현재 Origin 추가 |
| 푸드트럭 0개 | 시군 필터 너무 좁거나 영업 중 필터(`BSN_STATE_NM`) 매칭 실패. 콘솔 응답 확인 |
| 블루리본 0개 / "scripts/geocode_bluer.py 실행 필요" 토스트 | `js/bluer/data.json` 미생성 — 위 "블루리본 데이터 갱신" 절차 실행 |
| 블루리본 변경 반영 안 됨 | 브라우저 캐시 — 하드 리프레시(`Ctrl+Shift+R`) 또는 개발자 도구 "Disable cache" |
| 즐겨찾기 사라짐 | 브라우저 데이터 삭제 시 localStorage 도 같이 비워짐 |
| 시군 필터 박혀서 0건 | 토스트가 알려줌 — 설정에서 "전체 (필터 없음)" 선택 |

---

## 개인정보 / 보안

- **API 키**: 모두 서버 환경변수(`.env`)에서 관리. `.gitignore` 로 git 제외.
- **Kakao 키**: 블루리본 geocoding 스크립트 실행 시에만 사용. 런타임 프록시는 미사용.
- **즐겨찾기·설정**: 브라우저 localStorage 에만 저장 — 외부 전송 없음.
- **프록시**: 키 주입 + CORS 중계만 수행, 사용자 데이터를 영구 보존하지 않음.
- **Origin 화이트리스트**: 프록시는 `ALLOWED_ORIGINS` 외 요청을 403 차단.
- **Upstream 화이트리스트**: 레거시 `/proxy?url=` 도 `ALLOWED_UPSTREAM_HOSTS` 외 호스트는 거부 (SSRF 방지).

---

## 라이선스

개인 학습/참고용 공개. fork 후 본인 환경에 맞춰 자유롭게 수정 가능.

---

## 참고 문서

- AI 협업 규칙: [CLAUDE.md](CLAUDE.md)
- NAS 배포: [SYNOLOGY_SETUP.md](SYNOLOGY_SETUP.md)
- Render 배포: [DEPLOY.md](DEPLOY.md)
- 경기 OpenAPI: https://data.gg.go.kr
- Opinet OpenAPI: https://www.opinet.co.kr
- Kakao Local API: https://developers.kakao.com/docs/latest/ko/local/dev-guide
- Naver Maps API: https://navermaps.github.io/maps.js.ncp/
- 블루리본 서베이: https://www.bluer.co.kr

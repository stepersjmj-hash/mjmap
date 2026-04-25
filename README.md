# 🗺️ 나만의 경기도 지도

경기도 공공데이터(OpenAPI)로 **지역화폐 가맹점·주유소 가격·푸드트럭 위치**를 한 지도에서 확인하는 개인 프로젝트입니다.

> 코드 공개는 학습·참고용입니다. 운영 인스턴스는 개인 환경(NAS·도메인·키)에 맞춰져 있어 fork 시 본인 환경에 맞게 환경변수와 도메인을 수정해야 합니다.

**데모**
- https://stepersjmj-hash.github.io/mjmap/
- https://stepersjmj.synology.me:28443/mjmap/ (NAS 미러)

---

## 주요 기능

- 📍 **내 위치 기반 검색** — GPS + 자동 시군 감지(역지오코딩)
- 💳 **경기지역화폐 가맹점** — 시군 필터, 31개 시/군
- ⛽ **주유소 가격** — Opinet, 검색 반경 내 **최저가 1~5위**에 색상·가격 태그
- 🚚 **푸드트럭** — 영업 중인 사업장만 필터
- ⭐ **즐겨찾기** — 브라우저 localStorage 보관
- 🔍 **클러스터링** — 같은 좌표 항목 자동 묶기
- 🔄 **지도 이동 후 재검색** — 원하는 지역 중심으로 재조회
- 📱 **모바일 반응형**

---

## 아키텍처

```
[브라우저 — index.html + js/]
       │
       ▼ (Origin 검증)
[프록시 — proxy.py · 표준 라이브러리만]
       │
       ├─→ /api/gg/<service>      → openapi.gg.go.kr  (KEY 자동 주입)
       ├─→ /api/gas/around        → opinet.co.kr      (KEY + KATEC↔WGS84 자동 변환)
       └─→ /proxy?url=<target>    → 레거시 패스스루
```

핵심 설계:
- **API 키는 모두 서버 `.env` 에 저장.** 클라이언트엔 네이버 Maps clientId 만(난독화).
- Opinet 은 **해외 IP 차단** → 한국 IP에서 프록시를 돌려야 정상 응답. NAS / 국내 클라우드 권장.
- 좌표 변환은 `coordinates.py` (pyproj 불필요, Snyder TM 공식 + Helmert 7-parameter, round-trip 오차 0.005m).

---

## 빠른 시작 — Windows

`start-local.bat` 더블클릭하면 `proxy.py` (포트 8080) + `python -m http.server` (포트 3000) 두 서버가 자동 실행되고 브라우저가 `http://localhost:3000` 을 엽니다.

사전 준비:
1. Python 3.10+ 설치 (PATH 등록)
2. 같은 폴더에 `.env` 작성 — `.env.example` 복사 후 키 입력
   ```
   OPINET_API_KEY=발급받은_오피넷_키
   GG_API_KEY=발급받은_경기데이터드림_키
   ```

---

## API 키 발급

| 서비스 | 발급처 | 저장 위치 |
|---|---|---|
| 네이버 Maps clientId | [NCP](https://www.ncloud.com) → Services → Maps → Application | `js/common/config.js` 의 `_CFG.k1` (XOR 난독화 권장) |
| 경기 OpenAPI 인증키 | [경기데이터드림](https://data.gg.go.kr) → 마이페이지 | `.env` 의 `GG_API_KEY` |
| Opinet 주유소 API | [오피넷](https://www.opinet.co.kr) → 개발자 정보 | `.env` 의 `OPINET_API_KEY` |

NCP 추가 설정:
- **Web Dynamic Map** 서비스 활성화 (지도 표시용)
- **Reverse Geocoding** 서비스 활성화 (시군 자동 감지용)
- **Web 서비스 URL** 에 배포 도메인 등록 (예: `https://stepersjmj-hash.github.io`, `http://localhost:3000`)

경기 OpenAPI 신청 데이터셋:
- 경기지역화폐 가맹점 현황 — `RegionMnyFacltStus`
- 경기도 푸드트럭 — `Resrestrtfodtuck`

---

## 수동 실행 — Linux / macOS

```bash
# 1) 환경 준비
cp .env.example .env
# .env 편집 → OPINET_API_KEY, GG_API_KEY 채우기

# 2) 프록시 (별도 터미널)
python3 proxy.py
# → http://localhost:8080 에서 리스닝

# 3) 정적 서버 (다른 터미널)
python3 -m http.server 3000

# 4) 브라우저: http://localhost:3000
```

---

## 배포 옵션

| 옵션 | 특징 | 가이드 |
|---|---|---|
| **Synology NAS (Docker)** | 한국 IP — Opinet 안정 응답. 운영 환경. | [SYNOLOGY_SETUP.md](SYNOLOGY_SETUP.md) |
| **Render (무료 Web Service)** | 빠른 배포. 기본 리전이 해외라 Opinet 차단 가능 — 한국 인접 리전(Singapore) 으로 설정해도 차단되는 경우 있음. | [DEPLOY.md](DEPLOY.md), `render.yaml` |
| **Docker 자체 호스팅** | 자유로운 환경. | `Dockerfile`, `docker-compose.yml` |
| **GitHub Pages (정적)** | `index.html` + `js/` 만 호스팅. 프록시는 별도 필요. | 본 레포의 `gh-pages` 브랜치 또는 main + Pages 설정 |

---

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8080` | 프록시 리스닝 포트 |
| `OPINET_API_KEY` | (빈값) | 미설정 시 `/api/gas/*` 가 500 반환 |
| `GG_API_KEY` | (빈값) | 미설정 시 `/api/gg/*` 가 500 반환 |
| `ALLOWED_ORIGINS` | 코드 기본값 | CORS 허용 Origin 콤마 구분. 운영 시 GitHub Pages·NAS 도메인 포함 필요 |
| `ALLOWED_UPSTREAM_HOSTS` | `openapi.gg.go.kr,opinet.co.kr,dapi.kakao.com` | 프록시가 중계 허용하는 외부 호스트 (endswith 매칭) |

---

## 사용법

**상단 헤더**
- 📋 목록 — 현재 표시 중인 항목 리스트 패널
- ⭐ 즐겨찾기 — 저장한 즐겨찾기 패널
- ⚙️ 설정 — 유종 / 반경 / 페이지 크기 / 시군 자동감지 / 시군 필터

**지도 위 필터 칩**
- 💳 지역화폐, ⛽ 주유소, 🚚 푸드트럭 — 라디오 동작 (한 번에 하나)
- ⭐ 즐겨찾기 — 독립 토글

**지도 우측 컨트롤**
- 📍 내 위치 — 이동 + 자동 시군 감지 + 데이터 재로드
- 🔄 현재 지도에서 다시 검색

**마커 / 클러스터**
- 단일 마커 클릭 → 정보창 (이름·주소·전화·길찾기·즐겨찾기 토글)
- 같은 좌표에 여러 항목 → 숫자 배지 클러스터, 클릭 시 사이드 패널에 전체 표시

**주유소 전용**
- 검색 반경 내 최저가 1~5위에 색상 (금·은·동·올리브·테라코타) + 가격 태그 표시

---

## 파일 구조

```
mjmap/
├── index.html                    # 메인 HTML
├── proxy.py                      # CORS 프록시 (Python 표준 라이브러리만)
├── coordinates.py                # KATEC ↔ WGS84 좌표 변환
├── css/
│   └── styles.css
├── js/
│   ├── app.js                    # 부트스트랩 (checkSetup 호출)
│   ├── common/                   # 공통 모듈 (7)
│   │   ├── config.js             # PROXY_*, ICONS({}), DATA_CATEGORIES, LINE_ICONS
│   │   ├── state.js              # 전역 STATE
│   │   ├── api.js                # fetchGGApi, getLatLng/getName/getCategory, filterByRadius
│   │   ├── map.js                # Naver SDK 로드, initMap, 역지오코딩
│   │   ├── markers.js            # 마커 아이콘, 클러스터, InfoWindow, 길찾기
│   │   ├── favorites.js          # 즐겨찾기 토글/렌더
│   │   └── ui.js                 # 설정 모달, 카테고리 토글, 사이드 패널
│   ├── money/                    # 지역화폐 (2)
│   │   ├── config.js             # ICONS.money, GG_SIGUNGU, MONEY_SERVICE_NAME
│   │   └── api.js                # loadMoneyData
│   ├── gas/                      # 주유소 (3)
│   │   ├── config.js             # ICONS.gas, POLL_DIV_LABEL, RANK_STYLES, GAS_PRODCD_OPTIONS
│   │   ├── api.js                # loadGasData (Opinet 필드 매핑)
│   │   └── markers.js            # assignGasRanks (최저가 1~5위)
│   └── truck/                    # 푸드트럭 (2)
│       ├── config.js             # ICONS.truck, TRUCK_SERVICE_NAME
│       └── api.js                # loadTruckData (영업 중 필터)
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

지역화폐·주유소·푸드트럭은 모두 동일 패턴입니다. 새 데이터(예: "도서관")를 추가하려면:

1. `js/library/` 폴더 생성
2. `library/config.js` — `ICONS.library = {color, label, svg}` 와 `LIBRARY_SERVICE_NAME` 정의
3. `library/api.js` — `async function loadLibraryData()` 작성
4. `js/common/config.js` — `DATA_CATEGORIES` 배열에 `'library'` 추가
5. `js/common/state.js` — `STATE.active / markers / data` 에 `library` 키 추가
6. `js/common/ui.js` — `loadAndRenderCategory` dispatch 에 `else if (cat === 'library') ...` 추가
7. `index.html` — 필터 바에 칩 추가 + `<script src="js/library/...">` 태그 2개 추가
8. `css/styles.css` — `--library` 색 변수 + `.chip[data-cat="library"]`, `.badge.library` 규칙

특수 렌더링 로직(주유소 랭크 등)이 필요하면 `<feature>/markers.js` 를 추가하고, `common/markers.js::renderMarkers` 가 `typeof <hookName> === 'function'` 으로 호출하는 패턴을 따라가세요.

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
| 즐겨찾기 사라짐 | 브라우저 데이터 삭제 시 localStorage 도 같이 비워짐 |

---

## 개인정보 / 보안

- **API 키**: 모두 서버 환경변수(`.env`)에서 관리. `.gitignore` 로 git 제외.
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
- Naver Maps API: https://navermaps.github.io/maps.js.ncp/

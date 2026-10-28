# mjmap — 작업 규칙 및 가이드

## 작업 규칙
1. 파일 수정 후 결과 출력하기 전에 검증하고 알려주기
2. 수정하기 전 수정 계획을 먼저 세우고 수정여부 확인 후 진행
3. 확실하지 않은 정보는 미리 알려주기
4. 작업 완료 후 작업내용 가이드(readme) 업데이트

## 프로젝트 요약
네이버 지도 위에 경기도 공공데이터(지역화폐·푸드트럭·특화거리), Opinet 주유소 가격,
블루리본 식당·카페, 대형카페를 겹쳐 보는 정적 웹앱. 빌드 도구 없음 (순수 HTML/CSS/JS).
- 프론트: `index.html` + `css/styles.css` + `js/` (common + 카테고리별 config/api/detail)
- 서버: `proxy.py` (표준 라이브러리만) — API 키 주입 + CORS 중계. `coordinates.py` 좌표 변환
- 정적 데이터: `js/bluer/data.json`(블루리본), `js/cafe/large_cafes.json`(대형카페)
- 상세 구조·사용법은 README.md 참고. 새 카테고리 추가 절차도 README 에 있음

## 배포
- 프론트: `main` 푸시 → GitHub Pages 자동 반영 (https://stepersjmj-hash.github.io/mjmap/)
- 프록시: 시놀로지 NAS Docker (`SYNOLOGY_SETUP.md`). 코드 변경 시 NAS 에서
  `git pull && docker compose up -d --build`
- `.env` 는 절대 커밋하지 않음 (`.env.example` 만 공개)

## 반복 작업
- **블루리본 데이터 갱신**: `data/bluer_raw.json` 교체 → `python scripts/geocode_bluer.py`
  → `js/bluer/data.json` / `data_failed.json` 확인 (Kakao REST 키 필요, README "블루리본 데이터 갱신")
- **홈 화면·바로가기 아이콘 재생성**: `python scripts/make_icons.py` → `icons/icon-{180,192,512}.png`
  (Pillow 필요). 디자인은 스크립트 상단 BG/INK/좌표 상수. `index.html` head 와
  `manifest.webmanifest` 가 이 파일들을 참조
- **로컬 실행**: `start-local.bat` (프록시 8080 + 정적 3000). `.env` 없으면 `/api/*` 는 500

## 함정
- 정적 JSON 은 브라우저 캐시 + JS 메모리 캐시(`_BLUER_CACHE` 등)가 있어 수정 후 하드 리프레시 필요
- Opinet 은 해외 IP 차단 → 프록시는 한국 IP(NAS)에서만 정상
- 네이버 앱 바로가기는 추가 시점의 아이콘을 저장함 → 아이콘 바꾸면 바로가기 삭제 후 재등록
- `index.html.bak`, `js/bluer/data_final.json` 등 미사용 파일이 저장소에 남아 있음 (정리 예정)

## 커밋 메시지
한국어 짧은 명령형 (예: "대형카페 추가", "json 업데이트"). 영문 conventional 스타일도 혼용됨

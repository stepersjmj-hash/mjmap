// ============================================================
// street/config.js — 지역 특화거리 전용 상수
//   - ICONS.street 등록, 경기도 OpenAPI 서비스명
// 로드 순서: common/config → money/config → gas/config → truck/config → street/config → common/state → ...
// 의존: common/config.js (ICONS 빈 객체 선언)
// ============================================================

// 특화거리 마커 SVG — Feather "map" 스타일 (접힌 지도 + 세로 접힘선 2개)
const _STREET_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`;

// ICONS 레지스트리에 특화거리 카테고리 등록 (teal — 쿨톤, 따뜻한 톤 기존 3종과 대비)
ICONS.street = {
  color: '#5C8C8A',
  label: '특화거리',
  svg:   _STREET_SVG
};

// 경기도 공공데이터 서비스명 — 지역 특화거리
//   https://openapi.gg.go.kr/REGIONSPECLIZDSTNC
//   선택 파라미터: SIGUN_NM (시군명), SIGUN_CD (시군코드)
const STREET_SERVICE_NAME = 'REGIONSPECLIZDSTNC';

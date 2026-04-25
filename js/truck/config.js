// ============================================================
// truck/config.js — 푸드트럭 전용 상수
//   - ICONS.truck 등록, 경기도 OpenAPI 서비스명
// 로드 순서: common/config → money/config → gas/config → truck/config → common/state → ...
// 의존: common/config.js (ICONS 빈 객체 선언)
// ============================================================

// 푸드트럭 마커 SVG — Feather "truck" 스타일 (1.6px stroke, 공통 디자인 언어)
const _TRUCK_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="5" width="14" height="10"/><path d="M15 8h4l3 3v4h-7z"/><circle cx="5.5" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/></svg>`;

// ICONS 레지스트리에 푸드트럭 카테고리 등록 (머스터드 — Warm Stone 팔레트 조화)
ICONS.truck = {
  color: '#D9A441',
  label: '푸드트럭',
  svg:   _TRUCK_SVG
};

// 경기도 공공데이터 서비스명 — 관광휴게음식점 푸드트럭
//   https://openapi.gg.go.kr/Resrestrtfodtuck
//   선택 파라미터: SIGUN_NM (시군명), SIGUN_CD (시군코드)
const TRUCK_SERVICE_NAME = 'Resrestrtfodtuck';

// 영업 중으로 간주할 BSN_STATE_NM 키워드 (이 값이 포함된 레코드만 표시)
// 경기도 위생업 데이터는 보통 "영업/정상", "영업중" 등으로 응답
const TRUCK_ACTIVE_STATE_KEYWORDS = ['영업', '정상'];

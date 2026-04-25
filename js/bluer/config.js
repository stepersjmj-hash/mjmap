// ============================================================
// bluer/config.js — 블루리본 식당 전용 상수
//   - ICONS.bluer 등록, 정적 데이터 URL
// 로드 순서: common/config → money/config → gas/config → truck/config → street/config → bluer/config → common/state → ...
// 의존: common/config.js (ICONS 빈 객체 선언)
//
// 데이터 소스: bluer.co.kr (블루리본 서베이) 수집 데이터
//   raw 입력은 data/bluer_raw.json, 좌표 매칭 후 js/bluer/data.json 생성
//   생성 방법: scripts/geocode_bluer.py 실행 (Kakao Local API 키 필요)
// ============================================================

// 블루리본 마커 SVG — 메달(원) + 리본 꼬리 형태
const _BLUER_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="6"/><path d="M8.5 14L6 22l6-3.5L18 22l-2.5-8"/></svg>`;

// ICONS 레지스트리에 블루리본 카테고리 등록 (dusty blue — Warm Stone 팔레트 조화)
ICONS.bluer = {
  color: '#6D8EA5',
  label: '블루리본',
  svg:   _BLUER_SVG
};

// 정적 데이터 URL — js/bluer/api.js 가 fetch
// (geocode_bluer.py 가 생성. 파일 없으면 loadBluerData 가 안내 토스트 표시)
const BLUER_DATA_URL = 'js/bluer/data.json';

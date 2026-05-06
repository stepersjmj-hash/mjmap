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

// 블루리본 카페 마커 SVG — 커피잔 형태 (lucide coffee)
const _BLUER_CAFE_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>`;

// ICONS 레지스트리에 블루리본 식당/카페 등록
//   - bluer       (#6D8EA5 dusty blue) : 음식점만 (카페 제외)
//   - bluer_cafe  (#B07A56 코코아 브라운): 카페·디저트 전용
ICONS.bluer = {
  color: '#6D8EA5',
  label: '블루리본 식당',
  svg:   _BLUER_SVG
};
ICONS.bluer_cafe = {
  color: '#B07A56',
  label: '블루리본 카페',
  svg:   _BLUER_CAFE_SVG
};

// 정적 데이터 URL — js/bluer/api.js 가 fetch
// (geocode_bluer.py 가 생성. 파일 없으면 loadBluerData 가 안내 토스트 표시)
const BLUER_DATA_URL = 'js/bluer/data.json';

// ============================================================
// 카페·디저트 분류 (서브필터 '음식점만' / '카페만' 용)
//   - 정확매치(BLUER_CAFE_MENUS) 우선
//   - 미매치 시 키워드 부분일치(BLUER_CAFE_KEYWORDS) 로 fallback
//     ('카페' 라는 단어가 메뉴명에 들어가면 카페로 분류 — 변형 메뉴명 흡수)
// 데이터 빈도 분석 기준 (2026-05-05) — 약 405건이 카페로 분류됨
// ============================================================
const BLUER_CAFE_MENUS = new Set([
  '카페','커피전문점','베이커리','디저트전문점','카페,디저트',
  '티카페','북카페','떡카페','브런치카페',
  '케이크','빙수','베이글','마카롱','초콜릿','아이스크림',
  '팬케이크','페이스트리','한식디저트','떡케이크','대만디저트','쿠키'
]);
const BLUER_CAFE_KEYWORDS = ['카페','디저트','베이커리'];

function isBluerCafe(item) {
  const menu = item && item['메뉴명'];
  if (!menu) return false;
  if (BLUER_CAFE_MENUS.has(menu)) return true;
  return BLUER_CAFE_KEYWORDS.some(k => menu.includes(k));
}

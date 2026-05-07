// ============================================================
// cafe/config.js — 대형카페 (KakaoMap "대형카페" 검색 결과) 전용 상수
//   - ICONS.large_cafe 등록, 정적 데이터 URL
// 로드 순서: common/config → money/config → gas/config → truck/config → street/config → bluer/config → cafe/config → common/state → ...
// 의존: common/config.js (ICONS 빈 객체 선언)
//
// 데이터 소스: js/cafe/large_cafes.json
//   KakaoMap "대형카페" 검색 결과 1~34페이지 (총 500건)를 정적 JSON 으로 저장
// ============================================================

// 대형카페 마커 SVG — 컵 + 김 (lucide coffee 변형, 큰 카페 느낌)
const _LARGE_CAFE_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v2M10 2v2M14 2v2"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><path d="M17 8h2a3 3 0 0 1 0 6h-2"/></svg>`;

// ICONS 레지스트리에 대형카페 등록
//   - large_cafe (#7A6E5C 웜 스톤 브라운) : KakaoMap '대형카페' 검색 데이터
ICONS.large_cafe = {
  color: '#7A6E5C',
  label: '대형카페',
  svg:   _LARGE_CAFE_SVG
};

// 정적 데이터 URL — js/cafe/api.js 가 fetch
const LARGE_CAFE_DATA_URL = 'js/cafe/large_cafes.json';

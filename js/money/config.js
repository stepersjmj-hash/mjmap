// ============================================================
// money/config.js — 지역화폐 전용 상수
//   - ICONS.money 등록, 경기도 시군 목록, 경기도 OpenAPI 서비스명
// 로드 순서: common/config → money/config → ...
// 의존: common/config.js (ICONS 빈 객체 선언), common/state.js 이전
// ============================================================

// 지역화폐 마커·뱃지 SVG (공통 스타일: 1.6px stroke)
const _MONEY_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M8 9l2 5 2-5 2 5 2-5M7 13h10"/></svg>`;

// ICONS 레지스트리에 지역화폐 카테고리 등록
ICONS.money = {
  color: '#7E8C5C',
  label: '지역화폐',
  svg:   _MONEY_SVG
};

// 경기도 공공데이터 서비스명 — 지역화폐 가맹점 현황
const MONEY_SERVICE_NAME = 'RegionMnyFacltStus';

// 경기도 시/군 목록 — 지역화폐 API 의 SIGUN_NM 필터에 사용
// 31개 (28시 + 3군). 설정 모달의 <select id="sigunSelect"> 에 동적 주입됨.
const GG_SIGUNGU = [
  '수원시', '성남시', '고양시', '용인시', '부천시', '안산시', '안양시',
  '화성시', '남양주시', '평택시', '의정부시', '시흥시', '파주시', '광명시',
  '김포시', '군포시', '광주시', '이천시', '양주시', '오산시', '구리시',
  '안성시', '포천시', '의왕시', '하남시', '여주시', '동두천시', '과천시',
  '양평군', '가평군', '연천군'
];

// ============================================================
// gas/config.js — 주유소 전용 상수
//   - ICONS.gas 등록, Opinet 브랜드 코드 매핑, 랭크 스타일, 유종 옵션
// 로드 순서: common/config → money/config → gas/config → common/state → ...
// 의존: common/config.js (ICONS 빈 객체 선언)
// ============================================================

// 주유소 마커 SVG (공통 스타일: 1.6px stroke)
const _GAS_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15"/><path d="M3 20h12"/><path d="M14 8h2a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9l-3-3"/></svg>`;

// ICONS 레지스트리에 주유소 카테고리 등록
ICONS.gas = {
  color: '#B76E4A',
  label: '주유소',
  svg:   _GAS_SVG
};

// Opinet 상표 코드 → 한글 브랜드명 매핑
// 공식 문서 기준 (실제 응답 필드는 POLL_DIV_CO - 문서 오탈자와 다름)
const POLL_DIV_LABEL = {
  SKE: 'SK에너지',
  GSC: 'GS칼텍스',
  HDO: 'HD현대오일뱅크',
  SOL: 'S-OIL',
  RTE: '자영알뜰',
  RTX: '고속도로알뜰',
  NHO: '농협알뜰',
  ETC: '자가상표',
  E1G: 'E1',
  SKG: 'SK가스'
};

// 주유소 최저가 순위(1~5위)별 스타일 — Warm Stone 팔레트와 조화
const RANK_STYLES = {
  1: { color: '#C9A24A', size: 40 },  // 금 (muted gold)
  2: { color: '#AFA69B', size: 38 },  // 은 (taupe silver)
  3: { color: '#B07D53', size: 36 },  // 동 (warm bronze)
  4: { color: '#7E8C5C', size: 34 },  // 올리브 (theme)
  5: { color: '#B76E4A', size: 32 }   // 테라코타 (theme)
};

// 설정 모달의 <select id="prodcdSelect"> 에 주입 (Opinet prodcd 고정값)
const GAS_PRODCD_OPTIONS = [
  { value: 'B027', label: '휘발유 (보통)' },
  { value: 'D047', label: '자동차용 경유' },
  { value: 'B034', label: '고급휘발유' },
  { value: 'K015', label: '자동차용 부탄 (LPG)' },
  { value: 'C004', label: '실내등유' }
];

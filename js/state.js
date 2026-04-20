// ============================================================
// state.js — 전역 상태 + localStorage 마이그레이션
// config.js 이후, app.js 이전에 로드되어야 함 (_CFG.k1 의존)
// ============================================================

// ============================================================
// 상태 관리
// ============================================================
const STATE = {
  // Naver Maps clientId만 클라이언트에 존재. Opinet/GG 키는 서버 전용 (프록시 /api/*).
  naverKey: _CFG.k1 || '',
  // 주유소 유종 — Opinet prodcd (B027 휘발유, D047 경유, B034 고급휘발유, K015 LPG, C004 등유)
  prodcd: localStorage.getItem('prodcd') || 'B027',
  radius: parseInt(localStorage.getItem('radius') || '5000'),
  pageSize: parseInt(localStorage.getItem('pageSize') || '500'),
  // GG OpenAPI 서비스명 — 서버·API 표준 고정값. 향후 카테고리 추가 시 이 객체에 키 추가.
  services: { money: 'RegionMnyFacltStus' },
  sigun: localStorage.getItem('sigun') || '',  // SIGUN_NM 필터 (예: 성남시, 수원시)
  autoSigun: localStorage.getItem('autoSigun') !== 'false',  // 내 위치 기반 자동 시군 감지 (기본 on)
  favorites: JSON.parse(localStorage.getItem('favorites') || '{}'),
  active: { money: false, gas: false, fav: true },
  markers: { money: [], gas: [], fav: [] },
  data: { money: [], gas: [] },
  map: null,
  myLocationMarker: null,
  currentInfoWindow: null,
  centerPos: { lat: 37.4138, lng: 127.5183 } // 경기도청 부근 (기본값)
};

// 문화행사 기능 제거됨 — 기존 즐겨찾기의 culture 항목 정리
{
  let cleaned = false;
  Object.keys(STATE.favorites).forEach(id => {
    if (STATE.favorites[id] && STATE.favorites[id].cat === 'culture') {
      delete STATE.favorites[id];
      cleaned = true;
    }
  });
  // (STATE.services 는 이제 하드코딩된 상수 객체 → culture 키가 들어올 일 없음)
  if (cleaned) localStorage.setItem('favorites', JSON.stringify(STATE.favorites));
}

// Phase 5 — 레거시 localStorage 키 정리 (서버 관리로 전환)
// 과거 버전에서 사용자가 직접 입력했던 키들을 1회성으로 제거
{
  const legacyKeys = ['naverKey', 'ggKey', 'opinetKey', 'kakaoKey', 'services'];
  let removed = 0;
  legacyKeys.forEach(k => {
    if (localStorage.getItem(k) !== null) {
      localStorage.removeItem(k);
      removed++;
    }
  });
  if (removed > 0) console.log(`[migration] 레거시 키 ${removed}개 정리 완료 (서버에서 관리)`);
}


// ============================================================
// truck/api.js — 푸드트럭 데이터 로더
// 의존: common/config.js (GG_API_BASE 간접), common/state.js (STATE),
//       common/api.js (fetchGGApi),
//       truck/config.js (TRUCK_SERVICE_NAME / TRUCK_ACTIVE_STATE_KEYWORDS)
//
// 출력 필드(경기도 OpenAPI):
//   SIGUN_NM, BIZPLC_NM(사업장명), BSN_STATE_NM(영업상태명),
//   SANITTN_INDUTYPE_NM(위생업종명), SANITTN_BIZCOND_NM(위생업태명),
//   REFINE_ROADNM_ADDR, REFINE_LOTNO_ADDR, REFINE_WGS84_LAT, REFINE_WGS84_LOGT
//
// 정책: UNFILTERED_CATEGORIES 멤버 — 시군·반경 필터 무시하고 경기도 전체 표시.
// 단, '폐업' 등 비영업 사업장은 항상 제외 (데이터 신뢰성 차원).
// ============================================================

async function loadTruckData() {
  const items = await fetchGGApi(TRUCK_SERVICE_NAME, {});

  // 폐업 등 비영업 사업장 제외 — 영업상태 필터는 항상 적용
  return items.filter(it => {
    const state = (it.BSN_STATE_NM || '').trim();
    if (!state) return true;
    return TRUCK_ACTIVE_STATE_KEYWORDS.some(kw => state.includes(kw));
  });
}

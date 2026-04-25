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
// ============================================================

async function loadTruckData() {
  // 지역화폐와 동일한 시군 필터 사용 (SIGUN_NM)
  const params = STATE.sigun ? { SIGUN_NM: STATE.sigun } : {};
  const items = await fetchGGApi(TRUCK_SERVICE_NAME, params);

  // 폐업 등 비영업 사업장 제외 — BSN_STATE_NM 에 '영업' 또는 '정상' 키워드 포함 시만 통과
  // 상태값이 비어 있는 경우도 통과시킴(안전장치 — API 필드 결측 대비)
  return items.filter(it => {
    const state = (it.BSN_STATE_NM || '').trim();
    if (!state) return true;
    return TRUCK_ACTIVE_STATE_KEYWORDS.some(kw => state.includes(kw));
  });
}

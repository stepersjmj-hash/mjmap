// ============================================================
// money/api.js — 지역화폐 데이터 로더
// 의존: common/config.js, common/state.js, common/api.js (fetchGGApi),
//       money/config.js (MONEY_SERVICE_NAME)
// ============================================================

async function loadMoneyData() {
  // 지역화폐: 경기도 OpenAPI 의 RegionMnyFacltStus 서비스를 시군 필터와 함께 호출
  // 서버(/api/gg/<service>)가 KEY + Type=json 을 자동 주입하므로 클라이언트는 파라미터만 전달
  const params = STATE.sigun ? { SIGUN_NM: STATE.sigun } : {};
  return fetchGGApi(MONEY_SERVICE_NAME, params);
}

// ============================================================
// street/api.js — 지역 특화거리 데이터 로더
// 의존: common/config.js (GG_API_BASE 간접), common/state.js (STATE),
//       common/api.js (fetchGGApi),
//       street/config.js (STREET_SERVICE_NAME)
//
// 출력 필드(경기도 OpenAPI):
//   SIGUN_NM, DSTNC_NM_INST_NM(거리명), DSTNC_INTRD_INFO(거리소개),
//   REFINE_ROADNM_ADDR, REFINE_LOTNO_ADDR, REFINE_WGS84_LAT/LOGT,
//   TOT_LENG(총길이, m), STORE_CNT(점포수), APPONT_YY(지정연도),
//   MNGINST_TELNO(관리기관전화번호), MANAGE_INST_NM(관리기관명)
//
// 정책: UNFILTERED_CATEGORIES 멤버 — 시군·반경 필터를 모두 무시하고 항상 경기도 전체 표시.
// 데이터 양이 적어(50~100건 수준) 필터링 시 0건이 자주 발생, 사용자 혼란 방지.
// ============================================================

async function loadStreetData() {
  return await fetchGGApi(STREET_SERVICE_NAME, {});
}

// ============================================================
// gas/markers.js — 주유소 전용 마커 확장 훅
//   - 최저가 상위 5개에 _RANK(1~5) 부여. 실제 마커 렌더는 common/markers.js 가 담당.
// 의존: common/api.js (getLatLng)
// 로드 순서: common/markers → gas/markers (common/markers.js::renderMarkers 가 typeof assignGasRanks 체크)
// ============================================================

// 주유소 아이템 배열에 _RANK 를 부여 (기존 _RANK 는 초기화)
// common/markers.js::renderMarkers 에서 cat === 'gas' 일 때 호출됨.
function assignGasRanks(items) {
  // 기존 _RANK 초기화 (재호출 대비)
  items.forEach(it => { delete it._RANK; });

  // 가격 > 0 이고 좌표 있는 항목만 랭킹 후보
  const sortable = items.filter(it => {
    const p = parseFloat(it.PRICE);
    return p > 0 && getLatLng(it).lat;
  });
  sortable.sort((a, b) => parseFloat(a.PRICE) - parseFloat(b.PRICE));
  sortable.slice(0, 5).forEach((it, idx) => { it._RANK = idx + 1; });
}

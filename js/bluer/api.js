// ============================================================
// bluer/api.js — 블루리본 식당 데이터 로더 (정적 JSON)
// 의존: bluer/config.js (BLUER_DATA_URL),
//       common/ui.js (showToast — 런타임 호출 시점엔 정의됨)
//
// 데이터 형식 (geocode_bluer.py 가 생성):
//   _idx, 리본수, 메뉴명, 설명, 연도, 제목, 주소,
//   _LAT, _LNG, _MATCHED_ADDR
//
// 정책: UNFILTERED_CATEGORIES 멤버 — 시군·반경 필터 무시하고 전체 표시.
// ============================================================

// 메모리 캐시 — 같은 세션에서 두 번째 클릭부터는 즉시 반환
let _BLUER_CACHE = null;

async function loadBluerData() {
  if (_BLUER_CACHE) return _BLUER_CACHE;

  try {
    const res = await fetch(BLUER_DATA_URL);
    if (!res.ok) {
      // 404 = 아직 geocoding 안 함
      if (res.status === 404) {
        showToast('블루리본 데이터 없음 — scripts/geocode_bluer.py 실행 필요');
        console.warn('[bluer] data.json 없음. scripts/geocode_bluer.py 실행 후 다시 시도하세요.');
        return [];
      }
      showToast(`블루리본 데이터 로드 실패 (HTTP ${res.status})`);
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      console.warn('[bluer] data.json 형식 오류 — 배열 아님');
      return [];
    }
    _BLUER_CACHE = data;
    console.log(`[bluer] 정적 데이터 ${data.length}개 로드`);
    return data;
  } catch (e) {
    console.error('[bluer] data.json fetch 실패:', e);
    showToast(`블루리본 데이터 로드 실패: ${e.message || e}`);
    return [];
  }
}

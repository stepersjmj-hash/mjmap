// ============================================================
// cafe/api.js — 대형카페 데이터 로더 (정적 JSON)
// 의존: cafe/config.js (LARGE_CAFE_DATA_URL),
//       common/ui.js (showToast — 런타임 호출 시점엔 정의됨)
//
// 원본 JSON 형식:
//   { source, collectedAt, pageRange, count, cafes: [ ... ] }
//   각 cafe: id, name, address, jibunAddress, phone, rating, reviewCount,
//            category, hours, lat, lng, detailUrl, description, parking,
//            services[], subtitle, mainMenus[], seatOptions[], childOptions[],
//            questions[], thumbnailUrl
//
// 공통 헬퍼(getLatLng/getName/getAddr/getCategory/getDescription)와의 호환을 위해
// 로딩 직후 각 항목에 alias 필드를 주입한다:
//   _LAT/_LNG ← lat/lng
//   제목      ← name
//   주소      ← address
//   설명      ← description
//   INDUTYPE_NM ← category
//   TELNO     ← phone
//   주차      ← parking (블루리본 detail 패턴 호환)
// 원본 필드는 보존 — detail 패널이 추가 정보(메뉴/좌석/시간/평점 등) 표시 용도로 직접 사용.
// ============================================================

// 메모리 캐시 — 같은 세션에서 두 번째 클릭부터는 즉시 반환
let _LARGE_CAFE_CACHE = null;

async function loadLargeCafeData() {
  if (_LARGE_CAFE_CACHE) return _LARGE_CAFE_CACHE;

  try {
    const res = await fetch(LARGE_CAFE_DATA_URL, { cache: 'no-cache' });
    if (!res.ok) {
      if (res.status === 404) {
        showToast('대형카페 데이터 없음 — js/cafe/large_cafes.json 확인 필요');
        console.warn('[large_cafe] large_cafes.json 없음.');
        return [];
      }
      showToast(`대형카페 데이터 로드 실패 (HTTP ${res.status})`);
      return [];
    }
    const json = await res.json();
    const cafes = Array.isArray(json) ? json : (json && json.cafes);
    if (!Array.isArray(cafes)) {
      console.warn('[large_cafe] large_cafes.json 형식 오류 — cafes 배열을 찾을 수 없음');
      return [];
    }

    // 공통 헬퍼 호환을 위해 alias 필드 주입
    cafes.forEach(c => {
      if (c._LAT == null && c.lat != null) c._LAT = c.lat;
      if (c._LNG == null && c.lng != null) c._LNG = c.lng;
      if (c['제목'] == null && c.name) c['제목'] = c.name;
      if (c['주소'] == null && c.address) c['주소'] = c.address;
      if (c['설명'] == null && c.description) c['설명'] = c.description;
      if (c.INDUTYPE_NM == null && c.category) c.INDUTYPE_NM = c.category;
      if (c.TELNO == null && c.phone) c.TELNO = c.phone;
      if (c['주차'] == null && c.parking) c['주차'] = c.parking;
    });

    _LARGE_CAFE_CACHE = cafes;
    console.log(`[large_cafe] 정적 데이터 ${cafes.length}개 로드`);
    return cafes;
  } catch (e) {
    console.error('[large_cafe] large_cafes.json fetch 실패:', e);
    showToast(`대형카페 데이터 로드 실패: ${e.message || e}`);
    return [];
  }
}

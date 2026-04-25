// ============================================================
// gas/api.js — 주유소 데이터 로더 (Opinet aroundAll)
// 의존: common/config.js (GAS_API_BASE), common/state.js (STATE),
//       common/ui.js (showToast — 런타임 호출 시점엔 정의됨)
//
// Opinet 주변 주유소 API - aroundAll.do
//   공식: https://www.opinet.co.kr/api/aroundAll.do
//   좌표계: KATEC (x=314681.8, y=544837 형식 — UTM-K 아님!)
//   반경: 최대 5000m, 정렬: 1=거리순 2=가격순
//   응답: XML (<OIL>…</OIL> 반복)
// Opinet 은 해외 IP 차단 + 키 노출 금지 → 서버 프록시(/api/gas/around) 경유
// 좌표 변환(WGS84 ⇄ KATEC)도 서버가 처리 — 클라이언트는 WGS84 그대로 전달
// ============================================================

async function loadGasData() {
  // 서버(/api/gas/around)가 OPINET_API_KEY 주입 + KATEC 좌표변환까지 처리.
  // 클라이언트는 WGS84 좌표·반경·유종만 넘겨주면 됨.
  if (!STATE.centerPos) {
    showToast('지도 중심 위치를 확인할 수 없습니다.');
    return [];
  }

  const radius = Math.min(STATE.radius || 3000, 5000);  // Opinet 최대 5km
  const prodcd = STATE.prodcd || 'B027';

  const qs = new URLSearchParams({
    lat: String(STATE.centerPos.lat),
    lng: String(STATE.centerPos.lng),
    radius: String(radius),
    prodcd: prodcd
  });
  const url = `${GAS_API_BASE}/around?${qs.toString()}`;

  try {
    console.log(`[주유소] 요청: /api/gas/around prodcd=${prodcd} r=${radius}m`);
    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[주유소] HTTP ${res.status}:`, errText);
      showToast(`주유소 데이터 로드 실패 (HTTP ${res.status})`);
      return [];
    }
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    console.log(`[주유소] ${items.length}개 조회됨 (prodcd=${data.prodcd || prodcd})`);

    // 서버 필드(name/price/brand...) → 레거시 필드(OS_NM/PRICE/POLL_DIV_CO...) 매핑
    // downstream (getCategory/getName/getAddr/getLatLng) 는 레거시 네이밍 사용 중이라 유지.
    return items.map(it => ({
      OS_NM: it.name,
      ADDR: it.addr || '',                     // Opinet aroundAll.do 는 주소 미반환 (빈 문자열)
      TELNO: it.tel || '',
      UNI_ID: it.id,
      PRICE: it.price,                         // Number 로 옴 — downstream Number()/parseFloat() 호환
      DISTANCE: it.distance_m,                 // 미터 단위 Number
      POLL_DIV_CO: it.brand,                   // SKE/GSC/HDO/SOL/RTE 등
      PRODCD: it.prodcd || prodcd,
      _LAT: it.lat,
      _LNG: it.lng
    })).filter(o => o._LAT && o._LNG);
  } catch (e) {
    console.error('[주유소] 호출 실패:', e);
    if (e.message && (e.message.includes('Failed to fetch') || e.name === 'TypeError')) {
      showToast('프록시 연결 실패 — NAS/로컬 프록시가 실행 중인지 확인하세요.');
    } else {
      showToast(`주유소 데이터 로드 실패: ${e.message || e}`);
    }
    return [];
  }
}

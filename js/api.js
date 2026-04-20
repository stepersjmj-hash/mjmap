// ============================================================
// api.js — API 레이어 (프록시 엔드포인트 호출, 응답 파싱, 데이터 유틸)
// 의존: config.js (PROXY_ROOT/GG_API_BASE/GAS_API_BASE/POLL_DIV_LABEL),
//       state.js (STATE),
//       app.js (showToast — 런타임 호출 시점엔 이미 정의됨)
// 로드 순서: config → state → api → app
// ============================================================

// ============================================================
// API 호출 - 경기도 공공데이터 (CORS 우회를 위해 GET 사용 + JSON)
// 경기도 openapi.gg.go.kr는 표준 형식:
//   /{서비스명}?KEY=...&Type=json&pIndex=1&pSize=100&[추가파라미터]
// ============================================================
async function fetchGGApi(service, params = {}, pSize = STATE.pageSize) {
  // 경기도 공공데이터: 서버(/api/gg/<service>)가 GG_API_KEY 를 주입하므로
  // 여기서는 KEY 파라미터를 보내지 않음. Type=json 기본값도 서버가 주입.
  const qs = new URLSearchParams({
    pIndex: '1',
    pSize: String(pSize),
    ...params
  });
  const url = `${GG_API_BASE}/${service}?${qs.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // 경기도 API 응답 구조: { 서비스명: [ { head: [...] }, { row: [...] } ] }
    // 서버는 JSON 을 투명하게 패스스루하므로 구조 동일.
    const root = data[service];
    if (!root) {
      // 에러 응답 처리
      if (data.RESULT) {
        console.error('API 에러:', data.RESULT);
        showToast(`API 오류: ${data.RESULT.MESSAGE || '알 수 없음'}`);
      }
      return [];
    }
    const rowBlock = root.find(item => item.row);
    return rowBlock ? rowBlock.row : [];
  } catch (e) {
    console.error(`API 호출 실패 (${service}):`, e);
    if (e.message.includes('Failed to fetch') || e.name === 'TypeError') {
      showToast('프록시 연결 실패 — NAS/로컬 프록시가 실행 중인지 확인하세요.');
    } else {
      showToast(`데이터 로드 실패: ${e.message}`);
    }
    return [];
  }
}

// 카테고리별 데이터 로드
async function loadMoneyData() {
  const params = STATE.sigun ? { SIGUN_NM: STATE.sigun } : {};
  return fetchGGApi(STATE.services.money, params);
}
// ============================================================
// Opinet 주변 주유소 API - aroundAll.do
// 공식 문서: https://www.opinet.co.kr/api/aroundAll.do
// 좌표계: KATEC (x=314681.8, y=544837 형식 — UTM-K 아님!)
// 반경: 최대 5000m, 정렬: 1=거리순 2=가격순
// 응답: XML (<OIL>…</OIL> 반복)
// 중요: Opinet 은 해외 IP 차단 + 키 노출 금지 → 서버 프록시(/api/gas/around) 경유
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

// ============================================================
// 좌표 추출 헬퍼 - 경기도 API는 다양한 필드명을 사용
// ============================================================
function getLatLng(item) {
  const lat = parseFloat(
    item._LAT || // Opinet에서 변환된 값 (우선)
    item.REFINE_WGS84_LAT || item.LAT || item.LATITUDE || item.WGS84LAT ||
    item.YCRD || item.Y_CRDNT || item.MAP_Y || 0
  );
  const lng = parseFloat(
    item._LNG || // Opinet에서 변환된 값 (우선)
    item.REFINE_WGS84_LOGT || item.LNG || item.LON || item.LONGITUDE || item.WGS84LOGT ||
    item.XCRD || item.X_CRDNT || item.MAP_X || 0
  );
  return { lat, lng };
}

function getName(item) {
  return item.CMPNM_NM || item.FCLTY_NM || item.GAS_STN_NM || item.OS_NM ||
         item.NM || item.BIZ_NM || '이름 없음';
}

function getAddr(item) {
  return item.REFINE_ROADNM_ADDR || item.REFINE_LOTNO_ADDR || item.ADDR ||
         item.ROAD_ADDR || item.NEW_ADR || item.LOC || item.PLACE || '';
}

function getCategory(item) {
  // Opinet 주유소 — 브랜드 · 가격 · 거리
  const pollCode = item.POLL_DIV_CO || item.POLL_DIV_CD;
  if (pollCode) {
    const brand = POLL_DIV_LABEL[pollCode] || pollCode;
    const parts = [brand];
    if (item.PRICE && Number(item.PRICE) > 0) {
      parts.push(Number(item.PRICE).toLocaleString() + '원');
    }
    if (item.DISTANCE && Number(item.DISTANCE) > 0) {
      const km = Number(item.DISTANCE) / 1000;
      parts.push(km.toFixed(km < 10 ? 1 : 0) + 'km');
    }
    return parts.join(' · ');
  }
  // 레거시: 카카오 브랜드 (사용 안 함, 하위 호환용)
  if (item._BRAND) return item._BRAND;
  return item.INDUTYPE_NM || item.CATEGORY || item.SIGUN_NM || '';
}

function buildId(cat, item) {
  const ll = getLatLng(item);
  return `${cat}::${getName(item)}::${ll.lat.toFixed(5)}_${ll.lng.toFixed(5)}`;
}

// 거리 계산 (km)
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// 반경 필터
function filterByRadius(items, centerLat, centerLng, radiusM) {
  if (!radiusM || radiusM === 0) return items;
  const radiusKm = radiusM / 1000;
  return items.filter(item => {
    const ll = getLatLng(item);
    if (!ll.lat || !ll.lng) return false;
    return distanceKm(centerLat, centerLng, ll.lat, ll.lng) <= radiusKm;
  });
}


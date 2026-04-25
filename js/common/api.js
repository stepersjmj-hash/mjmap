// ============================================================
// common/api.js — 공통 API 헬퍼 (fetchGGApi, 좌표·이름·주소 추출, 반경 필터)
// 의존: common/config.js (GG_API_BASE), common/state.js (STATE),
//       gas/config.js (POLL_DIV_LABEL — getCategory 내부 참조),
//       common/ui.js (showToast — 런타임 호출 시점엔 정의됨)
// 기능별 loader(loadMoneyData / loadGasData)는 각 기능 api 에 위치
// ============================================================

// 경기도 공공데이터 공통 호출기 — /api/gg/<service> 엔드포인트 사용
// 서버가 KEY + Type=json 주입. 응답 구조: { 서비스명: [ {head:[...]}, {row:[...]} ] }
async function fetchGGApi(service, params = {}, pSize = STATE.pageSize) {
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
    const root = data[service];
    if (!root) {
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

// ============================================================
// 아이템 필드 추출 헬퍼 — 경기도 API 는 API 별로 필드명이 다름
// (money, gas 모두 아래 공통 필드 셋으로 처리 가능하도록 설계됨)
// ============================================================
function getLatLng(item) {
  const lat = parseFloat(
    item._LAT || // Opinet 에서 변환된 값 (우선)
    item.REFINE_WGS84_LAT || item.LAT || item.LATITUDE || item.WGS84LAT ||
    item.YCRD || item.Y_CRDNT || item.MAP_Y || 0
  );
  const lng = parseFloat(
    item._LNG || // Opinet 에서 변환된 값 (우선)
    item.REFINE_WGS84_LOGT || item.LNG || item.LON || item.LONGITUDE || item.WGS84LOGT ||
    item.XCRD || item.X_CRDNT || item.MAP_X || 0
  );
  return { lat, lng };
}

function getName(item) {
  return item.CMPNM_NM || item.FCLTY_NM || item.GAS_STN_NM || item.OS_NM ||
         item.BIZPLC_NM ||                    // 푸드트럭(Resrestrtfodtuck): 사업장명
         item.NM || item.BIZ_NM || '이름 없음';
}

function getAddr(item) {
  return item.REFINE_ROADNM_ADDR || item.REFINE_LOTNO_ADDR || item.ADDR ||
         item.ROAD_ADDR || item.NEW_ADR || item.LOC || item.PLACE || '';
}

// 카테고리 문자열 — 주유소는 "브랜드 · 가격 · 거리" 조합, 지역화폐는 업종/시군 단일
// POLL_DIV_LABEL 은 gas/config.js 에서 정의 (선행 로드 순서 보장)
function getCategory(item) {
  // 주유소: POLL_DIV_CO 필드가 있으면 주유소 항목으로 판단
  const pollCode = item.POLL_DIV_CO || item.POLL_DIV_CD;
  if (pollCode) {
    const brand = (typeof POLL_DIV_LABEL !== 'undefined' && POLL_DIV_LABEL[pollCode]) || pollCode;
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
  // 푸드트럭(Resrestrtfodtuck): 위생업종명 · 위생업태명 (예: "휴게음식점 · 푸드트럭")
  if (item.SANITTN_INDUTYPE_NM || item.SANITTN_BIZCOND_NM) {
    return [item.SANITTN_INDUTYPE_NM, item.SANITTN_BIZCOND_NM].filter(Boolean).join(' · ');
  }
  return item.INDUTYPE_NM || item.CATEGORY || item.SIGUN_NM || '';
}

function buildId(cat, item) {
  const ll = getLatLng(item);
  return `${cat}::${getName(item)}::${ll.lat.toFixed(5)}_${ll.lng.toFixed(5)}`;
}

// 거리 계산 (km) — Haversine
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// 반경 필터 — radiusM=0 은 "제한 없음"
function filterByRadius(items, centerLat, centerLng, radiusM) {
  if (!radiusM || radiusM === 0) return items;
  const radiusKm = radiusM / 1000;
  return items.filter(item => {
    const ll = getLatLng(item);
    if (!ll.lat || !ll.lng) return false;
    return distanceKm(centerLat, centerLng, ll.lat, ll.lng) <= radiusKm;
  });
}

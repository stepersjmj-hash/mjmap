// ============================================================
// common/markers.js — 마커 아이콘·렌더링, InfoWindow, 클러스터, 길찾기 URL
// 의존: common/config.js (ICONS/LINE_ICONS), common/state.js (STATE),
//       common/api.js (getLatLng/getName/getAddr/getCategory/buildId),
//       gas/config.js (RANK_STYLES — rank 분기용),
//       gas/markers.js (assignGasRanks — 존재 시 주유소 렌더 전 호출),
//       common/ui.js (openPanel/renderListItem/toggleFavoriteFromIW/showToast — 런타임)
// ============================================================

// 라운디드 스퀘어 핀 + 인라인 라인 SVG (Warm Stone × Sand Ivory 테마)
// - 주유소(gas)는 가독성을 위해 솔리드 배경 + 아이보리 아이콘으로 반전 렌더링
// - rank 가 있으면 (주유소 최저가 1~5위) 가격 태그 + 랭크 숫자 스타일로 대체 (RANK_STYLES 참조)
function makeMarkerIcon(cat, isFav, rank, item) {
  const conf = ICONS[cat] || { color: '#8B8275', svg: LINE_ICONS.pin };
  const IVORY = '#FFFDF8';
  const FAV_BORDER = '#9B6A7C';

  // rank 마커 (주유소 전용 — RANK_STYLES 는 gas/config.js 에서 로드)
  const hasRankStyle = typeof RANK_STYLES !== 'undefined' && rank && RANK_STYLES[rank];
  if (hasRankStyle) {
    const r = RANK_STYLES[rank];
    const showPrice = item && item.PRICE;
    const priceStr = showPrice ? `${Number(item.PRICE).toLocaleString()}원` : '';

    const pinSize = r.size;
    const containerWidth = showPrice ? 96 : pinSize + 10;
    const tagHeight = showPrice ? 26 : 0;
    const tagGap = showPrice ? 6 : 0;
    const stemHeight = 8;
    const containerHeight = tagHeight + tagGap + pinSize + stemHeight;
    const pinLeft = (containerWidth - pinSize) / 2;
    const pinTop = tagHeight + tagGap;

    const tagHtml = showPrice ? `
        <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);background:${r.color};border:1px solid ${r.color};border-radius:8px;padding:3px 9px;font-size:12px;font-weight:700;color:${IVORY};line-height:18px;box-shadow:0 2px 6px rgba(26,23,19,0.2);white-space:nowrap;letter-spacing:-0.01em;">${priceStr}</div>
      ` : '';

    return {
      content: `<div style="position:relative;width:${containerWidth}px;height:${containerHeight}px;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Segoe UI','Noto Sans KR',sans-serif;">
        ${tagHtml}
        <div style="position:absolute;top:${pinTop}px;left:${pinLeft}px;width:${pinSize}px;height:${pinSize}px;background:${r.color};border:1.5px solid ${r.color};border-radius:12px;display:flex;align-items:center;justify-content:center;color:${IVORY};font-weight:700;font-size:${Math.max(13, pinSize - 20)}px;letter-spacing:-0.02em;box-shadow:0 4px 10px -2px rgba(26,23,19,0.25);">${rank}</div>
        <div style="position:absolute;top:${pinTop + pinSize}px;left:50%;transform:translateX(-50%);width:1.5px;height:${stemHeight}px;background:${r.color};"></div>
      </div>`,
      anchor: new naver.maps.Point(containerWidth / 2, containerHeight - 2)
    };
  }

  // 일반 단일 마커 — gas는 반전(solid bg + ivory icon), 그 외는 기본(ivory bg + 컬러 아이콘)
  const isGas = cat === 'gas';
  const bgColor     = isGas ? conf.color : IVORY;
  const iconColor   = isGas ? IVORY      : conf.color;
  const borderColor = isFav ? FAV_BORDER : conf.color;
  const stemColor   = isFav ? FAV_BORDER : conf.color;

  return {
    content: `<div style="position:relative;width:40px;height:52px;font-family:inherit;">
      <div style="position:absolute;top:0;left:2px;width:36px;height:36px;background:${bgColor};border:1.5px solid ${borderColor};border-radius:12px;display:flex;align-items:center;justify-content:center;color:${iconColor};box-shadow:0 4px 10px -2px rgba(26,23,19,0.2);">${conf.svg}</div>
      <div style="position:absolute;top:36px;left:50%;transform:translateX(-50%);width:1.5px;height:8px;background:${stemColor};"></div>
    </div>`,
    anchor: new naver.maps.Point(20, 48)
  };
}

// 즐겨찾기 마커 — 일반 마커 + 우상단 하트 배지 (favorites.js 에서 재사용)
function makeFavoriteMarkerIcon(cat) {
  const conf = ICONS[cat] || { color: '#9B6A7C', svg: LINE_ICONS.pin };
  const IVORY = '#FFFDF8';
  const FAV_BORDER = '#9B6A7C';
  const isGas = cat === 'gas';
  const bgColor   = isGas ? conf.color : IVORY;
  const iconColor = isGas ? IVORY      : conf.color;
  return {
    content: `<div style="position:relative;width:40px;height:54px;font-family:inherit;">
      <div style="position:absolute;top:0;left:2px;width:36px;height:36px;background:${bgColor};border:1.5px solid ${FAV_BORDER};border-radius:12px;display:flex;align-items:center;justify-content:center;color:${iconColor};box-shadow:0 4px 12px -2px rgba(155,106,124,0.35);">${conf.svg}</div>
      <div style="position:absolute;top:-5px;right:-2px;width:18px;height:18px;background:${FAV_BORDER};color:${IVORY};border:2px solid ${IVORY};border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(26,23,19,0.25);">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </div>
      <div style="position:absolute;top:36px;left:50%;transform:translateX(-50%);width:1.5px;height:8px;background:${FAV_BORDER};"></div>
    </div>`,
    anchor: new naver.maps.Point(20, 48)
  };
}

// 클러스터 마커 아이콘 — 같은 시각 언어 + 우상단 숫자 배지
function makeClusterIcon(cat, count) {
  const conf = ICONS[cat] || { color: '#8B8275', svg: LINE_ICONS.pin };
  const countText = count > 99 ? '99+' : String(count);
  return {
    content: `<div style="position:relative;width:48px;height:58px;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Segoe UI','Noto Sans KR',sans-serif;">
      <div style="position:absolute;top:0;left:4px;width:40px;height:40px;background:${conf.color};border:1.5px solid ${conf.color};border-radius:12px;display:flex;align-items:center;justify-content:center;color:#FFFDF8;box-shadow:0 6px 12px -2px rgba(26,23,19,0.25);">${conf.svg.replace('stroke="currentColor"','stroke="#FFFDF8"')}</div>
      <div style="position:absolute;top:-4px;right:0;min-width:22px;height:22px;padding:0 7px;background:#1A1713;color:#FFFDF8;border:2px solid #FFFDF8;border-radius:11px;font-size:11px;font-weight:700;line-height:18px;text-align:center;box-shadow:0 2px 4px rgba(26,23,19,0.3);letter-spacing:-0.02em;">${countText}</div>
      <div style="position:absolute;top:40px;left:50%;transform:translateX(-50%);width:1.5px;height:10px;background:${conf.color};"></div>
    </div>`,
    anchor: new naver.maps.Point(24, 54)
  };
}

function clearMarkers(cat) {
  STATE.markers[cat].forEach(m => m.setMap(null));
  STATE.markers[cat] = [];
}

// 카테고리 공통 렌더러 — 같은 좌표 항목은 그룹화하여 클러스터 마커로 표시
// 카테고리 전용 전처리는 해당 모듈의 훅을 호출 (현재는 주유소 assignGasRanks 만 존재)
function renderMarkers(cat, items) {
  clearMarkers(cat);

  // 카테고리별 전처리 훅 (예: 주유소 최저가 rank 부여)
  if (cat === 'gas' && typeof assignGasRanks === 'function') {
    assignGasRanks(items);
  }

  // 같은 좌표(소수점 4자리까지 동일)의 항목들을 그룹화하여 클러스터 마커로 표시
  const groups = {};
  items.forEach(item => {
    const ll = getLatLng(item);
    if (!ll.lat || !ll.lng) return;
    const key = `${ll.lat.toFixed(4)}_${ll.lng.toFixed(4)}`;
    if (!groups[key]) groups[key] = { lat: ll.lat, lng: ll.lng, items: [] };
    groups[key].items.push(item);
  });

  Object.values(groups).forEach(group => {
    if (group.items.length === 1) {
      // 단일 마커
      const item = group.items[0];
      const id = buildId(cat, item);
      const isFav = !!STATE.favorites[id];
      const rank = item._RANK; // 주유소 1~5위만 값 있음
      const zIndex = rank ? (700 - rank * 10) : undefined; // 1등=690, 2등=680, ... 5등=650
      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(group.lat, group.lng),
        map: STATE.map,
        icon: makeMarkerIcon(cat, isFav, rank, item),
        title: rank ? `${rank}위 최저가 · ${getName(item)}` : getName(item),
        ...(zIndex !== undefined ? { zIndex } : {})
      });
      naver.maps.Event.addListener(marker, 'click', () => openInfoWindow(marker, cat, item));
      STATE.markers[cat].push(marker);
    } else {
      // 클러스터 마커
      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(group.lat, group.lng),
        map: STATE.map,
        icon: makeClusterIcon(cat, group.items.length),
        title: `${ICONS[cat].label} ${group.items.length}건`,
        zIndex: 200
      });
      naver.maps.Event.addListener(marker, 'click', () => openClusterPanel(cat, group));
      STATE.markers[cat].push(marker);
    }
  });
}

// 클러스터 클릭 시 사이드 패널에 해당 좌표의 모든 항목 표시
function openClusterPanel(cat, group) {
  STATE.map.setCenter(new naver.maps.LatLng(group.lat, group.lng));
  if (STATE.map.getZoom() < 15) STATE.map.setZoom(15);

  const panel = document.getElementById('sidePanel');
  const title = document.getElementById('panelTitle');
  const body = document.getElementById('panelBody');
  panel.classList.add('open');
  title.textContent = `${ICONS[cat].label} · ${group.items.length}건 (같은 위치)`;
  body.innerHTML = group.items.map(item => renderListItem(cat, item, !!STATE.favorites[buildId(cat, item)])).join('');
}

// target: Marker 객체 또는 LatLng (둘 다 infoWindow.open에서 지원)
function openInfoWindow(target, cat, item) {
  if (STATE.currentInfoWindow) STATE.currentInfoWindow.close();
  const id = buildId(cat, item);
  const isFav = !!STATE.favorites[id];
  const conf = ICONS[cat];
  const name = getName(item);
  const addr = getAddr(item);
  const category = getCategory(item);
  const ll = getLatLng(item);
  const phone = item.TELNO || item.TELNO_INFO || item.MNGINST_TELNO || '';

  const content = `
    <div class="iw">
      <div class="iw-cat" style="color:${conf.color};">
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${conf.color};"></span>
        ${escapeHtml(conf.label)}${category ? ' · ' + escapeHtml(category) : ''}
      </div>
      <h3>${escapeHtml(name)}</h3>
      ${addr ? `<p>${LINE_ICONS.locpin}<span>${escapeHtml(addr)}</span></p>` : ''}
      ${phone ? `<p>${LINE_ICONS.phone}<span>${escapeHtml(phone)}</span></p>` : ''}
      <div class="iw-actions">
        <button class="fav-iw ${isFav?'active':''}" onclick="toggleFavoriteFromIW('${id.replace(/'/g, "\\'")}', '${cat}')">${LINE_ICONS.heart}<span>${isFav ? '해제' : '즐겨찾기'}</span></button>
        <button onclick="openNaverDirections(${ll.lat}, ${ll.lng}, '${escapeHtml(name).replace(/'/g, "\\'")}')">${LINE_ICONS.nav}<span>길찾기</span></button>
      </div>
    </div>
  `;

  const infoWindow = new naver.maps.InfoWindow({
    content: content,
    borderColor: '#E3DBCB',
    borderWidth: 1,
    backgroundColor: '#FFFDF8',
    anchorColor: '#FFFDF8',
    pixelOffset: new naver.maps.Point(0, -8)
  });
  infoWindow.open(STATE.map, target);
  STATE.currentInfoWindow = infoWindow;

  STATE._lastClickedItem = { cat, item, id };
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function openNaverDirections(lat, lng, name) {
  // 네이버 지도 길찾기 URL (자동차 모드)
  //   - 출발지 위치는 "-"로 비워 네이버 지도가 브라우저의 현재 위치를 사용하도록 함
  //   - 도착지: lng,lat,이름,,PLACE_POI 포맷
  const destName = encodeURIComponent(name || '목적지');
  const url = `https://map.naver.com/p/directions/-/${lng},${lat},${destName},,PLACE_POI/-/car`;
  window.open(url, '_blank');
}

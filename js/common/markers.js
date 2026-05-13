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
// - isActive=true 면 색상 반전 (배경 IVORY + 아이콘 카테고리 색) — 현재 선택된 마커 강조
function makeMarkerIcon(cat, isFav, rank, item, isActive) {
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

    // 활성화 시 색상 반전: 배경 IVORY + 글자(랭크 번호) 카테고리 색
    const rankBg    = isActive ? IVORY : r.color;
    const rankFg    = isActive ? r.color : IVORY;

    return {
      content: `<div style="position:relative;width:${containerWidth}px;height:${containerHeight}px;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Segoe UI','Noto Sans KR',sans-serif;">
        ${tagHtml}
        <div style="position:absolute;top:${pinTop}px;left:${pinLeft}px;width:${pinSize}px;height:${pinSize}px;background:${rankBg};border:1.5px solid ${r.color};border-radius:12px;display:flex;align-items:center;justify-content:center;color:${rankFg};font-weight:700;font-size:${Math.max(13, pinSize - 20)}px;letter-spacing:-0.02em;box-shadow:0 4px 10px -2px rgba(26,23,19,0.25);">${rank}</div>
        <div style="position:absolute;top:${pinTop + pinSize}px;left:50%;transform:translateX(-50%);width:1.5px;height:${stemHeight}px;background:${r.color};"></div>
      </div>`,
      anchor: new naver.maps.Point(containerWidth / 2, containerHeight - 2)
    };
  }

  // 오늘 휴무 여부 → 회색 톤으로 마커 변경 (isClosedToday 는 common/api.js)
  const CLOSED_GREY = '#A8A29A';
  const isClosed = (typeof isClosedToday === 'function') && isClosedToday(item);

  // 일반 단일 마커 — 모든 카테고리 솔리드 배경 + 아이보리 아이콘으로 통일
  // 휴무면 카테고리 컬러 대신 회색. 즐겨찾기 핑크 테두리는 휴무 여부와 무관하게 유지.
  const bgColor     = isClosed ? CLOSED_GREY : conf.color;
  const iconColor   = IVORY;
  const borderColor = isFav ? FAV_BORDER : (isClosed ? CLOSED_GREY : conf.color);
  const stemColor   = isFav ? FAV_BORDER : (isClosed ? CLOSED_GREY : conf.color);

  // 블루리본: 리본수만큼 마커 위에 작은 리본 표시 (1~3개)
  const ribbonCount = (cat === 'bluer' && item) ? Math.min(Number(item['리본수']) || 0, 3) : 0;
  const ribbonH = 12;
  const markerTop = ribbonCount > 0 ? ribbonH + 4 : 0;
  const containerH = 52 + markerTop;

  let ribbonsHtml = '';
  if (ribbonCount > 0) {
    const ribbonW = 9, gap = 2;
    const totalW = ribbonCount * ribbonW + (ribbonCount - 1) * gap;
    const startX = (40 - totalW) / 2;
    for (let i = 0; i < ribbonCount; i++) {
      const x = startX + i * (ribbonW + gap);
      ribbonsHtml += `<svg style="position:absolute;top:0;left:${x}px;" width="${ribbonW}" height="${ribbonH}" viewBox="0 0 9 12" fill="${conf.color}" stroke="${IVORY}" stroke-width="0.5"><path d="M0 0 L9 0 L9 11 L4.5 8 L0 11 Z"/></svg>`;
    }
  }

  // 활성화 시 색상 반전: 흰색(아이보리) 배경 + 카테고리 색 아이콘
  // 테두리 색은 기존 borderColor 그대로 (즐겨찾기 핑크 / 휴무 회색 유지)
  const activeBg   = isActive ? IVORY : bgColor;
  const activeIcon = isActive ? (isClosed ? CLOSED_GREY : conf.color) : iconColor;

  return {
    content: `<div style="position:relative;width:40px;height:${containerH}px;font-family:inherit;">
      ${ribbonsHtml}
      <div style="position:absolute;top:${markerTop}px;left:2px;width:36px;height:36px;background:${activeBg};border:1.5px solid ${borderColor};border-radius:12px;display:flex;align-items:center;justify-content:center;color:${activeIcon};box-shadow:0 4px 10px -2px rgba(26,23,19,0.2);">${conf.svg}</div>
      <div style="position:absolute;top:${markerTop + 36}px;left:50%;transform:translateX(-50%);width:1.5px;height:8px;background:${stemColor};"></div>
    </div>`,
    anchor: new naver.maps.Point(20, markerTop + 48)
  };
}

// 즐겨찾기 마커 — 일반 마커 + 우상단 하트 배지 (favorites.js 에서 재사용)
// isActive=true 면 색상 반전 (배경 IVORY + 아이콘 카테고리 색)
function makeFavoriteMarkerIcon(cat, item, isActive) {
  const conf = ICONS[cat] || { color: '#9B6A7C', svg: LINE_ICONS.pin };
  const IVORY = '#FFFDF8';
  const FAV_BORDER = '#9B6A7C';
  const CLOSED_GREY = '#A8A29A';
  // 모든 카테고리 솔리드 배경 + 아이보리 아이콘으로 통일 (단일 마커와 동일)
  // 휴무면 카테고리 컬러 대신 회색, 핑크 테두리는 즐겨찾기 표시이므로 유지
  const isClosed = (typeof isClosedToday === 'function') && isClosedToday(item);
  const bgColor   = isClosed ? CLOSED_GREY : conf.color;
  const iconColor = IVORY;
  // 활성화 시 색상 반전: 흰색 배경 + 카테고리 색 아이콘 (테두리는 핑크 유지)
  const activeBg   = isActive ? IVORY : bgColor;
  const activeIcon = isActive ? (isClosed ? CLOSED_GREY : conf.color) : iconColor;
  return {
    content: `<div style="position:relative;width:40px;height:54px;font-family:inherit;">
      <div style="position:absolute;top:0;left:2px;width:36px;height:36px;background:${activeBg};border:1.5px solid ${FAV_BORDER};border-radius:12px;display:flex;align-items:center;justify-content:center;color:${activeIcon};box-shadow:0 4px 12px -2px rgba(155,106,124,0.35);">${conf.svg}</div>
      <div style="position:absolute;top:-5px;right:-2px;width:18px;height:18px;background:${FAV_BORDER};color:${IVORY};border:2px solid ${IVORY};border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(26,23,19,0.25);">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </div>
      <div style="position:absolute;top:36px;left:50%;transform:translateX(-50%);width:1.5px;height:8px;background:${FAV_BORDER};"></div>
    </div>`,
    anchor: new naver.maps.Point(20, 48)
  };
}

// 클러스터 마커 아이콘 — 같은 시각 언어 + 우상단 숫자 배지
// isActive=true 면 색상 반전 (배경 IVORY + 아이콘 카테고리 색) — 클러스터 사이드 패널 열림 시
function makeClusterIcon(cat, count, isActive) {
  const conf = ICONS[cat] || { color: '#8B8275', svg: LINE_ICONS.pin };
  const countText = count > 99 ? '99+' : String(count);
  // 활성화 시 색상 반전: 흰색 배경 + 카테고리 색 아이콘
  const clusterBg   = isActive ? '#FFFDF8' : conf.color;
  const clusterFg   = isActive ? conf.color : '#FFFDF8';
  const clusterSvg  = conf.svg.replace('stroke="currentColor"', `stroke="${clusterFg}"`);
  return {
    content: `<div style="position:relative;width:48px;height:58px;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Segoe UI','Noto Sans KR',sans-serif;">
      <div style="position:absolute;top:0;left:4px;width:40px;height:40px;background:${clusterBg};border:1.5px solid ${conf.color};border-radius:12px;display:flex;align-items:center;justify-content:center;color:${clusterFg};box-shadow:0 6px 12px -2px rgba(26,23,19,0.25);">${clusterSvg}</div>
      <div style="position:absolute;top:-4px;right:0;min-width:22px;height:22px;padding:0 7px;background:${conf.color};color:#FFFDF8;border:2px solid #FFFDF8;border-radius:11px;font-size:11px;font-weight:700;line-height:18px;text-align:center;box-shadow:0 2px 4px rgba(26,23,19,0.3);letter-spacing:-0.02em;">${countText}</div>
      <div style="position:absolute;top:40px;left:50%;transform:translateX(-50%);width:1.5px;height:10px;background:${conf.color};"></div>
    </div>`,
    anchor: new naver.maps.Point(24, 54)
  };
}

// ============================================================
// 활성 마커 관리 — InfoWindow / 상세 패널이 열려있는 동안 선택된 마커를 강조
// STATE.activeMarker / STATE.activeMarkerCtx 를 통해 단일 활성 마커 추적
// ============================================================

// 마커에 활성화 아이콘 적용 (이전 활성 마커는 자동으로 원상복구)
// ctx: { cat, item, isFav, rank, isCluster, count }
function setActiveMarker(marker, ctx) {
  if (!marker || !ctx) return;
  // 동일 마커 재선택이면 무시 (불필요한 setIcon 방지)
  if (STATE.activeMarker === marker) return;
  // 기존 활성 마커가 있으면 먼저 복구
  clearActiveMarker();
  try {
    const icon = ctx.isCluster
      ? makeClusterIcon(ctx.cat, ctx.count, true)
      : (ctx.cat === 'fav-layer'
          ? makeFavoriteMarkerIcon(ctx.favCat, ctx.item, true)
          : makeMarkerIcon(ctx.cat, !!ctx.isFav, ctx.rank, ctx.item, true));
    marker.setIcon(icon);
    // 활성 마커는 항상 다른 마커 위로 (선택 강조 + 클릭 영역 우선)
    if (typeof marker.setZIndex === 'function') marker.setZIndex(999);
  } catch (e) {
    console.warn('[setActiveMarker] icon 적용 실패', e);
  }
  STATE.activeMarker = marker;
  STATE.activeMarkerCtx = ctx;
}

// 현재 활성 마커를 원래 아이콘으로 복구
function clearActiveMarker() {
  const marker = STATE.activeMarker;
  const ctx    = STATE.activeMarkerCtx;
  STATE.activeMarker = null;
  STATE.activeMarkerCtx = null;
  if (!marker || !ctx) return;
  try {
    // 마커가 이미 지도에서 제거된 경우 (clearMarkers 호출 후) setIcon 실패 가능 → try/catch
    const icon = ctx.isCluster
      ? makeClusterIcon(ctx.cat, ctx.count, false)
      : (ctx.cat === 'fav-layer'
          ? makeFavoriteMarkerIcon(ctx.favCat, ctx.item, false)
          : makeMarkerIcon(ctx.cat, !!ctx.isFav, ctx.rank, ctx.item, false));
    marker.setIcon(icon);
    // 원래 zIndex 복구 — 단일(기본)/클러스터(200)/즐겨찾기(500)/랭크(700-rank*10)
    if (typeof marker.setZIndex === 'function') {
      if (ctx.isCluster) marker.setZIndex(200);
      else if (ctx.cat === 'fav-layer') marker.setZIndex(500);
      else if (ctx.rank) marker.setZIndex(700 - ctx.rank * 10);
      else marker.setZIndex(undefined);
    }
  } catch (e) {
    // 마커가 이미 제거되었으면 무시
  }
}

function clearMarkers(cat) {
  // 제거 대상에 현재 활성 마커가 포함되어 있으면 ref 만 정리 (setIcon 호출 불필요)
  if (STATE.activeMarker && STATE.markers[cat] && STATE.markers[cat].includes(STATE.activeMarker)) {
    STATE.activeMarker = null;
    STATE.activeMarkerCtx = null;
  }
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
      naver.maps.Event.addListener(marker, 'click', () => {
        if (typeof suppressOutsideClose === 'function') suppressOutsideClose();
        openInfoWindow(marker, cat, item);
      });
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
      naver.maps.Event.addListener(marker, 'click', () => {
        if (typeof suppressOutsideClose === 'function') suppressOutsideClose();
        openClusterPanel(cat, group);
        // 클러스터 마커 활성화 표시
        setActiveMarker(marker, { cat, isCluster: true, count: group.items.length });
      });
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
  // 새 InfoWindow 열기 전 기존 활성 마커 복구 (목록 클릭으로 다른 항목 진입 등)
  clearActiveMarker();
  const id = buildId(cat, item);
  const isFav = !!STATE.favorites[id];
  const conf = ICONS[cat];
  const name = getName(item);
  const addr = getAddr(item);
  const category = getCategory(item);
  const ll = getLatLng(item);
  const phone = item.TELNO || item.TELNO_INFO || item.MNGINST_TELNO || '';
  const desc  = getDescription(item);

  const closedToday = (typeof isClosedToday === 'function') && isClosedToday(item);
  const closedHtml = closedToday ? `<div class="iw-closed">오늘 휴무</div>` : '';

  const content = `
    <div class="iw">
      <div class="iw-cat" style="color:${conf.color};">
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${conf.color};"></span>
        ${escapeHtml(conf.label)}${category ? ' · ' + escapeHtml(category) : ''}
      </div>
      <h3>${escapeHtml(name)}</h3>
      ${closedHtml}
      ${desc ? `<p class="iw-desc">${escapeHtml(desc)}</p>` : ''}
      ${addr ? `<p>${LINE_ICONS.locpin}<span>${escapeHtml(addr)}</span></p>` : ''}
      ${phone ? `<p>${LINE_ICONS.phone}<span>${escapeHtml(phone)}</span></p>` : ''}
      <div class="iw-actions">
        <button class="fav-iw ${isFav?'active':''}" onclick="toggleFavoriteFromIW('${id.replace(/'/g, "\'")}', '${cat}')">${LINE_ICONS.heart}<span>${isFav ? '해제' : '즐겨찾기'}</span></button>
        <button onclick="openNaverDirections(${ll.lat}, ${ll.lng}, '${escapeHtml(name).replace(/'/g, "\'")}')">${LINE_ICONS.nav}<span>길찾기</span></button>
      </div>
      ${(cat === 'bluer' || cat === 'bluer_cafe') ? `<button class="iw-detail-link" onclick="openBluerDetail(STATE._lastClickedItem.item, '${cat}')">자세히 보기 →</button>` : ''}
      ${cat === 'large_cafe' ? `<button class="iw-detail-link iw-detail-link-cafe" onclick="openLargeCafeDetail(STATE._lastClickedItem.item)">자세히 보기 →</button>` : ''}
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

  // 활성 마커 표시 — target 이 Marker 인 경우 직접 활성화
  // target 이 LatLng (목록·즐겨찾기 클릭 진입) 인 경우, 같은 좌표 마커를 찾아 활성화
  let activeMarker = (target && typeof target.setIcon === 'function') ? target : null;
  if (!activeMarker && target && typeof target.lat === 'function') {
    const tLat = target.lat(), tLng = target.lng();
    const allCats = STATE.active.fav ? ['fav', ...DATA_CATEGORIES] : [...DATA_CATEGORIES, 'fav'];
    for (const c of allCats) {
      const arr = STATE.markers[c] || [];
      for (const m of arr) {
        const p = m.getPosition && m.getPosition();
        if (!p) continue;
        if (Math.abs(p.lat() - tLat) < 1e-6 && Math.abs(p.lng() - tLng) < 1e-6) {
          activeMarker = m;
          break;
        }
      }
      if (activeMarker) break;
    }
  }
  if (activeMarker) {
    const isFavLayer = (STATE.markers.fav || []).includes(activeMarker);
    if (isFavLayer) {
      setActiveMarker(activeMarker, { cat: 'fav-layer', favCat: cat, item, isFav: true });
    } else {
      const rank = item && item._RANK ? item._RANK : null;
      setActiveMarker(activeMarker, { cat, item, isFav, rank });
    }
  }

  // InfoWindow 닫기 시 활성 마커 복구 (X 버튼 / 외부 클릭)
  // 단, "자세히 보기" 클릭으로 상세 패널이 열린 경우는 활성화 유지 (closeXxxDetail 에서 해제)
  naver.maps.Event.addListener(infoWindow, 'closeclick', () => {
    const panel = document.getElementById('sidePanel');
    if (panel && panel.classList.contains('bluer-detail-mode')) return;
    clearActiveMarker();
  });
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

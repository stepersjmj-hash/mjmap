// ============================================================
// favorites.js — 즐겨찾기 저장/해제, InfoWindow·목록 간 동기화
// 의존: config.js (LINE_ICONS), state.js (STATE),
//       api.js (getName/getAddr/getCategory/buildId/getLatLng),
//       markers.js/ui.js (showToast — 런타임 호출 시점엔 정의됨)
// 로드 순서: config → state → api → map → markers → favorites → ui → app
// ============================================================

// ============================================================
// 즐겨찾기 관리
// ============================================================
function toggleFavoriteFromIW(id, cat) {
  if (STATE.favorites[id]) {
    delete STATE.favorites[id];
    showToast('즐겨찾기 해제');
  } else {
    // 가장 최근 클릭된 항목 정보 저장
    if (STATE._lastClickedItem && STATE._lastClickedItem.id === id) {
      STATE.favorites[id] = {
        cat,
        item: STATE._lastClickedItem.item,
        addedAt: Date.now()
      };
    }
    showToast('즐겨찾기 추가 ⭐');
  }
  localStorage.setItem('favorites', JSON.stringify(STATE.favorites));
  // 마커와 인포윈도우 새로고침
  renderActiveCategories();
  renderFavorites();
  if (STATE.currentInfoWindow) STATE.currentInfoWindow.close();
}

function renderFavorites() {
  clearMarkers('fav');
  if (!STATE.active.fav) return;
  Object.values(STATE.favorites).forEach(fav => {
    const ll = getLatLng(fav.item);
    if (!ll.lat || !ll.lng) return;
    const conf = ICONS[fav.cat] || { color: '#9B6A7C', svg: LINE_ICONS.pin };
    const isGasFav = fav.cat === 'gas';
    const favBg   = isGasFav ? conf.color : '#FFFDF8';
    const favIcon = isGasFav ? '#FFFDF8'  : conf.color;
    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(ll.lat, ll.lng),
      map: STATE.map,
      icon: {
        content: `<div style="position:relative;width:40px;height:54px;font-family:inherit;">
          <div style="position:absolute;top:0;left:2px;width:36px;height:36px;background:${favBg};border:1.5px solid #9B6A7C;border-radius:12px;display:flex;align-items:center;justify-content:center;color:${favIcon};box-shadow:0 4px 12px -2px rgba(155,106,124,0.35);">${conf.svg}</div>
          <div style="position:absolute;top:-5px;right:-2px;width:18px;height:18px;background:#9B6A7C;color:#FFFDF8;border:2px solid #FFFDF8;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(26,23,19,0.25);">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </div>
          <div style="position:absolute;top:36px;left:50%;transform:translateX(-50%);width:1.5px;height:8px;background:#9B6A7C;"></div>
        </div>`,
        anchor: new naver.maps.Point(20, 48)
      },
      title: getName(fav.item),
      zIndex: 500
    });
    naver.maps.Event.addListener(marker, 'click', () => openInfoWindow(marker, fav.cat, fav.item));
    STATE.markers.fav.push(marker);
  });
}


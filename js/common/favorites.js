// ============================================================
// common/favorites.js — 즐겨찾기 저장/해제, 마커 렌더
// 의존: common/config.js, common/state.js, common/api.js,
//       common/markers.js (makeFavoriteMarkerIcon/openInfoWindow/clearMarkers),
//       common/ui.js (showToast/renderActiveCategories — 런타임)
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
    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(ll.lat, ll.lng),
      map: STATE.map,
      icon: makeFavoriteMarkerIcon(fav.cat),
      title: getName(fav.item),
      zIndex: 500
    });
    naver.maps.Event.addListener(marker, 'click', () => openInfoWindow(marker, fav.cat, fav.item));
    STATE.markers.fav.push(marker);
  });
}

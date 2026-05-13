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
      icon: makeFavoriteMarkerIcon(fav.cat, fav.item),
      title: getName(fav.item),
      zIndex: 500
    });
    naver.maps.Event.addListener(marker, 'click', () => {
      if (typeof suppressOutsideClose === 'function') suppressOutsideClose();
      openInfoWindow(marker, fav.cat, fav.item);
      // 즐겨찾기 레이어 마커는 fav-layer 컨텍스트로 활성화
      // (openInfoWindow 내부에서도 target=marker 일 때 활성화하지만, fav-layer 임을 명시하기 위해 재호출)
      setActiveMarker(marker, { cat: 'fav-layer', favCat: fav.cat, item: fav.item, isFav: true });
    });
    STATE.markers.fav.push(marker);
  });
}

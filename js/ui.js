// ============================================================
// ui.js — 설정 모달, 카테고리 토글/로더, 사이드 패널, UI 헬퍼
// 의존: config.js (ICONS/LINE_ICONS/POLL_DIV_LABEL),
//       state.js (STATE),
//       api.js (loadMoneyData/loadGasData/getLatLng/getName/getAddr/getCategory/buildId/filterByRadius),
//       map.js (detectSigunFromLocation),
//       markers.js (clearMarkers/renderMarkers/openInfoWindow),
//       favorites.js (renderFavorites)
// 로드 순서: config → state → api → map → markers → favorites → ui → app
// ============================================================

// ============================================================
// 앱 시작
// ============================================================
// API 키는 모두 서버(프록시)에서 관리되므로, 별도 설정 화면 없이 바로 지도 로드.
function checkSetup() {
  loadNaverScript();
}

function openSettings() {
  // 주유소 유종
  const prodcdEl = document.getElementById('prodcdSelect');
  if (prodcdEl) prodcdEl.value = STATE.prodcd;
  document.getElementById('radiusSelect').value = STATE.radius;
  document.getElementById('pageSizeSelect').value = STATE.pageSize;
  document.getElementById('sigunSelect').value = STATE.sigun;
  document.getElementById('autoSigunCheck').checked = STATE.autoSigun;
  document.getElementById('settingsModal').classList.add('open');
}
function closeSettings() { document.getElementById('settingsModal').classList.remove('open'); }
function saveSettings() {
  // 주유소 유종
  const prodcdEl = document.getElementById('prodcdSelect');
  const newProdcd = prodcdEl ? prodcdEl.value : STATE.prodcd;
  STATE.radius = parseInt(document.getElementById('radiusSelect').value);
  STATE.pageSize = parseInt(document.getElementById('pageSizeSelect').value);
  STATE.sigun = document.getElementById('sigunSelect').value;
  STATE.autoSigun = document.getElementById('autoSigunCheck').checked;
  STATE.prodcd = newProdcd;
  localStorage.setItem('autoSigun', STATE.autoSigun ? 'true' : 'false');
  localStorage.setItem('radius', STATE.radius);
  localStorage.setItem('pageSize', STATE.pageSize);
  localStorage.setItem('sigun', STATE.sigun);
  localStorage.setItem('prodcd', newProdcd);
  closeSettings();
  showToast('설정이 저장되었습니다.');
  reloadCurrentArea();
}

// ============================================================
// 카테고리 토글
// ============================================================
async function toggleCategory(cat) {
  // 즐겨찾기는 독립적으로 on/off (다른 카테고리에 영향 없음)
  if (cat === 'fav') {
    STATE.active.fav = !STATE.active.fav;
    document.querySelector(`.chip[data-cat="fav"]`).classList.toggle('active', STATE.active.fav);
    renderFavorites();
    return;
  }

  // 데이터 카테고리(money/gas)는 라디오 동작:
  // - 같은 칩 다시 클릭 → off
  // - 다른 칩 클릭 → 이전 칩 자동 off + 새 칩 on
  const wasActive = STATE.active[cat];

  // 같은 카테고리 클릭 → 단순히 끄기
  if (wasActive) {
    STATE.active[cat] = false;
    document.querySelector(`.chip[data-cat="${cat}"]`).classList.remove('active');
    clearMarkers(cat);
    return;
  }

  // 다른 데이터 카테고리들 모두 끄기
  for (const c of ['money', 'gas']) {
    if (c !== cat && STATE.active[c]) {
      STATE.active[c] = false;
      document.querySelector(`.chip[data-cat="${c}"]`).classList.remove('active');
      clearMarkers(c);
    }
  }

  // 선택한 카테고리 활성화
  STATE.active[cat] = true;
  document.querySelector(`.chip[data-cat="${cat}"]`).classList.add('active');
  await syncWithMapView();
  await loadAndRenderCategory(cat);
}

// ============================================================
// 현재 지도 뷰와 STATE 동기화 (centerPos + 시군 자동 감지)
// ============================================================
async function syncWithMapView() {
  if (!STATE.map) return;
  const center = STATE.map.getCenter();
  STATE.centerPos = { lat: center.y, lng: center.x };
  console.log(`[syncMapView] 중심: ${STATE.centerPos.lat.toFixed(4)}, ${STATE.centerPos.lng.toFixed(4)}`);
  if (STATE.autoSigun) {
    try {
      await detectSigunFromLocation(STATE.centerPos.lat, STATE.centerPos.lng);
    } catch (e) {
      console.warn('[syncMapView] 역지오코딩 실패, 기존 sigun 유지:', STATE.sigun);
    }
  }
}

async function loadAndRenderCategory(cat) {
  showLoading(true);
  try {
    let items;
    if (cat === 'money') items = await loadMoneyData();
    else if (cat === 'gas') items = await loadGasData();

    items = items || [];
    console.log(`[${cat}] API 응답 ${items.length}개 받음. 샘플:`, items[0]);

    // 좌표 필드가 있는 항목만 집계
    const withCoords = items.filter(it => {
      const ll = getLatLng(it);
      return ll.lat && ll.lng;
    });
    console.log(`[${cat}] 좌표 있는 항목: ${withCoords.length}개`);

    // 반경 필터링
    const filtered = filterByRadius(items, STATE.centerPos.lat, STATE.centerPos.lng, STATE.radius);
    console.log(`[${cat}] 반경 ${STATE.radius}m 내: ${filtered.length}개 (중심 ${STATE.centerPos.lat.toFixed(4)},${STATE.centerPos.lng.toFixed(4)})`);

    STATE.data[cat] = filtered;
    renderMarkers(cat, filtered);

    // 안내 메시지
    if (items.length === 0) {
      showToast(`${ICONS[cat].label}: API 응답이 비어 있어요. 콘솔 확인.`);
    } else if (withCoords.length === 0) {
      showToast(`${ICONS[cat].label}: ${items.length}개 받았지만 좌표 필드 없음. F12 확인.`);
      console.warn(`[${cat}] 좌표 필드를 찾을 수 없음. 첫 항목 키:`, Object.keys(items[0] || {}));
    } else if (filtered.length === 0) {
      showToast(`${ICONS[cat].label}: 반경 내 0개. 설정에서 반경을 "제한 없음"으로 변경해보세요.`);
    } else {
      showToast(`${ICONS[cat].label} ${filtered.length}개 표시 (전체 ${items.length}개 중)`);
    }
  } finally {
    showLoading(false);
  }
}

async function renderActiveCategories() {
  for (const cat of ['money', 'gas']) {
    if (STATE.active[cat]) await loadAndRenderCategory(cat);
  }
}

async function reloadCurrentArea() {
  // 현재 지도 뷰 기준으로 시군 감지 + 데이터 다시 조회
  await syncWithMapView();
  await renderActiveCategories();
  renderFavorites();
}

// ============================================================
// 사이드 패널 (목록 / 즐겨찾기)
// ============================================================
function openPanel(mode) {
  const panel = document.getElementById('sidePanel');
  const title = document.getElementById('panelTitle');
  const body = document.getElementById('panelBody');
  panel.classList.add('open');

  if (mode === 'fav') {
    title.textContent = '즐겨찾기';
    const favs = Object.entries(STATE.favorites);
    if (favs.length === 0) {
      body.innerHTML = '<p style="text-align:center;color:var(--muted);padding:48px 20px;font-size:13px;line-height:1.6;">즐겨찾기한 장소가 없습니다.<br>지도의 마커를 클릭하여 추가해보세요.</p>';
      return;
    }
    body.innerHTML = favs.map(([id, fav]) => renderListItem(fav.cat, fav.item, true, id)).join('');
  } else {
    title.textContent = '현재 표시 중';
    let html = '';
    let total = 0;
    for (const cat of ['money', 'gas']) {
      if (STATE.active[cat] && STATE.data[cat].length > 0) {
        html += `<h3 style="padding:12px 12px 8px;font-size:11px;color:var(--muted);letter-spacing:0.18em;text-transform:uppercase;display:flex;align-items:center;gap:8px;"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${ICONS[cat].color};"></span>${ICONS[cat].label} <span style="color:var(--ink);font-weight:600;">${STATE.data[cat].length}</span></h3>`;
        html += STATE.data[cat].slice(0, 50).map(item => renderListItem(cat, item, !!STATE.favorites[buildId(cat, item)])).join('');
        total += STATE.data[cat].length;
      }
    }
    if (total === 0) {
      html = '<p style="text-align:center;color:var(--muted);padding:48px 20px;font-size:13px;line-height:1.6;">상단의 카테고리 칩을 눌러 데이터를 표시해보세요.</p>';
    }
    body.innerHTML = html;
  }
}

function renderListItem(cat, item, isFav, favId) {
  const conf = ICONS[cat];
  const id = favId || buildId(cat, item);
  const safeId = id.replace(/'/g, "\\'");
  return `
    <div class="list-item" onclick="openItemFromList('${safeId}', '${cat}')">
      <div class="info">
        <div class="title"><span class="badge ${cat}">${conf.label}</span>${escapeHtml(getName(item))}</div>
        <div class="meta">${escapeHtml(getCategory(item))} ${getCategory(item) ? '·' : ''} ${escapeHtml(getAddr(item))}</div>
      </div>
      <button class="fav-btn ${isFav?'active':''}" onclick="event.stopPropagation();toggleFavoriteFromList('${safeId}', '${cat}', this)" aria-label="즐겨찾기">${LINE_ICONS.heart}</button>
    </div>
  `;
}

// 목록 항목 클릭 시: 패널 닫고 → 지도 이동 → 해당 항목 정보창 표시
function openItemFromList(id, cat) {
  // id로 항목 찾기 (즐겨찾기 → 현재 카테고리 → 다른 카테고리 순서)
  let foundItem = null;
  let foundCat = cat;
  if (STATE.favorites[id]) {
    foundItem = STATE.favorites[id].item;
    foundCat = STATE.favorites[id].cat;
  } else if (STATE.data[cat]) {
    foundItem = STATE.data[cat].find(it => buildId(cat, it) === id);
  }
  if (!foundItem) {
    // 다른 카테고리에서도 찾아보기
    for (const c of ['money', 'gas']) {
      const found = (STATE.data[c] || []).find(it => buildId(c, it) === id);
      if (found) { foundItem = found; foundCat = c; break; }
    }
  }
  if (!foundItem) return;

  const ll = getLatLng(foundItem);
  if (!ll.lat || !ll.lng) return;

  closePanel();
  const latlng = new naver.maps.LatLng(ll.lat, ll.lng);
  STATE.map.setCenter(latlng);
  if (STATE.map.getZoom() < 16) STATE.map.setZoom(16);
  openInfoWindow(latlng, foundCat, foundItem);
}

function toggleFavoriteFromList(id, cat, btn) {
  if (STATE.favorites[id]) {
    delete STATE.favorites[id];
    btn.classList.remove('active');
    btn.innerHTML = LINE_ICONS.heart;
    showToast('즐겨찾기 해제');
  } else {
    // 데이터에서 항목 찾기
    let foundItem = null;
    for (const c of ['money', 'gas']) {
      const found = STATE.data[c].find(it => buildId(c, it) === id);
      if (found) { foundItem = found; break; }
    }
    if (foundItem) {
      STATE.favorites[id] = { cat, item: foundItem, addedAt: Date.now() };
      btn.classList.add('active');
      btn.innerHTML = LINE_ICONS.heart;
      showToast('즐겨찾기 추가');
    }
  }
  localStorage.setItem('favorites', JSON.stringify(STATE.favorites));
  renderFavorites();
}

function closePanel() { document.getElementById('sidePanel').classList.remove('open'); }

// ============================================================
// UI 헬퍼
// ============================================================
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
function showLoading(show) {
  document.getElementById('loadingIndicator').classList.toggle('show', show);
}


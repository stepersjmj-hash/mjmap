// ============================================================
// cafe/detail.js — 대형카페 상세 정보 사이드 패널
// 의존: common/config.js (ICONS, LINE_ICONS),
//       common/state.js (STATE),
//       common/api.js (getName/getAddr/getLatLng/buildId),
//       common/markers.js (openNaverDirections, escapeHtml),
//       common/favorites.js (재사용),
//       common/ui.js (openPanel, closePanel — 런타임)
//
// 동작:
//   1) 마커 InfoWindow "자세히 보기" 또는 리스트 클릭 시 진입
//   2) 우측 #sidePanel 을 상세 모드로 전환 (블루리본 detail 패턴 재사용 — '.bluer-detail' 컨테이너 클래스 그대로 사용)
//   3) "← 목록으로" 클릭 시 이전 모드(목록/즐겨찾기) 복원, 없으면 패널 닫기
//
// 표시 내용 (원본 JSON 의 다음 필드 활용):
//   subtitle, description, category, hours, address, jibunAddress,
//   phone, parking, mainMenus[], seatOptions[], rating, reviewCount,
//   detailUrl(카카오맵), thumbnailUrl
// ============================================================

// 진입 직전 패널 상태를 기억해 "← 목록으로" 시 복귀
// { wasOpen: bool, mode: 'list' | 'fav' | null }
let _LARGE_CAFE_DETAIL_PREV = null;

function openLargeCafeDetail(item) {
  if (!item) return;
  // 같은 click 사이클의 document fallback 이 panel 을 닫지 않도록 1회 suppress
  if (typeof suppressOutsideClose === 'function') suppressOutsideClose();

  // 지도 위 InfoWindow 가 열려 있으면 닫기
  if (STATE.currentInfoWindow) {
    STATE.currentInfoWindow.close();
    STATE.currentInfoWindow = null;
  }

  const panel = document.getElementById('sidePanel');
  const title = document.getElementById('panelTitle');
  const body  = document.getElementById('panelBody');

  // 이전 패널 상태 기억
  const wasOpen = panel.classList.contains('open');
  const currentTitle = (title.textContent || '').trim();
  if (!panel.classList.contains('bluer-detail-mode')) {
    _LARGE_CAFE_DETAIL_PREV = {
      wasOpen,
      mode: wasOpen
        ? (currentTitle === '즐겨찾기' ? 'fav'
          : currentTitle === '현재 표시 중' ? 'list'
          : null)
        : null
    };
  }
  // bluer-detail-mode 클래스를 재사용 (panel 스타일 동일 — 상세 모드 표시)
  panel.classList.add('bluer-detail-mode');

  const cat   = 'large_cafe';
  const id    = buildId(cat, item);
  const isFav = !!STATE.favorites[id];
  const safeId = id.replace(/'/g, "\\'");
  const conf  = ICONS.large_cafe;
  const name  = getName(item);
  const addr  = getAddr(item);
  const ll    = getLatLng(item);

  const subtitle    = item.subtitle    || '';
  const description = item.description || '';
  const category    = item.category    || '';
  const hours       = item.hours       || '';
  const phone       = item.phone       || item.TELNO || '';
  const parking     = item.parking     || item['주차'] || '';
  const jibunAddr   = item.jibunAddress || '';
  const rating      = Number(item.rating) || 0;
  const reviewCount = Number(item.reviewCount) || 0;
  const mainMenus   = Array.isArray(item.mainMenus)   ? item.mainMenus   : [];
  const seatOptions = Array.isArray(item.seatOptions) ? item.seatOptions : [];
  const detailUrl   = item.detailUrl   || '';
  const thumbUrl    = item.thumbnailUrl || '';

  // 평점 + 리뷰 시각화
  let ratingHtml = '';
  if (rating > 0 || reviewCount > 0) {
    const parts = [];
    if (rating > 0)      parts.push(`★ ${rating.toFixed(1)}`);
    if (reviewCount > 0) parts.push(`리뷰 ${reviewCount.toLocaleString()}`);
    ratingHtml = `<span class="bd-year">${escapeHtml(parts.join(' · '))}</span>`;
  }

  // 외부 링크 — 카카오맵 상세 (없으면 네이버 검색 fallback)
  const addrHead = addr ? addr.split(/\s+/).slice(0, 2).join(' ') : '';
  const naverQuery = encodeURIComponent([name, addrHead].filter(Boolean).join(' '));
  const naverMapUrl = `https://map.naver.com/p/search/${naverQuery}`;
  const extUrl   = detailUrl || naverMapUrl;
  const extLabel = detailUrl ? '카카오맵에서 보기' : '네이버 지도에서 보기';

  // 썸네일 (있으면 상단에 표시)
  const thumbHtml = thumbUrl
    ? `<div class="bd-thumb"><img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
    : '';

  // 메뉴 / 좌석 옵션 — 칩 형태로 표시
  const menuHtml = mainMenus.length
    ? `<div class="bd-row"><span class="bd-label">메뉴</span><span class="bd-val bd-chips">${mainMenus.map(m => `<span class="bd-chip">${escapeHtml(m)}</span>`).join('')}</span></div>`
    : '';
  const seatHtml = seatOptions.length
    ? `<div class="bd-row"><span class="bd-label">좌석</span><span class="bd-val bd-chips">${seatOptions.map(s => `<span class="bd-chip">${escapeHtml(s)}</span>`).join('')}</span></div>`
    : '';

  title.textContent = '대형카페 · 상세';

  body.innerHTML = `
    <div class="bluer-detail large-cafe-detail">
      <button class="bd-back" onclick="closeLargeCafeDetail()" aria-label="목록으로 돌아가기">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        <span>목록으로</span>
      </button>

      ${thumbHtml}

      <div class="bd-cat" style="color:${conf.color};">
        <span class="bd-dot" style="background:${conf.color};"></span>
        ${escapeHtml(conf.label)}${category ? ' · ' + escapeHtml(category) : ''}
      </div>

      <h3 class="bd-name">
        ${escapeHtml(name)}
        ${ratingHtml}
      </h3>

      ${subtitle ? `<p class="bd-subtitle">${escapeHtml(subtitle)}</p>` : ''}

      ${description
        ? `<p class="bd-desc">${escapeHtml(description)}</p>`
        : `<p class="bd-desc bd-empty">설명이 등록되어 있지 않습니다.</p>`}

      ${addr ? `
        <div class="bd-row">
          <span class="bd-label">주소</span>
          <span class="bd-val">${escapeHtml(addr)}</span>
        </div>` : ''}

      ${jibunAddr ? `
        <div class="bd-row bd-row-sub">
          <span class="bd-label">지번</span>
          <span class="bd-val">${escapeHtml(jibunAddr)}</span>
        </div>` : ''}

      ${phone ? `
        <div class="bd-row">
          <span class="bd-label">📞 전화</span>
          <span class="bd-val">${escapeHtml(phone)}</span>
        </div>` : ''}

      ${hours ? `
        <div class="bd-row">
          <span class="bd-label">⏰ 시간</span>
          <span class="bd-val">${escapeHtml(hours)}</span>
        </div>` : ''}

      ${parking ? `
        <div class="bd-row">
          <span class="bd-label">🅿 주차</span>
          <span class="bd-val">${escapeHtml(parking)}</span>
        </div>` : ''}

      ${menuHtml}
      ${seatHtml}

      <div class="bd-actions">
        <button class="bd-btn bd-fav ${isFav ? 'active' : ''}"
                onclick="toggleFavoriteFromLargeCafeDetail('${safeId}', this)">
          ${LINE_ICONS.heart}<span>${isFav ? '즐겨찾기 해제' : '즐겨찾기'}</span>
        </button>
        <button class="bd-btn bd-nav"
                onclick="openNaverDirections(${ll.lat}, ${ll.lng}, '${escapeHtml(name).replace(/'/g, "\\'")}')">
          ${LINE_ICONS.nav}<span>길찾기</span>
        </button>
      </div>

      <a class="bd-extlink" href="${escapeHtml(extUrl)}" target="_blank" rel="noopener noreferrer">
        <span>${escapeHtml(extLabel)}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
    </div>
  `;

  panel.classList.add('open');
}

// 상세 패널 즐겨찾기 토글
function toggleFavoriteFromLargeCafeDetail(id, btn) {
  const wasFav = !!STATE.favorites[id];
  if (wasFav) {
    delete STATE.favorites[id];
    btn.classList.remove('active');
    btn.querySelector('span').textContent = '즐겨찾기';
    showToast('즐겨찾기 해제');
  } else {
    let foundItem = null;
    const cat = 'large_cafe';
    foundItem = (STATE.data[cat] || []).find(it => buildId(cat, it) === id);
    if (foundItem) {
      STATE.favorites[id] = { cat, item: foundItem, addedAt: Date.now() };
      btn.classList.add('active');
      btn.querySelector('span').textContent = '즐겨찾기 해제';
      showToast('즐겨찾기 추가');
    }
  }
  localStorage.setItem('favorites', JSON.stringify(STATE.favorites));
  if (typeof renderActiveCategories === 'function') renderActiveCategories();
  if (typeof renderFavorites === 'function') renderFavorites();
}

// 상세 → 이전(목록/즐겨찾기) 복귀, 없으면 패널 닫기
function closeLargeCafeDetail() {
  const panel = document.getElementById('sidePanel');
  panel.classList.remove('bluer-detail-mode');

  const prev = _LARGE_CAFE_DETAIL_PREV;
  _LARGE_CAFE_DETAIL_PREV = null;

  if (prev && prev.wasOpen && prev.mode) {
    openPanel(prev.mode);
  } else {
    closePanel();
  }
}

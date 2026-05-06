// ============================================================
// bluer/detail.js — 블루리본 상세 정보 사이드 패널
// 의존: common/config.js (ICONS, LINE_ICONS),
//       common/state.js (STATE),
//       common/api.js (getName/getAddr/getCategory/getDescription/getLatLng/buildId),
//       common/markers.js (openNaverDirections, escapeHtml),
//       common/favorites.js (toggleFavoriteFromIW — 재사용),
//       common/ui.js (openPanel, closePanel — 런타임)
//
// 동작:
//   1) 마커 InfoWindow "자세히 보기" 또는 리스트 클릭(블루리본) 시 진입
//   2) 우측 #sidePanel 을 상세 모드로 전환 (목록/즐겨찾기 슬롯 재사용)
//   3) "← 목록으로" 클릭 시 이전 모드(목록/즐겨찾기) 복원, 없으면 패널 닫기
//
// 외부 링크: 네이버 지도 검색 (업소명 + 주소 앞부분).
//   주의: 네이버 지도 검색은 동명 업소가 있으면 후보 목록이 뜰 수 있음.
// ============================================================

// 진입 직전 패널 상태를 기억해 "← 목록으로" 시 복귀
// { wasOpen: bool, mode: 'list' | 'fav' | null }
let _BLUER_DETAIL_PREV = null;

function openBluerDetail(item, cat) {
  if (!item) return;
  // 같은 click 사이클의 document fallback 이 panel 을 닫지 않도록 1회 suppress
  if (typeof suppressOutsideClose === 'function') suppressOutsideClose();
  // cat 미지정 시 메뉴명으로 자동 판단 (즐겨찾기·기존 호출 호환)
  if (!cat) cat = (typeof isBluerCafe === 'function' && isBluerCafe(item)) ? 'bluer_cafe' : 'bluer';
  // 지도 위 InfoWindow 가 열려 있으면 닫기 (패널과 중복 방지)
  if (STATE.currentInfoWindow) {
    STATE.currentInfoWindow.close();
    STATE.currentInfoWindow = null;
  }

  const panel = document.getElementById('sidePanel');
  const title = document.getElementById('panelTitle');
  const body  = document.getElementById('panelBody');

  // 이전 패널 상태 기억 (열려 있었고 상세 모드가 아니었을 때만)
  const wasOpen = panel.classList.contains('open');
  const currentTitle = (title.textContent || '').trim();
  // 패널이 이미 상세 모드면 prev 보존, 아니면 새로 기록
  if (!panel.classList.contains('bluer-detail-mode')) {
    _BLUER_DETAIL_PREV = {
      wasOpen,
      // 즐겨찾기 / 현재 표시 중 / 그 외(클러스터 등) 구분
      mode: wasOpen
        ? (currentTitle === '즐겨찾기' ? 'fav'
          : currentTitle === '현재 표시 중' ? 'list'
          : null)
        : null
    };
  }
  panel.classList.add('bluer-detail-mode');

  const id    = buildId(cat, item);
  const isFav = !!STATE.favorites[id];
  const safeId = id.replace(/'/g, "\\'");
  const conf  = ICONS[cat] || ICONS.bluer;
  const name  = getName(item);
  const addr  = getAddr(item);
  const desc  = getDescription(item);
  const menu  = item['메뉴명'] || '';
  const year  = item['연도'] || '';
  const ribbons = Math.min(Math.max(Number(item['리본수']) || 0, 0), 3);
  const ll    = getLatLng(item);

  // 리본 시각화 (1~3개 채워짐 + 빈 자리)
  let ribbonsHtml = '';
  if (ribbons > 0) {
    const filled = '🎀'.repeat(ribbons);
    ribbonsHtml = `<span class="bd-ribbons" title="블루리본 ${ribbons}개" aria-label="블루리본 ${ribbons}개">${filled}</span>`;
  }

  // 외부 네이버 지도 검색 URL
  // 주소 첫 토큰(시군 등)을 동반시켜 동명 업소 충돌을 줄임
  const addrHead = addr ? addr.split(/\s+/).slice(0, 2).join(' ') : '';
  const naverQuery = encodeURIComponent([name, addrHead].filter(Boolean).join(' '));
  const naverMapUrl = `https://map.naver.com/p/search/${naverQuery}`;

  // 헤더는 sidePanel 의 panel-header 그대로 두되 제목만 바꿈
  title.textContent = (conf && conf.label ? conf.label : '블루리본') + ' · 상세';

  body.innerHTML = `
    <div class="bluer-detail">
      <button class="bd-back" onclick="closeBluerDetail()" aria-label="목록으로 돌아가기">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        <span>목록으로</span>
      </button>

      <div class="bd-cat" style="color:${conf.color};">
        <span class="bd-dot" style="background:${conf.color};"></span>
        ${escapeHtml(conf.label)}${menu ? ' · ' + escapeHtml(menu) : ''}
      </div>

      <h3 class="bd-name">
        ${escapeHtml(name)}
        ${ribbonsHtml}
      </h3>

      ${year ? `<div class="bd-year">${escapeHtml(year)}</div>` : ''}

      ${desc ? `<p class="bd-desc">${escapeHtml(desc)}</p>` : `<p class="bd-desc bd-empty">설명이 등록되어 있지 않습니다.</p>`}

      ${addr ? `
        <div class="bd-row">
          <span class="bd-label">주소</span>
          <span class="bd-val">${escapeHtml(addr)}</span>
        </div>` : ''}

      ${item._MATCHED_ADDR && item._MATCHED_ADDR !== addr ? `
        <div class="bd-row bd-row-sub">
          <span class="bd-label">매칭주소</span>
          <span class="bd-val">${escapeHtml(item._MATCHED_ADDR)}</span>
        </div>` : ''}

      ${item['주차'] ? `
        <div class="bd-row">
          <span class="bd-label">🅿 주차</span>
          <span class="bd-val">${escapeHtml(item['주차'])}</span>
        </div>` : ''}

      <div class="bd-actions">
        <button class="bd-btn bd-fav ${isFav ? 'active' : ''}"
                onclick="toggleFavoriteFromBluerDetail('${safeId}', this)">
          ${LINE_ICONS.heart}<span>${isFav ? '즐겨찾기 해제' : '즐겨찾기'}</span>
        </button>
        <button class="bd-btn bd-nav"
                onclick="openNaverDirections(${ll.lat}, ${ll.lng}, '${escapeHtml(name).replace(/'/g, "\\'")}')">
          ${LINE_ICONS.nav}<span>길찾기</span>
        </button>
      </div>

      <a class="bd-extlink" href="${naverMapUrl}" target="_blank" rel="noopener noreferrer">
        <span>네이버 지도에서 보기</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
    </div>
  `;

  panel.classList.add('open');
}

// 상세 패널 즐겨찾기 토글 — 토스트 + 버튼 상태 + 리스트/즐겨찾기 마커 갱신
function toggleFavoriteFromBluerDetail(id, btn) {
  const wasFav = !!STATE.favorites[id];
  if (wasFav) {
    delete STATE.favorites[id];
    btn.classList.remove('active');
    btn.querySelector('span').textContent = '즐겨찾기';
    showToast('즐겨찾기 해제');
  } else {
    // 현재 데이터에서 항목 재탐색
    let foundItem = null, foundCat = 'bluer';
    for (const c of DATA_CATEGORIES) {
      const found = (STATE.data[c] || []).find(it => buildId(c, it) === id);
      if (found) { foundItem = found; foundCat = c; break; }
    }
    if (foundItem) {
      STATE.favorites[id] = { cat: foundCat, item: foundItem, addedAt: Date.now() };
      btn.classList.add('active');
      btn.querySelector('span').textContent = '즐겨찾기 해제';
      showToast('즐겨찾기 추가');
    }
  }
  localStorage.setItem('favorites', JSON.stringify(STATE.favorites));
  // 마커/리스트 갱신 — 즐겨찾기 색상 반영
  if (typeof renderActiveCategories === 'function') renderActiveCategories();
  if (typeof renderFavorites === 'function') renderFavorites();
}

// 상세 → 이전(목록/즐겨찾기) 복귀, 없으면 패널 닫기
function closeBluerDetail() {
  const panel = document.getElementById('sidePanel');
  panel.classList.remove('bluer-detail-mode');

  const prev = _BLUER_DETAIL_PREV;
  _BLUER_DETAIL_PREV = null;

  if (prev && prev.wasOpen && prev.mode) {
    // openPanel 은 같은 패널 슬롯을 재구성
    openPanel(prev.mode);
  } else {
    closePanel();
  }
}


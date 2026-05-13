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
  const hours       = (item.hours && typeof item.hours === 'object') ? item.hours : null;
  const phone       = item.phone       || item.TELNO || '';
  const parking     = item.parking     || item['주차'] || '';
  const jibunAddr   = item.jibunAddress || '';
  const rating      = Number(item.rating) || 0;
  const reviewCount = Number(item.reviewCount) || 0;
  const mainMenus   = Array.isArray(item.mainMenus)    ? item.mainMenus    : [];
  const seatOptions = Array.isArray(item.seatOptions)  ? item.seatOptions  : [];
  const services    = Array.isArray(item.services)     ? item.services     : [];
  const childOptions= Array.isArray(item.childOptions) ? item.childOptions : [];
  const tags        = Array.isArray(item.tags)         ? item.tags         : [];
  const detailUrl   = item.detailUrl   || '';
  const thumbUrl    = item.thumbnailUrl || '';

  // 평점 + 리뷰 시각화 (새 스키마에는 rating/reviewCount 없음 — 0이면 자동 숨김)
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

  // 메뉴 / 좌석 / 서비스 / 아이동반 / 태그 — 칩 형태로 표시
  const menuHtml = mainMenus.length
    ? `<div class="bd-row"><span class="bd-label">메뉴</span><span class="bd-val bd-chips">${mainMenus.map(m => `<span class="bd-chip">${escapeHtml(m)}</span>`).join('')}</span></div>`
    : '';
  const seatHtml = seatOptions.length
    ? `<div class="bd-row"><span class="bd-label">좌석</span><span class="bd-val bd-chips">${seatOptions.map(s => `<span class="bd-chip">${escapeHtml(s)}</span>`).join('')}</span></div>`
    : '';
  const svcHtml = services.length
    ? `<div class="bd-row"><span class="bd-label">서비스</span><span class="bd-val bd-chips">${services.map(s => `<span class="bd-chip">${escapeHtml(s)}</span>`).join('')}</span></div>`
    : '';
  const childHtml = childOptions.length
    ? `<div class="bd-row"><span class="bd-label">아이동반</span><span class="bd-val bd-chips">${childOptions.map(c => `<span class="bd-chip">${escapeHtml(c)}</span>`).join('')}</span></div>`
    : '';
  const tagsHtml = tags.length
    ? `<div class="bd-row"><span class="bd-label">🏷 태그</span><span class="bd-val bd-chips">${tags.map(t => `<span class="bd-chip">${escapeHtml(t)}</span>`).join('')}</span></div>`
    : '';

  // 전화 — tel: 링크 (블루리본과 동일)
  const phoneTel = phone.replace(/[^\d+\-]/g, '');
  const phoneHtml = phone ? `
    <div class="bd-row">
      <span class="bd-label">📞 전화</span>
      <span class="bd-val"><a class="bd-tel" href="tel:${escapeHtml(phoneTel)}">${escapeHtml(phone)}</a></span>
    </div>` : '';

  // 영업시간 — 누락=휴무, 오늘 강조, status 는 weekly+현재시각으로 동적 계산 (블루리본과 동일)
  const DAYS = ['월','화','수','목','금','토','일'];
  const _DAY_KO = ['일','월','화','수','목','금','토'];
  const _now = new Date();
  const _todayKey = _DAY_KO[_now.getDay()];
  let hoursHtml = '';
  if (hours) {
    const weekly = (hours.weekly && typeof hours.weekly === 'object') ? hours.weekly : null;
    const parseRange = (s) => {
      if (!s || typeof s !== 'string') return null;
      const t = s.trim();
      if (t === '' || t === '휴무') return null;
      const m = t.match(/^(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const startMin = (+m[1])*60 + (+m[2]);
      let endMin = (+m[3])*60 + (+m[4]);
      // 종료가 시작보다 이르면 자정 넘김으로 해석 (예: "10:30 ~ 01:00" → 다음날 01:00)
      // 블루리본 등 "25:00" 표기는 이미 endMin >= 1440 이라 영향 없음
      if (endMin <= startMin && endMin < 1440) endMin += 1440;
      return { startMin, endMin };
    };
    const fmtMin = (min) => {
      if (min === 1440) return '24:00';
      if (min > 1440) {
        const n = min - 1440;
        return `익일 ${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
      }
      return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;
    };
    let liveStatus = '';
    if (weekly) {
      const nowMin = _now.getHours()*60 + _now.getMinutes();
      const yestKey = _DAY_KO[(_now.getDay()+6) % 7];
      const yestRange = parseRange(weekly[yestKey]);
      if (yestRange && yestRange.endMin > 1440 && nowMin < (yestRange.endMin - 1440)) {
        liveStatus = `영업 중 ${fmtMin(yestRange.endMin - 1440)} 까지`;
      } else {
        const todayVal = weekly[_todayKey];
        if (todayVal == null || String(todayVal).trim() === '' || todayVal === '휴무') {
          liveStatus = '휴무일';
        } else {
          const r = parseRange(todayVal);
          if (!r) liveStatus = String(todayVal);
          else if (r.startMin === 0 && r.endMin === 1440) liveStatus = '24시간 영업';
          else if (nowMin < r.startMin)  liveStatus = `영업 전 ${fmtMin(r.startMin)} 오픈`;
          else if (nowMin < r.endMin)    liveStatus = `영업 중 ${fmtMin(r.endMin)} 까지`;
          else                           liveStatus = '영업 종료';
        }
      }
    }
    const weeklyRows = weekly
      ? DAYS.map(d => {
          const raw = (weekly[d] != null && String(weekly[d]).trim() !== '') ? String(weekly[d]) : '휴무';
          const todayCls = (d === _todayKey) ? ' bd-hours-today' : '';
          return `<span class="bd-hours-day${todayCls}">${d}</span><span class="bd-hours-time${todayCls}">${escapeHtml(raw)}</span>`;
        }).join('')
      : '';
    if (liveStatus || weeklyRows) {
      hoursHtml = `
        <div class="bd-row">
          <span class="bd-label">⏰ 영업</span>
          <span class="bd-val">
            ${liveStatus ? `<div class="bd-hours-status">${escapeHtml(liveStatus)}</div>` : ''}
            ${weeklyRows ? `<div class="bd-hours-weekly">${weeklyRows}</div>` : ''}
          </span>
        </div>`;
    }
  }

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

      ${phoneHtml}
      ${hoursHtml}

      ${parking ? `
        <div class="bd-row">
          <span class="bd-label">🅿 주차</span>
          <span class="bd-val">${escapeHtml(parking)}</span>
        </div>` : ''}

      ${menuHtml}
      ${seatHtml}
      ${svcHtml}
      ${childHtml}
      ${tagsHtml}

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

  // 상세 닫기 시 마커 활성화 해제
  if (typeof clearActiveMarker === 'function') clearActiveMarker();

  const prev = _LARGE_CAFE_DETAIL_PREV;
  _LARGE_CAFE_DETAIL_PREV = null;

  if (prev && prev.wasOpen && prev.mode) {
    openPanel(prev.mode);
  } else {
    closePanel();
  }
}

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
  // 설명: 신규 AI 생성 description 이 있으면 우선, 없으면 기존 '설명' 사용
  const desc        = item.description || getDescription(item) || '';
  const subtitle    = item.subtitle    || '';
  const parking     = item.parking     || item['주차'] || '';
  const phone       = item.phone       || '';
  const homepageUrl = item.homepageUrl || '';
  const hours       = (item.hours && typeof item.hours === 'object') ? item.hours : null;
  const mainMenus   = Array.isArray(item.mainMenus)    ? item.mainMenus    : [];
  const services    = Array.isArray(item.services)     ? item.services     : [];
  const childOptions= Array.isArray(item.childOptions) ? item.childOptions : [];
  const seatOptions = Array.isArray(item.seatOptions)  ? item.seatOptions  : [];
  const tags        = Array.isArray(item.tags)         ? item.tags         : [];
  const menu  = item['메뉴명'] || '';
  const year  = item['연도'] || '';
  const ribbons = Math.min(Math.max(Number(item['리본수']) || 0, 0), 3);
  const ll    = getLatLng(item);

  // 칩 행 HTML — 빈 배열이면 자동 숨김
  const menuHtml = mainMenus.length
    ? `<div class="bd-row"><span class="bd-label">메뉴</span><span class="bd-val bd-chips">${mainMenus.map(m => `<span class="bd-chip">${escapeHtml(m)}</span>`).join('')}</span></div>`
    : '';
  const svcHtml = services.length
    ? `<div class="bd-row"><span class="bd-label">서비스</span><span class="bd-val bd-chips">${services.map(s => `<span class="bd-chip">${escapeHtml(s)}</span>`).join('')}</span></div>`
    : '';
  const childHtml = childOptions.length
    ? `<div class="bd-row"><span class="bd-label">아이동반</span><span class="bd-val bd-chips">${childOptions.map(c => `<span class="bd-chip">${escapeHtml(c)}</span>`).join('')}</span></div>`
    : '';
  const seatHtml = seatOptions.length
    ? `<div class="bd-row"><span class="bd-label">좌석</span><span class="bd-val bd-chips">${seatOptions.map(s => `<span class="bd-chip">${escapeHtml(s)}</span>`).join('')}</span></div>`
    : '';
  const tagsHtml = tags.length
    ? `<div class="bd-row"><span class="bd-label">🏷 태그</span><span class="bd-val bd-chips">${tags.map(t => `<span class="bd-chip">${escapeHtml(t)}</span>`).join('')}</span></div>`
    : '';

  // 전화 — tel: 링크 (숫자/+/- 만 추출)
  const phoneTel = phone.replace(/[^\d+\-]/g, '');
  const phoneHtml = phone ? `
    <div class="bd-row">
      <span class="bd-label">📞 전화</span>
      <span class="bd-val"><a class="bd-tel" href="tel:${escapeHtml(phoneTel)}">${escapeHtml(phone)}</a></span>
    </div>` : '';

  // 홈페이지 — 외부 링크
  const homepageHtml = homepageUrl ? `
    <div class="bd-row">
      <span class="bd-label">🌐 홈피</span>
      <span class="bd-val"><a class="bd-link-inline" href="${escapeHtml(homepageUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(homepageUrl)}</a></span>
    </div>` : '';

  // 영업시간 — 누락=휴무, 오늘 강조, status 는 weekly+현재시각으로 동적 계산
  const DAYS = ['월','화','수','목','금','토','일'];
  // JS getDay(): 0=일,1=월,...,6=토 → 한글 매핑
  const _DAY_KO = ['일','월','화','수','목','금','토'];
  const _now = new Date();
  const _todayKey = _DAY_KO[_now.getDay()];
  let hoursHtml = '';
  if (hours) {
    const weekly = (hours.weekly && typeof hours.weekly === 'object') ? hours.weekly : null;

    // "HH:MM ~ HH:MM" 파싱 (시간 24+ 허용 — 자정 넘김)
    const parseRange = (s) => {
      if (!s || typeof s !== 'string') return null;
      const t = s.trim();
      if (t === '' || t === '휴무') return null;
      const m = t.match(/^(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const startMin = (+m[1])*60 + (+m[2]);
      let endMin = (+m[3])*60 + (+m[4]);
      // 종료가 시작보다 이르면 자정 넘김으로 해석 (예: "10:30 ~ 01:00" → 다음날 01:00)
      // "25:00" 표기는 이미 endMin >= 1440 이라 영향 없음
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

    // 실시간 status 계산
    let liveStatus = '';
    if (weekly) {
      const nowMin = _now.getHours()*60 + _now.getMinutes();
      const yestKey = _DAY_KO[(_now.getDay()+6) % 7];
      const yestRange = parseRange(weekly[yestKey]);
      // 어제 영업이 자정을 넘겼고, 지금이 그 연장 시간대인가
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

    // 요일별 표 — 누락 요일은 휴무, 오늘 강조
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

      ${subtitle ? `<p class="bd-subtitle">${escapeHtml(subtitle)}</p>` : ''}

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

      ${phoneHtml}
      ${hoursHtml}

      ${parking ? `
        <div class="bd-row">
          <span class="bd-label">🅿 주차</span>
          <span class="bd-val">${escapeHtml(parking)}</span>
        </div>` : ''}

      ${homepageHtml}

      ${menuHtml}
      ${svcHtml}
      ${childHtml}
      ${seatHtml}
      ${tagsHtml}

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

  // 상세 닫기 시 마커 활성화 해제
  if (typeof clearActiveMarker === 'function') clearActiveMarker();

  const prev = _BLUER_DETAIL_PREV;
  _BLUER_DETAIL_PREV = null;

  if (prev && prev.wasOpen && prev.mode) {
    // openPanel 은 같은 패널 슬롯을 재구성
    openPanel(prev.mode);
  } else {
    closePanel();
  }
}

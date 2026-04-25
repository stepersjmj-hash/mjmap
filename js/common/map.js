// ============================================================
// common/map.js — 네이버 지도 SDK 로드 / 초기화 / 역지오코딩
// 의존: common/config.js, common/state.js,
//       common/ui.js (showToast/closePanel), common/favorites.js (renderFavorites),
//       common/ui.js (reloadCurrentArea — 런타임 호출 시점엔 정의됨)
// ============================================================

async function loadNaverScript() {
  window.navermap_authFailure = function() {
    console.error('[네이버지도] 인증 실패 — Client ID 오류 또는 Web 서비스 URL 미등록');
    alert(
      '❌ 네이버 지도 인증 실패\n\n' +
      '원인: Client ID가 잘못되었거나, 현재 주소가 Web 서비스 URL에 등록되지 않음.\n\n' +
      '해결:\n' +
      '1) NCP 콘솔 > Maps > Application > 인증정보에서 Client ID 확인\n' +
      '2) 같은 앱의 "Web 서비스 URL"에 "' + location.origin + '" 등록\n' +
      '(저장 후 반영까지 수 분 소요될 수 있음)'
    );
  };

  // 여러 URL 패턴 시도 (NCP는 경로가 모두 소문자여야 함)
  // submodules=geocoder: 역지오코딩(위경도→주소) 기능 활성화
  const sub = '&submodules=geocoder';
  const candidates = [
    { url: `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(STATE.naverKey)}${sub}`, label: 'NCP ncpKeyId (신규)' },
    { url: `https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${encodeURIComponent(STATE.naverKey)}${sub}`, label: 'NCP ncpClientId (구버전)' },
    { url: `https://openapi.map.naver.com/openapi/v3/maps.js?clientId=${encodeURIComponent(STATE.naverKey)}${sub}`, label: 'openapi.map (Naver Developers)' }
  ];

  for (const cand of candidates) {
    try {
      console.log(`[네이버지도] ${cand.label} 진단 중: ${cand.url}`);
      const res = await fetch(cand.url, { method: 'GET', mode: 'no-cors' });
      console.log(`[네이버지도] ${cand.label} 네트워크 응답 받음, <script> 태그로 실행 시도`);
      await loadScriptTag(cand.url);
      if (typeof naver !== 'undefined' && naver.maps) {
        console.log(`[네이버지도] ✅ ${cand.label} 성공`);
        initMap();
        return;
      } else {
        console.warn(`[네이버지도] ${cand.label} 스크립트는 로드됐으나 naver 객체 없음 (인증 실패 가능성)`);
      }
    } catch (e) {
      console.error(`[네이버지도] ${cand.label} 실패:`, e.message);
    }
  }

  // 모든 URL 실패
  alert(
    '❌ 네이버 지도 스크립트 로드 실패\n\n' +
    '시도한 URL 3가지 모두 실패했습니다. F12 Console을 확인해주세요.\n\n' +
    '가장 흔한 원인:\n' +
    '1) NCP 콘솔에서 "Web Dynamic Map" 서비스가 활성화되지 않음\n' +
    '   (Application 편집 → 서비스 이용 정보 → Web Dynamic Map 체크)\n' +
    '2) 결제 수단이 등록되지 않음 (무료 쿼터여도 결제 수단 필요)\n' +
    '3) 현재 주소 "' + location.origin + '" 이 Web 서비스 URL에 미등록\n\n' +
    '참고: NCP 콘솔의 "서비스 이용 정보" 섹션에 공식 샘플 스크립트 태그가 있으니,\n' +
    '그 src URL을 그대로 복사해서 index.html line ~495의 URL과 비교해보세요.'
  );
}

function loadScriptTag(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => setTimeout(resolve, 200); // 네이버 SDK 초기화 대기
    script.onerror = () => reject(new Error('script onerror (404 or CORS)'));
    document.head.appendChild(script);
  });
}

function initMap() {
  STATE.map = new naver.maps.Map('map', {
    center: new naver.maps.LatLng(STATE.centerPos.lat, STATE.centerPos.lng),
    zoom: 14,
    zoomControl: true,
    zoomControlOptions: { position: naver.maps.Position.TOP_RIGHT }
  });

  // 지도 빈 영역 클릭 시 열려있는 정보창 + 우측 사이드 패널 닫기
  naver.maps.Event.addListener(STATE.map, 'click', function() {
    if (STATE.currentInfoWindow) {
      STATE.currentInfoWindow.close();
      STATE.currentInfoWindow = null;
    }
    closePanel();
  });

  // 설정 모달의 어두운 배경 클릭 시 모달 닫기 (모달 본문 클릭 시에는 유지)
  const modalBg = document.getElementById('settingsModal');
  if (modalBg) {
    modalBg.addEventListener('click', function(e) {
      if (e.target === modalBg) closeSettings();
    });
  }

  // 자동으로 사용자 위치 시도
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        STATE.centerPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        STATE.map.setCenter(new naver.maps.LatLng(STATE.centerPos.lat, STATE.centerPos.lng));
        addMyLocationMarker();
        if (STATE.autoSigun) {
          detectSigunFromLocation(STATE.centerPos.lat, STATE.centerPos.lng).catch(() => {});
        }
        renderFavorites();
        initActiveCategories();
      },
      err => { console.warn('위치 정보 사용 불가:', err); renderFavorites(); initActiveCategories(); },
      { timeout: 5000 }
    );
  } else {
    renderFavorites();
    initActiveCategories();
  }
}

function addMyLocationMarker() {
  if (STATE.myLocationMarker) STATE.myLocationMarker.setMap(null);
  STATE.myLocationMarker = new naver.maps.Marker({
    position: new naver.maps.LatLng(STATE.centerPos.lat, STATE.centerPos.lng),
    map: STATE.map,
    icon: {
      content: `<div style="width:16px;height:16px;background:#1A1713;border:3px solid #FFFDF8;border-radius:50%;box-shadow:0 0 0 8px rgba(183,110,74,0.22), 0 2px 6px rgba(26,23,19,0.3);"></div>`,
      anchor: new naver.maps.Point(11, 11)
    },
    zIndex: 1000
  });
}

function goToMyLocation() {
  if (!navigator.geolocation) {
    showToast('위치 정보를 사용할 수 없습니다.');
    return;
  }
  showToast('위치를 가져오는 중...');
  navigator.geolocation.getCurrentPosition(
    pos => {
      STATE.centerPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      STATE.map.setCenter(new naver.maps.LatLng(STATE.centerPos.lat, STATE.centerPos.lng));
      STATE.map.setZoom(15);
      addMyLocationMarker();
      if (STATE.autoSigun !== false) {
        detectSigunFromLocation(STATE.centerPos.lat, STATE.centerPos.lng)
          .then(() => reloadCurrentArea())
          .catch(() => reloadCurrentArea());
      } else {
        reloadCurrentArea();
      }
    },
    err => {
      showToast('위치 정보를 가져올 수 없습니다.');
      console.error(err);
    }
  );
}

// ============================================================
// 역지오코딩: 위경도 → 시/군구/동 (네이버 지도 SDK 내장)
// ============================================================
function detectSigunFromLocation(lat, lng) {
  return new Promise((resolve, reject) => {
    if (typeof naver === 'undefined' || !naver.maps.Service || !naver.maps.Service.reverseGeocode) {
      console.warn('[역지오코딩] naver.maps.Service.reverseGeocode 없음 — submodules=geocoder 미로드 또는 NCP에서 서비스 미활성');
      showToast('역지오코딩 기능 미사용 가능 (NCP에서 Reverse Geocoding 활성화 필요)');
      return reject(new Error('Service unavailable'));
    }
    const latlng = new naver.maps.LatLng(lat, lng);
    naver.maps.Service.reverseGeocode({
      coords: latlng,
      orders: [
        naver.maps.Service.OrderType.ADDR,
        naver.maps.Service.OrderType.ROAD_ADDR
      ].join(',')
    }, function(status, response) {
      if (status !== naver.maps.Service.Status.OK) {
        console.error('[역지오코딩] 실패, status:', status);
        showToast('역지오코딩 실패 — 설정에서 시군 직접 선택하세요.');
        return reject(new Error('reverseGeocode status not OK'));
      }
      try {
        const results = response.v2.results;
        if (!results || results.length === 0) {
          return reject(new Error('No results'));
        }
        const region = results[0].region;
        const area1 = (region.area1 && region.area1.name) || '';  // 시도 (경기도)
        const area2 = (region.area2 && region.area2.name) || '';  // 시군구 (성남시 분당구 / 수원시 영통구 / 가평군)
        const area3 = (region.area3 && region.area3.name) || '';  // 읍면동

        // SIGUN_NM 은 시/군 단위 (예: "성남시", "가평군"). 구는 공백으로 구분되어 뒤에 붙음.
        const sigun = area2.split(' ')[0];

        console.log(`[역지오코딩] ✅ ${area1} > ${area2} > ${area3} → SIGUN_NM=${sigun}`);

        if (area1 && !area1.includes('경기')) {
          showToast(`📍 현재 위치: ${area1} ${area2} (경기도 밖이라 필터 미적용)`);
          STATE.sigun = '';
        } else if (sigun) {
          STATE.sigun = sigun;
          showToast(`📍 ${area2}${area3 ? ' ' + area3 : ''} · 시군 필터: ${sigun}`);
        }
        localStorage.setItem('sigun', STATE.sigun);
        const sel = document.getElementById('sigunSelect');
        if (sel) sel.value = STATE.sigun;
        resolve({ area1, area2, area3, sigun });
      } catch (e) {
        console.error('[역지오코딩] 파싱 오류:', e);
        reject(e);
      }
    });
  });
}

// ============================================================
// config.js — 설정·상수 (URL, 아이콘, POLL_DIV, 난독화된 클라이언트 키)
// 로드 순서: config.js → state.js → app.js
// 상태 관리와 함수 로직은 각각 state.js / app.js 참조
// ============================================================

// ============================================================
// 내부 설정 — 수정/공유 금지
// ============================================================
// 외부로 전달할 문자열을 바이트 단위로 풀어내는 유틸
function _u(h) {
  let s = '';
  for (let i = 0; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.substr(i, 2), 16) ^ 0x2a);
  return s;
}
const _CFG = {
  // Naver Maps clientId — 브라우저 노출 불가피, NCP 콘솔 도메인 whitelist로 보호
  k1: _u('4b41415e5942405f4b4f')
  // Opinet / GG 키는 서버(.env)에서 관리 — /api/gas/*, /api/gg/* 프록시 엔드포인트 경유
};

// ─── CORS 프록시 주소 ─────────────────────────────────────────
// 로컬 개발 (localhost / 127.0.0.1 / start-local.bat) 시: 로컬 proxy.py (8080)
// 그 외 (GitHub Pages 등 배포): Synology NAS (stepersjmj.synology.me:18443)
// Opinet 은 해외 IP 를 차단하므로 배포 환경에선 국내 IP 노드(NAS) 경유 필수
const _isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const PROXY_ROOT = _isLocalDev
  ? 'http://localhost:8080'
  : 'https://stepersjmj.synology.me:18443';
const PROXY_BASE   = `${PROXY_ROOT}/proxy`;                       // 레거시 /proxy?url= (Kakao 등 다른 upstream 용)
const GG_API_BASE  = `${PROXY_ROOT}/api/gg`;                      // 경기도 공공데이터 추상 엔드포인트 (서버 키 주입)
const GAS_API_BASE = `${PROXY_ROOT}/api/gas`;                     // Opinet 주유소 추상 엔드포인트 (서버 키 + 좌표변환)
const API_BASE = `${PROXY_BASE}?url=https://openapi.gg.go.kr`;    // 호환용 (필요시 직접 호출 남겨둠)
console.log(`[proxy] ${_isLocalDev ? '🏠 로컬' : '🌐 NAS'} 프록시 사용: ${PROXY_ROOT}`);

// Opinet 상표 코드 → 한글 브랜드명 매핑
// 공식 문서 기준 (실제 응답 필드는 POLL_DIV_CO - 문서 오탈자와 다름)
const POLL_DIV_LABEL = {
  SKE: 'SK에너지',
  GSC: 'GS칼텍스',
  HDO: 'HD현대오일뱅크',
  SOL: 'S-OIL',
  RTE: '자영알뜰',
  RTX: '고속도로알뜰',
  NHO: '농협알뜰',
  ETC: '자가상표',
  E1G: 'E1',
  SKG: 'SK가스'
};

// 공통 라인 아이콘 SVG (1.5px stroke) — 테마와 동일한 얇은 라인 스타일
const LINE_ICONS = {
  money: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M8 9l2 5 2-5 2 5 2-5M7 13h10"/></svg>`,
  gas:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15"/><path d="M3 20h12"/><path d="M14 8h2a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9l-3-3"/></svg>`,
  fav:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  pin:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  phone: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92V21a1 1 0 0 1-1.1 1 19.91 19.91 0 0 1-8.67-3.07 19.5 19.5 0 0 1-6-6A19.91 19.91 0 0 1 3.15 4.1 1 1 0 0 1 4.14 3H8.24a1 1 0 0 1 1 .75l1 4a1 1 0 0 1-.29 1L8.21 10.7a16 16 0 0 0 6 6l1.95-1.74a1 1 0 0 1 1-.29l4 1a1 1 0 0 1 .84 1.25z"/></svg>`,
  locpin:`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  nav:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`,
  heart: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`
};

const ICONS = {
  money: { color: '#7E8C5C', label: '지역화폐', svg: LINE_ICONS.money },
  gas:   { color: '#B76E4A', label: '주유소',  svg: LINE_ICONS.gas }
};

// 주유소 최저가 순위(1~5위)별 스타일 — Warm Stone 팔레트와 조화
const RANK_STYLES = {
  1: { color: '#C9A24A', size: 40 },  // 금 (muted gold)
  2: { color: '#AFA69B', size: 38 },  // 은 (taupe silver)
  3: { color: '#B07D53', size: 36 },  // 동 (warm bronze)
  4: { color: '#7E8C5C', size: 34 },  // 올리브 (theme)
  5: { color: '#B76E4A', size: 32 }   // 테라코타 (theme)
};


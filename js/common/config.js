// ============================================================
// common/config.js — 공통 상수·설정
//   - 프록시 URL, Naver 키, 공통 SVG 아이콘, 빈 ICONS 객체
//   - 각 기능 모듈(money/config.js, gas/config.js)이 ICONS 에 자기 카테고리 등록
// 로드 순서: common/config → money/config → gas/config → common/state → ...
// ============================================================

// ─── 외부로 전달할 문자열을 바이트 단위로 풀어내는 유틸 (Naver clientId 난독화용)
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

// ─── 데이터 카테고리 목록 ─────────────────────────────────────
// fav(즐겨찾기)는 파생 카테고리이므로 별도 처리. 여기는 원본 데이터 카테고리만.
// 새 카테고리 추가 시 이 배열 + STATE.active/markers/data + ICONS 등록만 하면 됨.
const DATA_CATEGORIES = ['money', 'gas', 'truck', 'street', 'bluer'];

// 시군·반경 필터를 모두 무시하고 항상 전체 데이터를 표시하는 카테고리 목록.
// (데이터 양이 적어 자르면 사용자가 '데이터 없음' 으로 오해할 수 있는 카테고리)
// loadAndRenderCategory 에서 filterByRadius 우회 + 각 api.js 에서 sigun 필터 미적용.
const UNFILTERED_CATEGORIES = ['truck', 'street'];

// ─── 공통 라인 아이콘 SVG (1.5~1.6px stroke) ──────────────────
// 카테고리별 SVG(money/gas)는 각 기능 config 로 이동. 여기는 UI 공통 아이콘만.
const LINE_ICONS = {
  pin:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  phone: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92V21a1 1 0 0 1-1.1 1 19.91 19.91 0 0 1-8.67-3.07 19.5 19.5 0 0 1-6-6A19.91 19.91 0 0 1 3.15 4.1 1 1 0 0 1 4.14 3H8.24a1 1 0 0 1 1 .75l1 4a1 1 0 0 1-.29 1L8.21 10.7a16 16 0 0 0 6 6l1.95-1.74a1 1 0 0 1 1-.29l4 1a1 1 0 0 1 .84 1.25z"/></svg>`,
  locpin:`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  nav:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`,
  heart: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`
};

// 카테고리별 아이콘·색상 — 각 기능 config 에서 ICONS.money / ICONS.gas 로 등록
const ICONS = {};

// ============================================================
// app.js — 엔트리포인트 (부트스트랩만)
// 전체 앱 로직은 js/common, js/money, js/gas 폴더에 기능별로 분리됨.
// 로드 순서 (index.html 의 <script> 태그 순서 참고):
//   common/config → money/config → gas/config →
//   common/state → common/api → money/api → gas/api →
//   common/map → common/markers → gas/markers →
//   common/favorites → common/ui → app
// ============================================================

checkSetup();

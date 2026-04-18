# mjmap 배포 가이드

`index.html` 은 GitHub Pages, `proxy.py` 는 Render 무료 Web Service 로 배포합니다.

---

## 1단계 — 변경사항을 GitHub 에 push

이 대화에서 다음 파일들이 추가/수정되었습니다:

- `proxy.py`         — `PORT` 환경변수 지원 + 헬스체크 엔드포인트 추가
- `render.yaml`      — Render 자동 배포용 Blueprint
- `DEPLOY.md`        — 이 가이드

로컬 터미널에서:

```bash
cd /path/to/mjmap
git add proxy.py render.yaml DEPLOY.md
git commit -m "add Render deployment config"
git push origin main
```

---

## 2단계 — Render 에 프록시 배포

### (쉬운 방법) Blueprint 자동 배포

1. https://dashboard.render.com 접속
2. 좌측 사이드바에서 **기존 프로젝트** 클릭 (이미 쓰고 계신 그 프로젝트)
3. 프로젝트 화면 우측 상단 **"+ New"** → **"Blueprint"** 클릭
4. GitHub 레포 `stepersjmj-hash/mjmap` 선택 → **"Connect"**
5. Render 가 `render.yaml` 을 자동으로 읽고 `mjmap-proxy` 라는 Web Service 를 생성합니다
6. **"Apply"** 클릭 → 배포 시작 (1~3분 소요)
7. 배포 완료되면 상단에 `https://mjmap-proxy-XXXX.onrender.com` 같은 URL 이 뜹니다 ← **이 URL 을 복사해두세요**

### (수동) Web Service 직접 생성

Blueprint 가 안 보이면:

1. 기존 프로젝트 → **"+ New"** → **"Web Service"**
2. 레포 `stepersjmj-hash/mjmap` 선택
3. 설정:
   - Name: `mjmap-proxy`
   - Region: Singapore 등 가까운 곳
   - Branch: `main`
   - Runtime: `Python 3`
   - Build Command: (비워둠)
   - Start Command: `python proxy.py`
   - Instance Type: **Free**
4. **"Create Web Service"** 클릭
5. 배포 완료 후 URL 확인

---

## 3단계 — 프록시 동작 확인

브라우저에서 `https://mjmap-proxy-XXXX.onrender.com/health` 접속 → `OK - mjmap proxy is running...` 보이면 정상.

> ⚠️ Render 무료 플랜은 15분간 요청이 없으면 sleep 상태가 되고, 다시 깨어날 때 30초~1분 정도 걸립니다. 첫 요청이 느릴 수 있습니다.

테스트 요청 (실제 API 가 도는지):
```
https://mjmap-proxy-XXXX.onrender.com/proxy?url=https://openapi.gg.go.kr/RegionMnyFacltStus&KEY=<본인키>&Type=json&pSize=5
```
JSON 응답이 나오면 성공.

---

## 4단계 — `index.html` 의 `API_BASE` 교체

현재 `index.html` 967번째 줄:
```js
const API_BASE = 'http://localhost:8080/proxy?url=https://openapi.gg.go.kr';
```

위 3단계에서 받은 Render URL 로 교체:
```js
const API_BASE = 'https://mjmap-proxy-XXXX.onrender.com/proxy?url=https://openapi.gg.go.kr';
```

저장 후 git push 하면 GitHub Pages 에서 자동으로 반영됩니다.

> 이 교체 작업은 배포된 Render URL 이 확정된 뒤에 Claude 가 대신 해드릴 수 있습니다.
> URL 알려주시면 `index.html` 한 줄만 정확히 고쳐드릴게요.

---

## 5단계 — GitHub Pages 에서 최종 확인

1. https://stepersjmj-hash.github.io/mjmap/ 접속
2. 처음 접속 시 API 키 입력 창이 뜨면 경기도 / Naver / Opinet 키 입력
3. 지도에 지역화폐 가맹점 / 주유소 마커가 뜨는지 확인

---

## 문제 발생 시 체크리스트

| 증상 | 원인 / 해결 |
|---|---|
| 첫 로드가 매우 느림 | Render 무료 sleep → cold start. 한 번 깨우면 15분간 빠릅니다 |
| CORS 에러 (브라우저 콘솔) | `API_BASE` 가 여전히 localhost 로 되어있는지 확인 |
| 프록시가 500 반환 | Render 대시보드 → Logs 탭에서 `[proxy] 예외 발생:` 라인 확인 |
| Opinet 만 에러 | Referer 검증 가능성 — `proxy.py` 에 이미 Referer 위조 로직 있음. Render 에서도 정상 작동 기대됨 (미검증) |
| 750시간/월 초과 | 다른 서비스와 합산 — Render Billing 페이지 확인 |

---

## ⚠️ 확실치 않은 부분

- **Render 무료 플랜 합산 시간 정책**: 기존에 쓰시는 서비스와 합쳐서 월 750시간을 초과하면 sleep 이 더 자주 발생할 수 있습니다. 실제 한도는 Render Billing 페이지에서 확인 부탁드립니다.
- **Opinet API 의 Render IP 대응**: Render 의 서버 IP 에서 Opinet 가 Referer 위조를 통과시킬지는 실제 배포 후 테스트해봐야 확실합니다. 실패 시 대응 방안 알려드릴 수 있습니다.
- **API 키 노출**: 현재 클라이언트(브라우저)에서 키를 직접 붙여 프록시로 전달하는 구조 — GitHub Pages 는 static 이라 키를 서버에서 주입할 수 없습니다. 공개 배포 시 키가 네트워크 탭에서 보일 수 있으니, 경기도 API 키처럼 무료이고 rate limit 만 있는 키는 괜찮지만 민감한 키는 권장하지 않습니다.

# Synology NAS — mjmap CORS 프록시 배포 가이드

> **대상 환경**: DS920+ / DSM 7.3.2 / 공인 IP / DDNS `stepersjmj.synology.me` / HTTPS 인증서 설치됨

이 문서대로 따라 하면 Render 대신 NAS 에서 프록시를 돌릴 수 있습니다. NAS 는 **한국 IP** 이므로 Opinet(주유소 가격) API 가 정상 응답합니다.

최종 주소: `https://stepersjmj.synology.me/mjmap-proxy/...`

---

## 전체 흐름 요약

1. DSM 에 **Container Manager** 패키지 설치
2. NAS 에 소스 파일 업로드 (`proxy.py`, `Dockerfile`, `docker-compose.yml`)
3. Container Manager 에서 프로젝트 빌드 & 실행
4. DSM **Reverse Proxy** 설정 → `https://stepersjmj.synology.me/mjmap-proxy/*` → `http://localhost:8080/*`
5. 방화벽에서 **프록시 포트(8080)** 는 내부용으로만 두고, 외부는 HTTPS(443)만 통과
6. 동작 확인 후 `index.html` 의 `API_BASE` 를 NAS 주소로 교체

소요 시간: **대략 30분 ~ 1시간**

---

## 1단계 — Container Manager 설치

1. DSM 로그인 → **패키지 센터** 실행
2. 검색창에 `Container Manager` 입력 → **설치**
   - (DSM 7.2 이상에서 이름이 Docker → Container Manager 로 바뀌었습니다)
3. 설치 완료 후 **열기**

> ⚠️ 확실치 않은 부분: DS920+ 는 Intel 기반이라 Container Manager 호환이 되지만, DSM 7.3.2 의 Container Manager 버전에 따라 UI 가 약간 다를 수 있습니다.

---

## 2단계 — NAS 에 소스 파일 업로드

### 방법 A: File Station (GUI)

1. DSM → **File Station** 열기
2. `docker` 공유 폴더가 있는지 확인 (Container Manager 설치 시 자동 생성됨). 없으면 **생성** → 이름: `docker`
3. `docker` 안에 폴더 생성: **`mjmap-proxy`**
4. 로컬 PC 에서 다음 3개 파일을 이 폴더로 드래그&드롭:
   - `proxy.py`
   - `Dockerfile`
   - `docker-compose.yml`

### 방법 B: SSH (CLI 로 편한 분)

```bash
# 로컬에서
scp proxy.py Dockerfile docker-compose.yml admin@stepersjmj.synology.me:/volume1/docker/mjmap-proxy/
```

### GitHub 에서 바로 받기

SSH 가능하면 NAS 에서 git clone 도 가능:

```bash
ssh admin@stepersjmj.synology.me
sudo mkdir -p /volume1/docker/mjmap-proxy
cd /volume1/docker/mjmap-proxy
sudo git clone https://github.com/stepersjmj-hash/mjmap.git .
```

---

## 3단계 — Container Manager 에서 프로젝트 실행

### GUI 방식 (권장)

1. Container Manager → 좌측 **프로젝트** 탭 → **생성**
2. 설정:
   - **프로젝트 이름**: `mjmap-proxy`
   - **경로**: `/docker/mjmap-proxy` 선택
   - **소스**: "기존 docker-compose.yml 사용"
3. **다음** → YAML 미리보기 확인 → **다음**
4. **웹 페이지 포털 설정은 건너뛰기** (Reverse Proxy 로 따로 붙입니다)
5. **완료** → 자동으로 빌드 + 시작
6. 상태가 **실행 중** 으로 변하면 성공

### SSH 방식

```bash
cd /volume1/docker/mjmap-proxy
sudo docker compose up -d --build

# 로그 확인
sudo docker logs -f mjmap-proxy
```

`🚀 CORS 프록시 서버가 포트 8080 에서 실행 중입니다.` 가 보이면 OK.

### 내부 동작 확인

NAS 의 다른 터미널/브라우저에서:
```
http://<NAS내부IP>:8080/health
```
→ `OK - mjmap proxy is running...` 이 보여야 함.

---

## 4단계 — DSM Reverse Proxy 설정

**목적**: 외부에서 HTTPS(443) 로 들어오는 요청을 내부 `http://localhost:8080` 으로 중계 + SSL 인증서는 NAS 가 처리.

1. DSM → **제어판** → **로그인 포털** → **고급** 탭 → **역방향 프록시 서버** → **생성**
2. 설정:

   | 항목 | 값 |
   |---|---|
   | **설명** | `mjmap-proxy` |
   | **소스 — 프로토콜** | HTTPS |
   | **소스 — 호스트 이름** | `stepersjmj.synology.me` |
   | **소스 — 포트** | `443` |
   | **소스 — HSTS/HTTP2** | 필요 시 켜도 무방 |
   | **대상 — 프로토콜** | HTTP |
   | **대상 — 호스트 이름** | `localhost` |
   | **대상 — 포트** | `8080` |

3. **사용자 지정 헤더** 탭 → **생성 → WebSocket** 템플릿은 여기선 불필요. 그냥 저장.

4. ⚠️ **경로 기반 라우팅**: DSM 기본 역방향 프록시는 "경로 접두어" 옵션이 있는 버전과 없는 버전이 있습니다.
   - **경로 접두어 지원 O (DSM 7.2+)**: "소스" 아래 **경로 접두어** 에 `/mjmap-proxy` 입력 → 외부 URL 이 `https://stepersjmj.synology.me/mjmap-proxy/proxy?url=...` 가 됩니다.
   - **경로 접두어 지원 X**: 호스트 이름을 서브도메인으로 분리 (`mjmap.stepersjmj.synology.me` 같은 별도 DDNS) 하거나, 포트 분리 방식 (예: 소스 포트 8443). **개인 용도라면 포트 분리가 제일 간단**합니다.

> ⚠️ 확실치 않은 부분: DSM 7.3.2 의 역방향 프록시가 경로 접두어를 공식 지원하는지 버전별로 달라 실제 설정 화면에 옵션이 보이는지 확인이 필요합니다. 옵션이 없으면 아래 대안 중 하나를 선택하세요.

### 대안 1 — 포트로 분리 (가장 쉬움)

역방향 프록시에서:
- 소스: `https://stepersjmj.synology.me:18443` (원하는 포트)
- 대상: `http://localhost:8080`

그 후 `index.html`:
```js
const API_BASE = 'https://stepersjmj.synology.me:18443/proxy?url=https://openapi.gg.go.kr';
```

라우터(공유기)에서 **18443 포트 포워딩** 도 NAS 로 열어야 합니다.

### 대안 2 — 서브도메인 추가

Synology DDNS 는 한 계정당 여러 서브도메인을 지원하지 않으므로, 직접 만든 도메인(예: 가비아/후이즈) 의 서브도메인을 NAS IP 로 CNAME/A 레코드 설정하는 방식입니다. 가장 깔끔하지만 도메인 구입이 필요합니다.

---

## 5단계 — 방화벽 & 포트포워딩

### 공유기 포트포워딩

외부 → NAS 로 들어올 포트만 열어둡니다:
- **443** (기본 HTTPS) — 이미 쓰고 계실 것
- (대안 1 선택 시) **18443** 추가

**프록시 내부 포트 8080 은 절대 외부에 열지 마세요.** Reverse Proxy 를 거치지 않으면 보안 체크가 우회됩니다.

### DSM 방화벽 (제어판 → 보안 → 방화벽)

- 8080 inbound: **LAN 에서만** 허용 (외부는 Reverse Proxy 경유)

---

## 6단계 — 동작 확인

### A. 헬스체크

브라우저에서:
```
https://stepersjmj.synology.me/mjmap-proxy/health
```
(경로 접두어 대안 썼으면 해당 주소로)

→ `OK - mjmap proxy is running...` 보이면 성공.

### B. 경기도 API 테스트

```
https://stepersjmj.synology.me/mjmap-proxy/proxy?url=https://openapi.gg.go.kr/RegionMnyFacltStus&KEY=<경기도키>&Type=json&pSize=5
```

JSON 응답이 나오면 OK.

### C. Opinet (한국 IP 검증!)

```
https://stepersjmj.synology.me/mjmap-proxy/proxy?url=https://www.opinet.co.kr/api/aroundAll.do&code=<Opinet키>&x=962975&y=1946421&radius=3000&sort=1&prodcd=B027&out=xml
```

XML 데이터가 나오면 **Render 에서 실패했던 Opinet 가 정상 동작**한다는 뜻입니다.

---

## 7단계 — index.html `API_BASE` 교체

Render URL 로 되어 있는 줄을 NAS URL 로 교체합니다:

**Before** (`index.html` L967):
```js
const API_BASE = 'https://mjmap-proxy.onrender.com/proxy?url=https://openapi.gg.go.kr';
```

**After**:
```js
const API_BASE = 'https://stepersjmj.synology.me/mjmap-proxy/proxy?url=https://openapi.gg.go.kr';
```

(포트 분리 대안 1 을 쓰면 `https://stepersjmj.synology.me:18443/proxy?url=...` 로)

저장 후 `git push` → GitHub Pages 자동 반영.

> 이 교체는 NAS 주소가 확정된 뒤 Claude 가 대신 해드릴 수 있습니다. 주소 알려주시면 한 줄만 수정하겠습니다.

---

## (선택) 8단계 — Opinet 다시 활성화

Kakao API 로 바꿨던 주유소 로딩 로직을 Opinet 로 복구해서 **가격까지** 표시할 수 있습니다. 이는 `index.html` 의 `loadGasData()` 함수를 되돌리는 작업인데, 한국 IP 가 확인되면 요청해 주세요. 현 시점엔 작동하는 Kakao 버전을 남겨뒀습니다.

---

## 문제 해결 (Troubleshooting)

| 증상 | 원인 / 해결 |
|---|---|
| `docker compose up` 실패: permission denied | SSH 에서 `sudo` 붙여서 실행 |
| Container Manager 에서 빌드 실패 | 로그 확인 — 대부분은 `Dockerfile` 경로/줄바꿈(Windows CRLF) 문제. File Station 에서 재업로드 |
| `/health` 접속은 되는데 `/proxy?url=...` 가 403 | `ALLOWED_UPSTREAM_HOSTS` 에 해당 호스트 없음 → `docker-compose.yml` 수정 후 `docker compose up -d` |
| 브라우저 콘솔에 CORS 에러 | `ALLOWED_ORIGINS` 에 GitHub Pages 주소 빠짐 확인 |
| 외부 접속 안됨 | 공유기 포트포워딩 + NAS 방화벽 확인. 내부 LAN 에선 되는데 외부 불가 = 네트워크 설정 |
| Let's Encrypt SSL 경고 | DSM → 제어판 → 보안 → 인증서에서 `stepersjmj.synology.me` 인증서가 해당 Reverse Proxy 항목에 바인딩 되어있는지 확인 |
| Opinet 만 여전히 502 | 한국 IP 인지 확인 (`curl https://api.ipify.org` NAS 에서 실행). IP 가 한국이어도 실패하면 Opinet 콘솔에서 키 상태 확인 |
| 로그가 안쌓임 | Container Manager → 컨테이너 → mjmap-proxy → 로그 탭. CLI: `sudo docker logs mjmap-proxy` |

---

## 업데이트 (코드 수정 후 재배포)

```bash
cd /volume1/docker/mjmap-proxy
sudo git pull                           # (git clone 으로 받았을 때)
sudo docker compose up -d --build       # 이미지 재빌드 + 재시작
```

GUI: Container Manager → 프로젝트 → mjmap-proxy → **다시 빌드**

---

## ⚠️ 확실치 않은 부분 (검증 필요)

1. **DSM 7.3.2 Reverse Proxy 의 경로 접두어 지원 여부** — 지원 여부에 따라 4단계 경로가 달라집니다. 설정 화면에서 "경로 접두어" 옵션이 보이지 않으면 "대안 1 포트 분리" 를 사용하세요.
2. **공인 IP 가 한국 IP 인지** — ISP 에 따라 해외 CDN 경유일 수 있습니다. NAS SSH 에서 `curl https://api.ipify.org` 후 그 IP 를 WhoIs 조회해 KR 인지 확인 권장.
3. **DSM 방화벽 기본 규칙** — 기본으로 모든 포트 허용일 수도, 차단일 수도 있습니다. `8080` 이 외부 노출되지 않았는지 외부망에서 `curl https://stepersjmj.synology.me:8080/health` 로 확인해 보세요. 응답 오면 방화벽에서 8080 을 LAN 전용으로 막아야 합니다.
4. **Opinet API 키의 일일 한도 / Rate Limit** — 키마다 다릅니다. 많이 호출하면 키 정지될 수 있으니 radius/frequency 조절 권장.
5. **Synology Container Manager 와 순수 Docker 의 compose 동작 차이** — 대부분 같지만 `build: .` 지시어가 GUI 에서 누락되는 경우가 있었습니다. 빌드 실패 시 SSH 로 명령행 실행 권장.

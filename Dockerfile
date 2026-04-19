# mjmap CORS 프록시 — Synology NAS / Docker 용 이미지
#
# 특징:
#   - 표준 라이브러리만 사용 → pip install 불필요
#   - 이미지 크기 최소화 (python:3.12-slim 베이스)
#   - 비루트 사용자로 실행 (보안)
#
# 빌드:
#   docker build -t mjmap-proxy:latest .
#
# 실행:
#   docker run -d --name mjmap-proxy -p 8080:8080 --restart unless-stopped mjmap-proxy:latest

FROM python:3.12-slim

# 보안: 비루트 사용자 생성
RUN groupadd -r mjmap && useradd -r -g mjmap mjmap

WORKDIR /app

# 소스 복사
COPY proxy.py /app/proxy.py

# 권한
RUN chown -R mjmap:mjmap /app
USER mjmap

# 포트 (환경변수 PORT 로 변경 가능)
EXPOSE 8080

# 컨테이너 헬스체크 (30초마다 /health 핑)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; \
    r=urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=3); \
    sys.exit(0 if r.status==200 else 1)" || exit 1

CMD ["python", "-u", "proxy.py"]

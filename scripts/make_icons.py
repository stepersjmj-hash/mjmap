"""
홈 화면·바로가기용 PNG 아이콘 생성기
====================================
index.html 의 favicon(SVG 지도 아이콘)과 같은 디자인을
크림 배경의 정사각 PNG 로 렌더링한다. 표준 라이브러리 + Pillow 만 사용.

실행:
  python scripts/make_icons.py
출력:
  icons/icon-180.png  (iOS apple-touch-icon)
  icons/icon-192.png  (웹 매니페스트 / Android·네이버 앱 바로가기)
  icons/icon-512.png  (웹 매니페스트 큰 아이콘 / og:image)

디자인 변경 시 아래 BG / INK / 좌표만 수정 후 재실행.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'icons'

BG  = '#F6F1E7'   # 크림 배경 (favicon rect fill 과 동일)
INK = '#B76E4A'   # 선 색 (favicon stroke 와 동일)
SIZES = [180, 192, 512]

# 헤더 로고 SVG (viewBox 24, lucide "map") 경로를 폴리라인으로 옮긴 것
#   M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2z   → 닫힌 다각형
#   M9 3v16 / M15 5v16                    → 세로선 2개 (접힌 선)
OUTLINE = [(9, 3), (3, 5), (3, 21), (9, 19), (15, 21), (21, 19), (21, 3), (15, 5)]
LINES   = [[(9, 3), (9, 19)], [(15, 5), (15, 21)]]
STROKE_VB = 1.5          # viewBox 단위 선 두께
GLYPH_RATIO = 0.62       # 아이콘 한 변 대비 글리프가 차지하는 비율 (maskable safe zone 고려)


def render(size: int, supersample: int = 4) -> Image.Image:
    S = size * supersample
    img = Image.new('RGB', (S, S), BG)
    d = ImageDraw.Draw(img)

    # viewBox(0~24) → 픽셀 좌표. 글리프를 중앙에 GLYPH_RATIO 크기로 배치
    scale = S * GLYPH_RATIO / 24
    off = (S - 24 * scale) / 2
    px = lambda p: (off + p[0] * scale, off + p[1] * scale)
    w = max(1, round(STROKE_VB * scale))

    def stroke(points, closed=False):
        pts = [px(p) for p in points]
        if closed:
            pts = pts + [pts[0]]
        d.line(pts, fill=INK, width=w, joint='curve')
        for x, y in pts:  # 둥근 끝/모서리
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=INK)

    stroke(OUTLINE, closed=True)
    for seg in LINES:
        stroke(seg)

    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT_DIR.mkdir(exist_ok=True)
    for s in SIZES:
        path = OUT_DIR / f'icon-{s}.png'
        render(s).save(path, optimize=True)
        print(f'[icons] {path.relative_to(ROOT)} ({s}x{s})')


if __name__ == '__main__':
    main()

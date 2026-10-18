"""Склейка кадров из gif.mjs в GIF. Запуск: python e2e/tools/make_gif.py [кадры] [выход.gif] [ширина]"""
import sys
from pathlib import Path

from PIL import Image

src = Path(sys.argv[1] if len(sys.argv) > 1 else "tmp/gif")
dst = Path(sys.argv[2] if len(sys.argv) > 2 else "docs/demo.gif")
width = int(sys.argv[3]) if len(sys.argv) > 3 else 720

FPS = 10
files = sorted(src.glob("*.jpg"), key=lambda f: int(f.stem))
if not files:
    sys.exit(f"нет кадров в {src}")

# Screencast шлёт кадры только при изменениях, поэтому по меткам времени
# раскладываем их на ровную сетку FPS: на каждый тик — последний кадр до него
stamps = [int(f.stem) for f in files]
picked, j = [], 0
for t in range(stamps[0], stamps[-1] + 1, 1000 // FPS):
    while j + 1 < len(stamps) and stamps[j + 1] <= t:
        j += 1
    picked.append(files[j])

cache = {}
frames = []
for f in picked:
    if f not in cache:
        im = Image.open(f).convert("RGB")
        cache[f] = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    frames.append(cache[f])

# Одна общая палитра на все кадры: меньше мерцания и размер
palette = frames[len(frames) // 2].quantize(colors=128, method=Image.Quantize.MEDIANCUT)
q = [fr.quantize(palette=palette, dither=Image.Dither.NONE) for fr in frames]

dst.parent.mkdir(parents=True, exist_ok=True)
q[0].save(dst, save_all=True, append_images=q[1:], duration=1000 // FPS, loop=0, optimize=True)
print(f"{dst}: {len(q)} кадров, {dst.stat().st_size / 1e6:.1f} МБ")

"""Crop approved artwork into full-bleed circular files; never add a shell/background.
Run with Python + Pillow. Coordinates refer to the checked-in source pixels.
"""
from pathlib import Path
import hashlib
import json
import math
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / 'src/renderer/executor-logos'
CROPS = {
    'chatgpt-circle.png': ('chatgpt-official.jpg', (32, 32, 480, 480)),
    'zcode-circle.png': ('zcode-official.png', (16, 16, 176, 176)),
    'antigravity-circle.png': ('antigravity-app-official.png', (64, 64, 448, 448)),
    'qwenwork-circle.png': ('qwenwork.png', (0, 0, 192, 192)),
    'kimi-circle.png': ('kimi.png', (0, 0, 192, 192)),
    'doubao-circle.png': ('doubao.png', (0, 0, 192, 192)),
    'deepseek-circle.png': ('deepseek-app-source.png', (24, 24, 488, 488)),
    'gemini-circle.png': ('gemini-app-source.png', (53, 53, 459, 459)),
    'coze-circle.png': ('coze-official.png', (50, 44, 770, 764)),
}
mask = Image.new('L', (1024, 1024))
ImageDraw.Draw(mask).ellipse((0, 0, 1023, 1023), fill=255)
mask = mask.resize((256, 256), Image.Resampling.LANCZOS)
records = []
for name, (source, box) in CROPS.items():
    original = Image.open(ROOT / source).convert('RGBA')
    assert min(original.size) >= 96, f'{source}: use a high-resolution official source'
    assert 0 <= box[0] < box[2] <= original.width and 0 <= box[1] < box[3] <= original.height, source
    assert box[2] - box[0] == box[3] - box[1], source
    image = original.crop(box).resize((256, 256), Image.Resampling.LANCZOS)
    image.putalpha(ImageChops.multiply(image.getchannel('A'), mask))
    alpha = image.getchannel('A')
    assert alpha.getbbox() == (0, 0, 256, 256), f'{name}: exterior padding'
    assert all(alpha.getpixel((round(127.5 + 118 * math.cos(t * math.pi / 180)),
                               round(127.5 + 118 * math.sin(t * math.pi / 180)))) >= 240
               for t in range(360)), f'{name}: transparent gap inside circle'
    image.save(ROOT / name)
    records.append({'file': name, 'derivedFrom': source, 'cropBox': box,
                    'treatment': 'tight square crop, circular alpha mask; no added background, border or padding',
                    'sha256': hashlib.sha256((ROOT / name).read_bytes()).hexdigest()})
svg = (ROOT / 'browser.svg').read_text().replace('viewBox="0 0 24 24"', 'viewBox="2 2 20 20"')
(ROOT / 'browser-circle.svg').write_text(svg)
records.append({'file': 'browser-circle.svg', 'derivedFrom': 'browser.svg',
                'treatment': 'tight native globe viewBox including stroke bounds; no added circle',
                'sha256': hashlib.sha256(svg.encode()).hexdigest()})
(ROOT / 'circle-crops.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')

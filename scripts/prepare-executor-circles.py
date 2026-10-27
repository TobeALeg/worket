"""Crop approved artwork into full-bleed circular files; never add a shell/background.
Run with Python + Pillow. Coordinates refer to the checked-in source pixels.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / 'src/renderer/executor-logos'
CROPS = {
    'chatgpt-circle.png': ('chatgpt-official.jpg', (32, 32, 480, 480)),
    'zcode-circle.png': ('zcode.png', (10, 11, 86, 87)),
    'antigravity-circle.png': ('antigravity.png', (14, 14, 82, 82)),
    'qwenwork-circle.png': ('qwenwork.png', (0, 0, 192, 192)),
    'kimi-circle.png': ('kimi.png', (0, 0, 192, 192)),
    'doubao-circle.png': ('doubao.png', (0, 0, 192, 192)),
    'deepseek-circle.png': ('deepseek-app-source.png', (24, 24, 488, 488)),
    'gemini-circle.png': ('gemini-app-source.png', (53, 53, 459, 459)),
    'coze-circle.png': ('coze.ico', (2, 2, 18, 18)),
}
mask = Image.new('L', (1024, 1024))
ImageDraw.Draw(mask).ellipse((0, 0, 1023, 1023), fill=255)
mask = mask.resize((256, 256), Image.Resampling.LANCZOS)
records = []
for name, (source, box) in CROPS.items():
    image = Image.open(ROOT / source).convert('RGBA').crop(box).resize((256, 256), Image.Resampling.LANCZOS)
    image.putalpha(ImageChops.multiply(image.getchannel('A'), mask))
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

"""Prepare a buildless GitHub Pages root without changing the shared solver."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'frontend/v03'
FILES = ('index.html', 'app.js', 'engine.js', 'worker.js', 'catalog.js', 'product.js', 'roads.js', 'analysis.js', 'style.css')
for name in FILES:
    shutil.copy2(SOURCE / name, ROOT / name)
(ROOT / '.nojekyll').write_text('', encoding="utf-8")
print('GitHub Pages root prepared: 9 shared assets and .nojekyll')

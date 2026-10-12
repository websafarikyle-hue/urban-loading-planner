"""Bundle the browser application into an HTML with a Blob-backed shared solver."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'frontend/v03'
html=(SOURCE/'index.html').read_text(encoding="utf-8")
html=html.replace('<link rel="stylesheet" href="style.css?v=0.9.4">','<style>'+(SOURCE/'style.css').read_text(encoding="utf-8")+'</style>')
engine=(SOURCE/'engine.js').read_text(encoding="utf-8")
worker=(SOURCE/'worker.js').read_text(encoding="utf-8").replace('importScripts("engine.js?v=0.9.4");','')
embedded='<script id="embedded-worker" type="text/plain">'+engine+'\n'+worker+'</script>'
for name in ('engine','catalog','product','roads','analysis','app'):
    html=html.replace('<script src="'+name+'.js?v=0.9.4"></script>','<script>'+(SOURCE/(name+'.js')).read_text(encoding="utf-8")+'</script>')
html=html.replace('<script>'+engine,embedded+'<script>'+engine,1)
dest=ROOT/'standalone-demo.html';dest.write_text(html, encoding="utf-8")
print(dest)

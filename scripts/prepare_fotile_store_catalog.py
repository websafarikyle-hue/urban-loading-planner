"""Curate official FOTILE store records; coordinates require separate verification."""
import argparse
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = ('https://www.fotile.com/h5/services/queryStore?'
              'pagination=1&size=200&key=%E6%9D%AD%E5%B7%9E%E5%B8%82')
from build_v03_catalog import build, POINTS
SELECTED_IDS = [p[0] for p in POINTS]


def build_catalog(raw, queried_at):
    catalog = build(raw)
    catalog['query_date'] = queried_at
    return catalog


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-json', type=Path,
                        help='Use a saved official response instead of a network request')
    parser.add_argument('--queried-at', help='Actual time of the source query')
    args = parser.parse_args()
    if args.source_json:
        if not args.queried_at:
            parser.error('--source-json requires --queried-at')
        raw = json.loads(args.source_json.read_text(encoding="utf-8"))
    else:
        request = urllib.request.Request(SOURCE_URL, headers={
            'User-Agent': 'UrbanFlowDemo/0.3-public-store-research'})
        with urllib.request.urlopen(request, timeout=35) as response:
            raw = json.load(response)
    catalog = build_catalog(raw, args.queried_at or datetime.now(timezone.utc).isoformat())
    output = ROOT / 'data/hangzhou-fotile-store-catalog.json'
    output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding="utf-8")
    (ROOT/'frontend/v03/catalog.js').write_text('window.FOTILE_CATALOG='+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';\n', encoding="utf-8")
    print(f'Saved {len(catalog["stores"])} official stores with public map references')


if __name__ == '__main__':
    main()

"""Refresh curated public OSM retail locations; no customer or order data."""
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NODE_IDS = [6569219085, 6790629887, 6795244186, 13482032602, 6759631585,
            269769920, 13417322347, 13657703244, 13657642655, 12895130732]


def build_catalog(raw, query_date, source_url):
    nodes = {n['id']: n for n in raw['elements'] if n['type'] == 'node'}
    stores = []
    for i, node_id in enumerate(NODE_IDS, 1):
        n = nodes[node_id]
        tags = n.get('tags', {})
        if tags.get('shop') not in ('convenience', 'supermarket') or not tags.get('name'):
            raise ValueError(f'Node {node_id} is no longer a named retail location')
        store_id = f'HZ-S{i:02}'
        stores.append({
            'id': store_id, 'name': tags['name'],
            'display_name': f"{store_id} · {tags['name']}",
            'lon': n['lon'], 'lat': n['lat'], 'category': tags['shop'],
            'address': ''.join(tags.get(k, '') for k in
                               ('addr:province', 'addr:city', 'addr:district',
                                'addr:street', 'addr:housenumber')) or None,
            'address_complete': False,
            'source_url': f'https://www.openstreetmap.org/node/{node_id}',
            'osm_node_id': node_id, 'osm_version': n['version'],
            'osm_updated_at': n['timestamp'],
            'business_status_verified': False,
            'unloading_entrance_verified': False,
            'coordinate_role': '公开地图门店标记点；演示中假设为收货点',
            'default_receiving_window': None,
        })
    return {
        'schema_version': 1, 'city': '杭州', 'coordinate_system': 'WGS84',
        'provider': 'OpenStreetMap', 'query_date': query_date,
        'source_api_url': source_url, 'license': 'ODbL-1.0',
        'attribution': '© OpenStreetMap contributors',
        'license_url': 'https://www.openstreetmap.org/copyright',
        'note': '真实公开地图记录；门店编号为项目编号，非官方分店名。'
                '未核验当前营业状态和卸货入口；地址缺失保留为空。'
                '订单、货物、收货时间窗及客户关系另行模拟。',
        'stores': stores,
    }


def main():
    url = 'https://www.openstreetmap.org/api/0.6/nodes.json?nodes=' + ','.join(map(str, NODE_IDS))
    req = urllib.request.Request(url, headers={'User-Agent': 'UrbanFlowDemo/0.3-location-presets'})
    with urllib.request.urlopen(req, timeout=35) as response:
        raw = json.load(response)
    catalog = build_catalog(raw, datetime.now(timezone.utc).isoformat(), url)
    (ROOT / 'data/hangzhou-store-catalog.json').write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding="utf-8")
    print(f"Saved {len(catalog['stores'])} public store locations")


if __name__ == '__main__':
    main()

"""Build the public-source catalogue, retaining coordinate provenance and uncertainty."""
import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://www.fotile.com/h5/services/queryStore?pagination=1&size=200&key=%E6%9D%AD%E5%B7%9E%E5%B8%82'
# Official record ID, public map POI, latitude, longitude, point role.
POINTS = [
 (23282,'B0J2A430J4',30.316283,120.097058,'门店'),
 (2092,'B0LB37CVBS',30.314275,120.096675,'门店'),
 (80602,'B0L3ONWC1Q',30.287673,120.068571,'同址商场参考点'),
 (107734,'B023B09W3C',30.314898,120.093508,'同址楼宇参考点'),
 (104919,'B0HRVL1H8U',30.147108,120.103467,'所在商场参考点'),
 (87018,'B0FFF0D1TQ',30.259902,120.202259,'所在商场参考点'),
 (109379,'B0JD5966SV',30.265975,120.201351,'同址商场参考点'),
 (112696,'B0HBKMNPIH',30.350712,120.215812,'所在商场参考点'),
 (114510,'B0JRFCSVRF',30.331171,120.277752,'所在商场参考点'),
 (116416,'B0L1YUE4R2',30.311588,120.203958,'所在园区参考点'),
 (2091,'B0G264JLS3',30.321425,120.294531,'同址C馆参考点'),
 (118489,'B0J3RATWIE',30.343394,120.210214,'所在商场参考点'),
 (119474,'B023B17WP5',30.327277,120.175887,'所在商场参考点'),
 (5663,'B0FFLIH5RG',30.196340,120.188915,'所在商场参考点'),
 (113471,'B0FFJ62XXT',30.223355,120.252724,'所在商场参考点'),
 (23140,'B0G0XR298W',30.144107,120.292264,'所在商场参考点'),
 (74662,'B0JG7C0299',30.303411,120.113080,'同栋门店附近参考点'),
 (59458,'B023B0BL6L',30.422213,120.259568,'同址家居市场参考点'),
 (118772,'B0FFHDSKP1',30.346803,120.283378,'所在商业园参考点'),
 (2094,'B0FFFO7BHE',30.318642,120.294467,'所在A馆参考点'),
]

def offset(lon, lat):
    x, y = lon - 105, lat - 35
    a = -100+2*x+3*y+.2*y*y+.1*x*y+.2*math.sqrt(abs(x))
    a += (20*math.sin(6*x*math.pi)+20*math.sin(2*x*math.pi))*2/3
    a += (20*math.sin(y*math.pi)+40*math.sin(y/3*math.pi))*2/3
    a += (160*math.sin(y/12*math.pi)+320*math.sin(y*math.pi/30))*2/3
    b = 300+x+2*y+.1*x*x+.1*x*y+.1*math.sqrt(abs(x))
    b += (20*math.sin(6*x*math.pi)+20*math.sin(2*x*math.pi))*2/3
    b += (20*math.sin(x*math.pi)+40*math.sin(x/3*math.pi))*2/3
    b += (150*math.sin(x/12*math.pi)+300*math.sin(x/30*math.pi))*2/3
    rad = lat/180*math.pi
    magic = 1-.00669342162296594323*math.sin(rad)**2
    return b*180/(6378245/math.sqrt(magic)*math.cos(rad)*math.pi), a*180/((6378245*(1-.00669342162296594323))/(magic*math.sqrt(magic))*math.pi)

def inverse(lon, lat):
    # Iterative approximate conversion, not a surveyed entrance coordinate.
    x, y = lon, lat
    for _ in range(8):
        dx, dy = offset(x, y)
        x -= x+dx-lon
        y -= y+dy-lat
    return round(x, 7), round(y, 7)

def build(raw):
    records = {r['id']: r for r in raw['data']['data']['list']}
    stores = []
    for i, (rid, poi, lat, lon, role) in enumerate(POINTS, 1):
        r = records[rid]
        x, y = inverse(lon, lat)
        stores.append(dict(id=f'HZ-FT{i:02}', official_store_id=rid, brand='方太',
            name=r['name'], address=r['address'], lon=x, lat=y, coordinate_system='WGS84',
            source_url=URL, map_point=dict(source_url='https://www.amap.com/place/'+poi,
                coordinate_system='GCJ02', lon=lon, lat=lat, role=role),
            coordinate_status='public_reference_point_approximate_conversion',
            business_status_verified=False, unloading_entrance_verified=False))
    depot=json.loads((ROOT/'data/hangzhou-road-demo.json').read_text(encoding="utf-8"))['depot']
    x,y=inverse(120.294735,30.319765)
    parking=dict(id='PARK',name='恒大国际建材停车场·假设终点',lon=x,lat=y,
        source_url='https://www.amap.com/place/B0FFFEBD48',truck_parking_verified=False)
    result=dict(schema_version=2,city='杭州',brand='方太',query_date='2026-10-11',
        source_api_url=URL,official_record_count_at_query=raw['data']['data']['total'],
        selection_count=20,routing_ready=True,stores=stores,depot=depot,parking=parking,
        coordinate_conversion='iterative_approximate_GCJ02_to_WGS84',
        selection_changes={'removed':[103830,86348,2103],'added':[2091,5663,74662],
            'reason':'替换未能可靠定位或地址有歧义的记录；名称与地址仍取自官方门店查询'},
        note='20家方太门店名称与地址来自官网公开查询。坐标采用门店或所在商场、楼宇的公开地图参考点，并由GCJ02近似转换为WGS84；当前营业状态、卸货入口、停车点货车许可均未核验。订单、包装、时间窗、车队和费用为模拟，不代表真实传化客户关系。')
    cache=ROOT/'data/fotile-road-cache.json'
    if cache.exists(): result['travel']=json.loads(cache.read_text(encoding="utf-8"))
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('raw_api_json');args=parser.parse_args()
    result=build(json.loads(Path(args.raw_api_json).read_text(encoding="utf-8")))
    (ROOT/'data/hangzhou-fotile-store-catalog.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n', encoding="utf-8")
    (ROOT/'frontend/v03/catalog.js').write_text('window.FOTILE_CATALOG='+json.dumps(result,ensure_ascii=False,separators=(',',':'))+';\n', encoding="utf-8")
    print('Built 20 public-source store reference points')

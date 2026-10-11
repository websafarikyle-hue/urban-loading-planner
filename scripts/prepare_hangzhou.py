"""Regenerate the public-location / simulated-order demo and cache road queries."""
import json,sys,copy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from roads import request_json,fetch_matrix,fetch_geometry,metadata
from algorithms.planner import solve,distance
from server import validate
def main():
    output=ROOT/'outputs';output.mkdir(exist_ok=True)
    def cached(name,url):
        p=output/name
        if p.exists():return json.loads(p.read_text(encoding="utf-8"))
        raw=request_json(url);p.write_text(json.dumps(raw,ensure_ascii=False), encoding="utf-8");return raw
    depot=cached('hangzhou-depot.json','https://www.openstreetmap.org/api/0.6/way/1152870422/full.json')
    nodes={p['id']:p for p in depot['elements'] if p['type']=='node'}
    way=next(p for p in depot['elements'] if p['type']=='way');boundary=[nodes[i] for i in set(way['nodes'])]
    if '传化' not in way.get('tags',{}).get('name',''):raise ValueError('仓库公开地点名称不符')
    raw=cached('hangzhou-city-pois.json','https://www.openstreetmap.org/api/0.6/map.json?bbox=120.14,30.25,120.18,30.28')
    choices=[p for p in raw['elements'] if p['type']=='node' and p.get('tags',{}).get('name') and (p['tags'].get('shop') in ('convenience','supermarket','department_store','mall') or p['tags'].get('amenity')=='pharmacy')]
    selected=[]
    for p in sorted(choices,key=lambda p:p['id']):
        if all(distance(p,q)>.45 for q in selected):selected.append(p)
        if len(selected)==10:break
    if len(selected)<10:raise ValueError('公开演示地点不足10个')
    data=json.loads((ROOT/'data/sample.json').read_text(encoding="utf-8"))
    data['depot'].update(name=way['tags']['name']+'·假设发货点',lon=sum(p['lon'] for p in boundary)/len(boundary),lat=sum(p['lat'] for p in boundary)/len(boundary),source_url='https://www.openstreetmap.org/way/1152870422')
    for i,(o,p) in enumerate(zip(data['orders'],selected)):
        o.update(name=p['tags']['name']+'·模拟收货',lon=p['lon'],lat=p['lat'],customer_id=f'SIM-C{i%3+1:02}',service_mode='estimate',source_url=f"https://www.openstreetmap.org/node/{p['id']}")
    data['provenance']['locations']='OSM公开地点；公路港边界均值作为假设发货点，未核验车辆入口；收货点非真实客户，未核验营业状态。'
    data['provenance']['location_query_date']=metadata()['query_date']
    data=validate(fetch_matrix(data));result=solve(data);geometries={}
    for route in result['routes']:geometries['>'.join(route['order_ids'])]=fetch_geometry(data,route['order_ids'])
    data['travel']['geometries']=geometries;validate(data)
    (ROOT/'data/hangzhou-road-demo.json').write_text(json.dumps(data,ensure_ascii=False,indent=2), encoding="utf-8")
    print(json.dumps({'orders':len(selected),'metrics':result['metrics'],'query_date':data['travel']['query_date']},ensure_ascii=False))
if __name__=='__main__':main()

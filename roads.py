"""Explicit public OSRM requests. Car routing is not a truck restriction guarantee."""
import copy,json,urllib.request,urllib.error
from datetime import datetime,timezone
BASE='https://router.project-osrm.org'
def request_json(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'UrbanFlowDemo/0.2'}),timeout=20) as response:return json.load(response)
    except (urllib.error.URLError,TimeoutError,OSError,ValueError) as e:raise ValueError('道路服务暂不可用；保留旧方案，可使用缓存样例') from e
def metadata():return {'provider':'OSRM / OpenStreetMap','query_date':datetime.now(timezone.utc).isoformat(),
    'profile':'driving (car)','coordinate_system':'WGS84','truck_restrictions_verified':False,
    'note':'普通驾车路线，非实时拥堵时间；未验证货车限行与装卸入口'}
def fetch_matrix(data):
    points=[data['depot'],*data['orders']];coords=';'.join(f"{p['lon']},{p['lat']}" for p in points)
    raw=request_json(BASE+'/table/v1/driving/'+coords+'?annotations=distance,duration')
    if raw.get('code')!='Ok':raise ValueError('无法生成道路矩阵')
    matrix={**metadata(),'points':[{k:p[k] for k in ('id','lon','lat')} for p in points],
        'distances':[[None if v is None else v/1000 for v in row] for row in raw['distances']],
        'durations':[[None if v is None else v/60 for v in row] for row in raw['durations']],
        'snapped_points':[{'location':p['location'],'distance_m':p['distance']} for p in raw.get('sources',[])]}
    result=copy.deepcopy(data);result['travel']=matrix;result['provenance']['travel']=matrix['note']+'；来源 OSRM / OpenStreetMap';return result
def fetch_geometry(data,order_ids):
    lookup={o['id']:o for o in data['orders']}
    if not isinstance(order_ids,list) or not order_ids or any(not isinstance(i,str) or i not in lookup for i in order_ids) or len(set(order_ids))!=len(order_ids):raise ValueError('路线订单 ID 无效')
    points=[data['depot'],*[lookup[i] for i in order_ids],data['depot']]
    coords=';'.join(f"{p['lon']},{p['lat']}" for p in points);raw=request_json(BASE+'/route/v1/driving/'+coords+'?overview=full&geometries=geojson')
    if raw.get('code')!='Ok' or not raw.get('routes'):raise ValueError('无法获取道路轨迹')
    return {**metadata(),'order_ids':order_ids,'geometry':raw['routes'][0]['geometry']}

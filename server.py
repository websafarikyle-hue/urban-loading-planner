from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse, json, sys, math, webbrowser, subprocess, shutil
from algorithms.planner import solve
from algorithms.service import DEFAULT_POLICY
from roads import fetch_matrix,fetch_geometry

ROOT=Path(__file__).resolve().parent
def validate(data):
    def obj(value,label):
        if not isinstance(value,dict):raise ValueError(label+"必须是对象")
        return value
    def required(value,field,label):
        if field not in value:raise ValueError(label+"缺少字段 "+field)
        return value[field]
    def text(value,label):
        if not isinstance(value,str) or not value.strip():raise ValueError(label+"必须是非空字符串")
        return value
    def number(value,label):
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value):
            raise ValueError(label+"必须为有限数字")
        return value
    def num(value,field,label):return number(required(value,field,label),label+"."+field)
    def point(value,label):
        obj(value,label)
        for field in ("id","name"):text(required(value,field,label),label+"."+field)
        if not -180<=num(value,"lon",label)<=180 or not -90<=num(value,"lat",label)<=90:
            raise ValueError(label+"坐标范围不正确")
    obj(data,"请求")
    for key in ("depot","orders","vehicles","provenance"):required(data,key,"请求")
    for key,limit in (("orders",30),("vehicles",10)):
        if not isinstance(data[key],list) or not 1<=len(data[key])<=limit:
            raise ValueError(key+f"必须是含 1～{limit} 项的数组")
    provenance=obj(data["provenance"],"provenance")
    if not provenance or any(not isinstance(v,str) or not v.strip() for v in provenance.values()):
        raise ValueError("provenance 必须含非空的数据来源说明字符串")
    start=number(data.get("start",480),"start")
    if not 0<=start<=1439:raise ValueError("发车时间必须在当日范围内")
    point(data["depot"],"depot")
    policy=obj(data.get('service_policy',{}),'service_policy')
    if any(k not in DEFAULT_POLICY for k in policy):raise ValueError('未知作业时间参数')
    for k,v in policy.items():
        if not 0<=number(v,k)<=1440:raise ValueError('作业时间参数超出范围')
    ids=set();boxids=set();boxcount=0
    for i,o in enumerate(data["orders"]):
        label=f"orders[{i}]";point(o,label)
        if o["id"] in ids:raise ValueError("订单 ID 重复")
        ids.add(o["id"])
        if o['id']==data['depot']['id']:raise ValueError('订单和仓库ID不能相同')
        if o.get('service_mode','estimate') not in ('estimate','manual'):raise ValueError('卸货时间模式无效')
        if 'customer_id' in o:text(o['customer_id'],'customer_id')
        ready,due,service=(num(o,k,label) for k in ("ready","due","service"))
        if not 0<=ready<=due<=1439 or not 0<=service<=1440:raise ValueError(label+"时间窗或服务时长不正确")
        boxes=required(o,"boxes",label)
        if not isinstance(boxes,list) or not boxes:raise ValueError(label+"必须含非空箱件数组")
        boxcount+=len(boxes)
        if boxcount>150:raise ValueError("Demo 最多支持 150 箱")
        for j,b in enumerate(boxes):
            blabel=label+f".boxes[{j}]";obj(b,blabel)
            bid=text(required(b,"id",blabel),blabel+".id")
            if bid in boxids:raise ValueError("箱件 ID 重复")
            boxids.add(bid)
            for flag in ("fragile","stackable","rotate"):
                if not isinstance(required(b,flag,blabel),bool):raise ValueError(blabel+"规则必须为布尔值")
            if num(b,"max_top_weight",blabel)<0:raise ValueError("承重限制不能小于零")
            for field in ("length","width","height","weight"):
                if not 0<num(b,field,blabel)<=10000:raise ValueError(blabel+"尺寸或重量不正确")
    vids=set()
    for i,v in enumerate(data["vehicles"]):
        label=f"vehicles[{i}]";obj(v,label)
        for field in ("id","name"):text(required(v,field,label),label+"."+field)
        if v["id"] in vids:raise ValueError("车辆 ID 重复")
        vids.add(v["id"])
        for field in ("length","width","height","capacity_kg"):
            if num(v,field,label)<=0:raise ValueError(label+"尺寸和载重必须大于零")
        if num(v,"fixed_cost",label)<0 or num(v,"cost_per_km",label)<0:raise ValueError("车辆费用不可为负")
        shift_end=number(v.get("shift_end",1080),label+".shift_end")
        if not start<=shift_end<=1440:raise ValueError(label+"班次结束须在发车时刻至当日结束之间")
    if 'travel' in data:
        t=obj(data['travel'],'travel');points=[data['depot'],*data['orders']]
        if required(t,'points','travel')!=[{k:p[k] for k in ('id','lon','lat')} for p in points]:raise ValueError('道路矩阵不匹配当前坐标或订单；请重新查询')
        n=len(points)
        for key in ('distances','durations'):
            rows=required(t,key,'travel')
            if not isinstance(rows,list) or len(rows)!=n:raise ValueError('道路矩阵维度无效')
            for i,row in enumerate(rows):
                if not isinstance(row,list) or len(row)!=n:raise ValueError('道路矩阵维度无效')
                for j,value in enumerate(row):
                    if value is not None and number(value,key)<0:raise ValueError('道路矩阵必须非负')
                    if i==j and value!=0:raise ValueError('道路矩阵对角线必须为0')
        for key in ('provider','query_date','profile','coordinate_system'):text(required(t,key,'travel'),key)
        if t['coordinate_system']!='WGS84' or not isinstance(t.get('truck_restrictions_verified'),bool):raise ValueError('道路矩阵元数据无效')
        geometries=obj(t.get('geometries',{}),'geometries')
        for key,g in geometries.items():
            obj(g,'geometry');seq=required(g,'order_ids','geometry')
            if not isinstance(seq,list) or not seq or any(not isinstance(i,str) or i not in ids for i in seq) or len(set(seq))!=len(seq) or key!='>'.join(seq):raise ValueError('道路轨迹订单无效')
            geo=obj(required(g,'geometry','geometry'),'GeoJSON');coords=required(geo,'coordinates','GeoJSON')
            if geo.get('type')!='LineString' or not isinstance(coords,list) or not 2<=len(coords)<=20000:raise ValueError('道路轨迹格式无效')
            for p in coords:
                if not isinstance(p,list) or len(p)!=2 or not -180<=number(p[0],'lon')<=180 or not -90<=number(p[1],'lat')<=90:raise ValueError('道路轨迹坐标无效')
    return data

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT/"frontend"),**kwargs)
    def respond(self,status,obj):
        raw=json.dumps(obj,ensure_ascii=False).encode()
        self.send_response(status);self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length",str(len(raw)));self.end_headers();self.wfile.write(raw)
    def do_GET(self):
        if self.path in ('/','/index.html'):
            self.send_response(302);self.send_header('Location','/v03/');self.end_headers()
        elif self.path=='/api/v03/catalog':
            self.respond(200,json.loads((ROOT/'data/hangzhou-fotile-store-catalog.json').read_text(encoding='utf8')))
        elif self.path=="/api/sample":
            self.respond(200,json.loads((ROOT/"data"/"sample.json").read_text(encoding="utf8")))
        elif self.path=='/api/road-sample':
            file=ROOT/'data'/'hangzhou-road-demo.json'
            self.respond(200,json.loads(file.read_text(encoding='utf8'))) if file.exists() else self.respond(404,{'error':'缓存道路样例尚未生成'})
        elif self.path=="/api/health":self.respond(200,{"status":"ok"})
        else:super().do_GET()
    def do_POST(self):
        if self.path not in ("/api/solve","/api/compare","/api/roads","/api/geometry","/api/v03/solve"):
            self.respond(404,{"error":"接口不存在"});return
        try:
            size=int(self.headers.get("Content-Length",0))
            if size<=0 or size>300000:raise ValueError("请求大小应在 1～300000 字节")
            payload=json.loads(self.rfile.read(size))
            if not isinstance(payload,dict):raise ValueError("请求必须为 JSON 对象")
            if self.path=='/api/v03/solve':
                node=shutil.which('node')
                if not node: self.respond(503,{'error':'此接口需要Node.js 18+；新版前端也可直接在浏览器计算。'});return
                try:
                    computed=subprocess.run([node,str(ROOT/'scripts/solve_v03.cjs')],input=json.dumps(payload),text=True,capture_output=True,timeout=45, encoding="utf-8")
                except subprocess.TimeoutExpired:
                    self.respond(408,{'error':'计算超过45秒，请减少订单或箱件后重试'});return
                response=json.loads(computed.stdout)
                self.respond(400 if 'error' in response else 200,response.get('result',response));return
            data=validate(payload.get("data",payload))
            if self.path=='/api/roads':result=validate(fetch_matrix(data))
            elif self.path=='/api/geometry':result=fetch_geometry(data,payload.get('order_ids'))
            elif self.path=="/api/compare":
                result={"baseline":solve(data,"baseline"),"optimized":solve(data,"optimized")}
            else:
                mode=payload.get("mode","optimized")
                if mode not in ("baseline","optimized","reference"):raise ValueError("模式无效")
                result=solve(data,mode)
            self.respond(200,result)
        except (ValueError,KeyError,TypeError) as e:self.respond(400,{"error":str(e)})
        except Exception as e:self.respond(500,{"error":"计算失败，请检查输入或查看服务端日志"});print(repr(e),file=sys.stderr)

if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--port",type=int,default=8765)
    parser.add_argument("--open",action="store_true")
    args=parser.parse_args()
    server=ThreadingHTTPServer(("127.0.0.1",args.port),Handler)
    print(f"Urban loading demo: http://127.0.0.1:{args.port}",flush=True)
    if args.open:webbrowser.open(f"http://127.0.0.1:{args.port}")
    server.serve_forever()

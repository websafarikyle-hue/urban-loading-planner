"""Deterministic routing + conservative 3D packing demo; no optimality guarantee."""
from math import radians, sin, cos, asin, sqrt, isfinite
import time
from .service import estimate_service
from .travel import travel_leg

EPS=1e-6
def overlap(a,b):
    return min(a[1],b[1])-max(a[0],b[0])>EPS

def intersects(a,b):
    return all(overlap((a[k],a[k]+a["d"+k]),(b[k],b[k]+b["d"+k])) for k in ("x","y","z"))

def distance(a,b):
    lon1,lat1,lon2,lat2=map(radians,[a["lon"],a["lat"],b["lon"],b["lat"]])
    h=sin((lat2-lat1)/2)**2+cos(lat1)*cos(lat2)*sin((lon2-lon1)/2)**2
    return 6371*2*asin(min(1,sqrt(h)))*1.28

def supported(box,placed):
    if box["z"]<EPS: return True
    for base in placed:
        if base["z"]<EPS and abs(base["z"]+base["dz"]-box["z"])<EPS and base["stackable"] and not base["fragile"]:
            if (base["x"]<=box["x"]+EPS and base["x"]+base["dx"]>=box["x"]+box["dx"]-EPS
                and base["y"]<=box["y"]+EPS and base["y"]+base["dy"]>=box["y"]+box["dy"]-EPS):
                upper_weight=box["weight"]+sum(p["weight"] for p in placed if p["id"]!=base["id"] and p["z"]>=base["z"]+base["dz"]-EPS
                        and p["x"]>=base["x"]-EPS and p["x"]+p["dx"]<=base["x"]+base["dx"]+EPS
                        and p["y"]>=base["y"]-EPS and p["y"]+p["dy"]<=base["y"]+base["dy"]+EPS)
                if box["stop"]<=base["stop"] and upper_weight<=base["max_top_weight"]:
                    return True
    return False

def extraction_blockers(box,remaining):
    blockers=[]
    for other in remaining:
        if other["id"]==box["id"]: continue
        front=(other["x"]<box["x"]-EPS
               and overlap((other["y"],other["y"]+other["dy"]),(box["y"],box["y"]+box["dy"]))
               and overlap((other["z"],other["z"]+other["dz"]),(box["z"],box["z"]+box["dz"])))
        above=(other["z"]>=box["z"]+box["dz"]-EPS
               and overlap((other["x"],other["x"]+other["dx"]),(box["x"],box["x"]+box["dx"]))
               and overlap((other["y"],other["y"]+other["dy"]),(box["y"],box["y"]+box["dy"])))
        if front or above: blockers.append(other)
    return blockers

def unload_plan(layout,route):
    remaining=list(layout); steps=[]
    for index,order in enumerate(route):
        sequence=[]
        while any(b["order_id"]==order["id"] for b in remaining):
            candidates=[b for b in remaining if b["order_id"]==order["id"] and not extraction_blockers(b,remaining)]
            if not candidates:
                return {"feasible":False,"reason":"卸货通道或上层货物受阻","steps":steps}
            box=sorted(candidates,key=lambda b:(-b["z"],b["x"],b["y"],b["id"]))[0]
            sequence.append({"box_id":box["id"],"position":[box["x"],box["y"],box["z"]],
                             "instruction":f'从车门方向取出 {box["id"]}（x={box["x"]:.0f}, y={box["y"]:.0f}, z={box["z"]:.0f} cm）'})
            remaining.remove(box)
        steps.append({"stop":index+1,"order_id":order["id"],"name":order["name"],"boxes":sequence})
    return {"feasible":True,"steps":steps,"rehandles":0}

def _pack_attempt(route,vehicle,strategy=0):
    if sum(b["weight"] for o in route for b in o["boxes"])>vehicle["capacity_kg"]+EPS:
        return {"feasible":False,"reason":"超过车辆载重","layout":[]}
    L,W,H=vehicle["length"],vehicle["width"],vehicle["height"]
    if sum(b["length"]*b["width"]*b["height"] for o in route for b in o["boxes"])>L*W*H+EPS:
        return {"feasible":False,"reason":"总箱件体积超过车厢","layout":[]}
    placed=[]; points={(L,0,0)}
    ranked=[]
    for stop,order in reversed(list(enumerate(route,1))):
        for box in sorted(order["boxes"],key=lambda b:(b["fragile"],not b["stackable"],-b["length"]*b["width"]*(b["height"] if strategy==0 else 1),-b["weight"],b["id"])):
            ranked.append((stop,order,box))
    for stop,order,box in ranked:
        if strategy:
            points.update((x,y,0) for x in {L,*[b['x'] for b in placed]} for y in {0,*[b['y']+b['dy'] for b in placed]})
        orientations=sorted({(box["length"],box["width"],box["height"]),
                             (box["width"],box["length"],box["height"])} if box.get("rotate",True) else {(box["length"],box["width"],box["height"])})
        options=[]
        for anchor,y,z in points:
            for dx,dy,dz in orientations:
                candidate=dict(box,order_id=order["id"],stop=stop,x=anchor-dx,y=y,z=z,dx=dx,dy=dy,dz=dz)
                if candidate["x"]<-EPS or y+dy>W+EPS or z+dz>H+EPS: continue
                if any(intersects(candidate,b) for b in placed): continue
                if not supported(candidate,placed): continue
                # No earlier-stop box may be hidden by a later-stop box.
                if any(b["stop"]>stop for b in extraction_blockers(candidate,placed)): continue
                # Newly placed box may not block an already placed earlier-stop box.
                if any(b["stop"]<stop and candidate in extraction_blockers(b,[candidate]) for b in placed): continue
                options.append(candidate)
        if not options:
            return {"feasible":False,"reason":f'箱件 {box["id"]} 未找到满足支撑与卸货规则的摆放位置（启发式失败，不代表数学不可行）',"layout":[]}
        chosen=min(options,key=lambda b:(b["z"],-b["x"],b["y"],b["dx"]*b["dy"],b["id"]))
        placed.append(chosen)
        x,y,z,dx,dy,dz=(chosen[k] for k in ("x","y","z","dx","dy","dz"))
        points.update({(x,y,z),(x+dx,y+dy,z),(x+dx,y,z+dz)})
    unloaded=unload_plan(placed,route)
    if not unloaded["feasible"]: return dict(unloaded,layout=[])
    return {"feasible":True,"layout":placed,"unloading":unloaded,"reason":None}

def pack(route,vehicle):
    result=_pack_attempt(route,vehicle)
    if not result['feasible'] and '启发式' in result.get('reason',''):
        result=_pack_attempt(route,vehicle,1)
    if result['feasible']:
        by_id={b['id']:b for b in result['layout']}
        sequence=[by_id[s['box_id']] for stop in reversed(result['unloading']['steps']) for s in reversed(stop['boxes'])]
        result['loading']=[{'step':i+1,'box_id':b['id'],'order_id':b['order_id'],
            'position':[b['x'],b['y'],b['z']],
            'instruction':f"装入 {b['id']} 到 ({b['x']:.0f}, {b['y']:.0f}, {b['z']:.0f}) cm，先就位支撑箱"} for i,b in enumerate(sequence)]
    return result

def validate_layout(layout,vehicle,route):
    errors=[]
    for b in layout:
        if any(isinstance(b.get(k),bool) or not isinstance(b.get(k),(int,float)) or not isfinite(b[k])
               for k in ("x","y","z","dx","dy","dz","weight")):
            return ["布局坐标、尺寸或重量必须为有限数字"]
        if any(b["d"+k]<=0 for k in ("x","y","z")):return ["布局尺寸必须大于零"]
    sources={b["id"]:(b,o["id"],stop) for stop,o in enumerate(route,1) for b in o["boxes"]}
    expected=set(sources)
    actual=[b["id"] for b in layout]
    if set(actual)!=expected or len(actual)!=len(set(actual)): errors.append("箱件缺失或重复")
    if sum(b["weight"] for b in layout)>vehicle["capacity_kg"]+EPS: errors.append("超载")
    for i,b in enumerate(layout):
        if b["id"] in sources:
            source,order_id,stop=sources[b["id"]]
            orientations={(source["length"],source["width"],source["height"])}
            if source["rotate"]:orientations.add((source["width"],source["length"],source["height"]))
            if tuple(b["d"+k] for k in ("x","y","z")) not in orientations:
                errors.append("箱件尺寸或旋转规则与原始输入不符")
            if any(b.get(k)!=source[k] for k in ("length","width","height","weight","fragile","stackable","rotate","max_top_weight")):
                errors.append("箱件属性与原始输入不符")
            if b.get("order_id")!=order_id or b.get("stop")!=stop:
                errors.append("箱件所属订单或站序不符")
        if any(b[k]<-EPS or b[k]+b["d"+k]>vehicle[dimension]+EPS for k,dimension in [("x","length"),("y","width"),("z","height")]):
            errors.append("箱件越界")
        if not supported(b,[a for a in layout if a["id"]!=b["id"]]): errors.append("支撑、堆叠或承重规则违反")
        if any(intersects(b,a) for a in layout[i+1:]): errors.append("箱件重叠")
    if not unload_plan(layout,route)["feasible"]: errors.append("无法逐站卸货")
    return sorted(set(errors))

def schedule(route,vehicle,depot,start,matrix=None,service_policy=None):
    now=start; last=depot; km=0; stops=[]; late=0
    for order in route:
        journey=travel_leg(last,order,matrix)
        if journey is None:return {'feasible':False,'reason':'道路矩阵包含不可达路段','cost':0}
        leg,travel=journey;service=estimate_service(order,service_policy)
        arrival=now+travel; service_start=max(arrival,order["ready"])
        service_end=service_start+service['minutes']
        late+=int(service_end>order["due"]+EPS)
        stops.append({"order_id":order["id"],"name":order["name"],"arrival":round(arrival,1),
                      "service_start":round(service_start,1),"service_end":round(service_end,1),
                      "service_estimate":service,"customer_id":order.get('customer_id','未指定货主'),
                      "wait":round(max(0,order["ready"]-arrival),1),
                      "late":service_end>order["due"]+EPS,"leg_km":round(leg,2),"travel_minutes":round(travel,1),
                      "lon":order["lon"],"lat":order["lat"],"ready":order["ready"],"due":order["due"]})
        now=service_end; km+=leg;last=order
    if route:
        journey=travel_leg(last,depot,matrix)
        if journey is None:return {'feasible':False,'reason':'返仓道路不可达','cost':0}
        km+=journey[0];now+=journey[1]
    return {"stops":stops,"km":km,"end":now,"late":late,
            "cost":vehicle["fixed_cost"]+km*vehicle["cost_per_km"] if route else 0,
            "feasible":late==0 and now<=vehicle.get("shift_end",1080)+EPS,
            "reason":"完成卸货超时或返仓超过班次" if late or now>vehicle.get('shift_end',1080)+EPS else None}

def solve(data,mode="optimized"):
    started=time.perf_counter();orders=data["orders"];vehicles=data["vehicles"];depot=data["depot"];start=data.get("start",480)
    if len(orders)>30 or sum(len(o["boxes"]) for o in orders)>150: raise ValueError("Demo 上限：30 个订单、150 件箱货")
    from .dispatch import dispatch
    cache={};timings={};checks=0;rejects=0
    def route_timing(i,route):
        key=(i,tuple(o['id'] for o in route))
        if key not in timings:timings[key]=schedule(route,vehicles[i],depot,start,data.get('travel'),data.get('service_policy'))
        return timings[key]
    def evaluate(i,route):
        nonlocal checks,rejects
        timing=route_timing(i,route)
        if not timing['feasible']:return None,timing.get('reason','时间窗或班次不满足')
        key=(i,tuple(o['id'] for o in route))
        if key not in cache:
            checks+=1;cache[key]=pack(route,vehicles[i])
            if not cache[key]['feasible']:rejects+=1
        packing=cache[key]
        if not packing['feasible']:return None,packing['reason']
        return (timing,packing),None
    if mode=='reference':
        from .reference import enumerate_routes
        routes,search_info=enumerate_routes(orders,vehicles,evaluate)
    else:routes,search_info=dispatch(orders,vehicles,evaluate,route_timing,mode)
    used={o['id'] for route in routes for o in route};unassigned=[]
    for order in orders:
        if order['id'] in used:continue
        reasons=[]
        for i,route in enumerate(routes):
            for pos in range(len(route)+1):
                _,reason=evaluate(i,route[:pos]+[order]+route[pos:])
                if reason:reasons.append(reason)
        unassigned.append({'order_id':order['id'],'name':order['name'],'reasons':sorted(set(reasons)) or ['有限搜索未分配，不代表数学不可行']})
    output=[]
    for i,route in enumerate(routes):
        if not route:continue
        result,_=evaluate(i,route);timing,packing=result
        errors=validate_layout(packing["layout"],vehicles[i],route)
        from .verify import verify
        errors+=verify(packing["layout"],vehicles[i],route,packing["loading"])
        if errors:raise RuntimeError("装载校验失败："+",".join(errors))
        mass=sum(b["weight"] for o in route for b in o["boxes"])
        vol=sum(b["length"]*b["width"]*b["height"] for o in route for b in o["boxes"])
        output.append({"vehicle":vehicles[i],"order_ids":[o["id"] for o in route],"stops":timing["stops"],
                       "km":round(timing["km"],2),"cost":round(timing["cost"],2),"end":round(timing["end"],1),
                       "weight_kg":mass,"weight_utilization":round(mass/vehicles[i]["capacity_kg"],4),
                       "volume_utilization":round(vol/(vehicles[i]["length"]*vehicles[i]["width"]*vehicles[i]["height"]),4),
                       "packing":packing,"validation_errors":errors})
    assigned=sum(len(r["order_ids"]) for r in output)
    total_volume=sum(sum(b["dx"]*b["dy"]*b["dz"] for b in r["packing"]["layout"]) for r in output)
    total_capacity=sum(r["vehicle"]["length"]*r["vehicle"]["width"]*r["vehicle"]["height"] for r in output)
    return {"mode":mode,"routes":output,"unassigned":unassigned,
            "metrics":{"vehicles":len(output),"km":round(sum(r["km"] for r in output),2),
                       "cost":round(sum(r["cost"] for r in output),2),"assigned":assigned,"orders":len(orders),
                       "on_time_rate":round(assigned/len(orders),4) if orders else 1,
                       "volume_utilization":round(total_volume/total_capacity,4) if total_capacity else 0,
                       "rehandles":0},
            "diagnostics":{"packing_checks":checks,"packing_rejections":rejects,**search_info,
                           "duration_ms":round((time.perf_counter()-started)*1000,1),"exact":False,
                           "method":"服务优先＋运力修复＋可行路线池＋角点装载"},
            "data_note":data["provenance"]}

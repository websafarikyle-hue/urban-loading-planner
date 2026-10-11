"""Independent replay of geometry, support, loading and stop-by-stop unloading."""
from math import isfinite
EPS=1e-6
def verify(layout,vehicle,route,loading):
    errors=[];source={b['id']:(b,o,i) for i,o in enumerate(route,1) for b in o['boxes']}
    if len(layout)!=len(source) or {b['id'] for b in layout}!=set(source):errors.append('箱件数量或身份不一致')
    if sum(b['weight'] for b in layout)>vehicle['capacity_kg']+EPS:errors.append('总载重超限')
    def overlap(a,b,k):return a[k]<b[k]+b['d'+k]-EPS and b[k]<a[k]+a['d'+k]-EPS
    def supported(b,others):
        if abs(b['z'])<=EPS:return True
        for base in others:
            if abs(base['z'])>EPS or base['fragile'] or not base['stackable'] or abs(base['dz']-b['z'])>EPS:continue
            if any(b[k]<base[k]-EPS or b[k]+b['d'+k]>base[k]+base['d'+k]+EPS for k in ('x','y')):continue
            mass=sum(a['weight'] for a in others+[b] if a['id']!=base['id'] and a['z']>=base['dz']-EPS and all(overlap(a,base,k) for k in ('x','y')))
            if mass<=base['max_top_weight']+EPS and b['stop']<=base['stop']:return True
        return False
    def blocks(a,b):
        return (a['x']<b['x']-EPS and overlap(a,b,'y') and overlap(a,b,'z')) or (a['z']>=b['z']+b['dz']-EPS and overlap(a,b,'x') and overlap(a,b,'y'))
    for i,b in enumerate(layout):
        if any(not isfinite(b[k]) for k in ('x','y','z','dx','dy','dz')):errors.append('非有限坐标');continue
        original,order,stop=source.get(b['id'],(None,None,None))
        if original is None:errors.append('未知箱件');continue
        if any(b[k]!=original[k] for k in ('length','width','height','weight','fragile','stackable','rotate','max_top_weight')):errors.append('原始属性不一致')
        allowed={(original['length'],original['width'],original['height'])}
        if original['rotate']:allowed.add((original['width'],original['length'],original['height']))
        if (b['dx'],b['dy'],b['dz']) not in allowed:errors.append('尺寸或旋转不符合输入')
        if b['order_id']!=order['id'] or b['stop']!=stop:errors.append('订单或站序不一致')
        if any(b[k]<-EPS or b[k]+b['d'+k]>vehicle[d]+EPS for k,d in (('x','length'),('y','width'),('z','height'))):errors.append('超出车厢')
        if not supported(b,[a for a in layout if a['id']!=b['id']]):errors.append('支撑或承重违规')
        if any(all(overlap(a,b,k) for k in ('x','y','z')) for a in layout[i+1:]):errors.append('空间重叠')
    by_id={b['id']:b for b in layout};placed=[]
    if len(loading)!=len(layout) or {s['box_id'] for s in loading}!=set(by_id):errors.append('装车步骤不完整')
    else:
        for step in loading:
            b=by_id[step['box_id']]
            if not supported(b,placed):errors.append('装车时支撑未就位')
            if any(blocks(a,b) for a in placed):errors.append('装车路径受阻')
            placed.append(b)
    remaining=list(layout)
    for order in route:
        while any(b['order_id']==order['id'] for b in remaining):
            available=[b for b in remaining if b['order_id']==order['id'] and not any(blocks(a,b) for a in remaining if a['id']!=b['id'])]
            if not available:errors.append('逐站卸货受阻');break
            remaining.remove(sorted(available,key=lambda b:(-b['z'],b['x'],b['id']))[0])
    if remaining:errors.append('卸货后仍有箱件')
    return sorted(set(errors))

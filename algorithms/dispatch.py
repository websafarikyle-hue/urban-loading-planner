"""Service-first construction, vehicle repair, local search and route-pool selection."""
from .route_pool import select_routes
EPS=1e-6
def dispatch(orders,vehicles,evaluate,timing,mode='optimized'):
    columns={};index={o['id']:i for i,o in enumerate(orders)};improvements=0
    def check(i,route):
        result,reason=evaluate(i,route)
        if result and route:
            mask=sum(1<<index[o['id']] for o in route);key=(i,mask);cost=result[0]['cost']
            if key not in columns or cost<columns[key][0]-EPS:columns[key]=(cost,list(route))
        return result,reason
    def score(routes):return (-sum(map(len,routes)),sum(timing(i,r)['cost'] for i,r in enumerate(routes)))
    def insert(routes,order,baseline=False):
        options=[]
        for i,r in enumerate(routes):
            old=timing(i,r)['cost']
            for p in ([len(r)] if baseline else range(len(r)+1)):
                trial=r[:p]+[order]+r[p:];result,_=check(i,trial)
                if result:
                    options.append((result[0]['cost']-old,i,p,trial))
                    if baseline:break
            if baseline and options:break
        if not options:return False
        _,i,_,trial=options[0] if baseline else min(options,key=lambda x:x[:3]);routes[i]=trial;return True
    def construct(sequence,baseline=False):
        routes=[[] for _ in vehicles]
        for o in sequence:insert(routes,o,baseline)
        return routes
    baseline=construct(orders,True)
    if mode=='baseline':return baseline,{'local_search_improvements':0,'objective':'按输入顺序逐车追加'}
    compatibility={o['id']:sum(check(i,[o])[0] is not None for i in range(len(vehicles))) for o in orders}
    seeds=[baseline,construct(sorted(orders,key=lambda o:(o['due'],o['ready'],o['id']))),
           construct(sorted(orders,key=lambda o:(compatibility[o['id']],o['due'],o['id'])))]
    def repair(routes):
        nonlocal improvements
        used={o['id'] for r in routes for o in r};budget=800
        for order in orders:
            if order['id'] in used:continue
            if insert(routes,order):used.add(order['id']);improvements+=1;continue
            best=None
            for a,source in enumerate(routes):
                for pos,moved in enumerate(source):
                    ra=source[:pos]+source[pos+1:]
                    for q in range(len(ra)+1):
                        triala=ra[:q]+[order]+ra[q:];resa,_=check(a,triala)
                        if not resa:continue
                        for b,destination in enumerate(routes):
                            if a==b:continue
                            for p in range(len(destination)+1):
                                if budget<=0:break
                                budget-=1;trialb=destination[:p]+[moved]+destination[p:];resb,_=check(b,trialb)
                                if resb:
                                    delta=resa[0]['cost']+resb[0]['cost']-timing(a,source)['cost']-timing(b,destination)['cost']
                                    if best is None or delta<best[0]-EPS:best=(delta,a,b,triala,trialb)
            if best:
                _,a,b,ra,rb=best;routes[a],routes[b]=ra,rb;used.add(order['id']);improvements+=1
        return routes
    def improve(routes):
        nonlocal improvements
        for _ in range(2):
            for i,r in enumerate(routes):
                old=timing(i,r)['cost'];accepted=False
                for p in range(len(r)-1):
                    for q in range(p+2,len(r)+1):
                        trial=r[:p]+list(reversed(r[p:q]))+r[q:];result,_=check(i,trial)
                        if result and result[0]['cost']<old-EPS:routes[i]=trial;improvements+=1;accepted=True;break
                    if accepted:break
        for _ in range(3):
            changed=False
            for a in range(len(routes)):
                if changed:break
                for p,order in enumerate(routes[a]):
                    if changed:break
                    ra=routes[a][:p]+routes[a][p+1:];resa,_=check(a,ra)
                    if not resa:continue
                    for b in range(len(routes)):
                        if a==b:continue
                        old=timing(a,routes[a])['cost']+timing(b,routes[b])['cost']
                        for q in range(len(routes[b])+1):
                            rb=routes[b][:q]+[order]+routes[b][q:];resb,_=check(b,rb)
                            if resb and resa[0]['cost']+resb[0]['cost']<old-EPS:
                                routes[a],routes[b]=ra,rb;improvements+=1;changed=True;break
                        if changed:break
            if not changed:break
        return routes
    candidates=[baseline]+[improve(repair([list(r) for r in seed])) for seed in seeds]
    pool,info=select_routes(columns,len(vehicles),len(orders),4096 if len(orders)<=16 else 512)
    candidates.append(pool);best=min(candidates,key=score)
    return best,{**info,'local_search_improvements':improvements,'baseline_protected':score(best)<=score(baseline),
                 'objective':'最大化按时完成订单数，其次最小化成本'}

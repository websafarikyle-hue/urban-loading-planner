"""Full small route permutation enumeration, with a shared heuristic packing oracle."""
from itertools import permutations
from .route_pool import select_routes
def enumerate_routes(orders,vehicles,evaluate):
    if len(orders)>5 or len(vehicles)>3 or sum(len(o['boxes']) for o in orders)>20:
        raise ValueError('小规模路线对照上限：5 单 / 20 箱 / 3 车')
    index={o['id']:i for i,o in enumerate(orders)};columns={};count=0
    for length in range(1,len(orders)+1):
        for route in permutations(orders,length):
            mask=sum(1<<index[o['id']] for o in route)
            for v in range(len(vehicles)):
                result,_=evaluate(v,list(route));count+=1
                if result:
                    key=(v,mask);cost=result[0]['cost']
                    if key not in columns or cost<columns[key][0]-1e-6:columns[key]=(cost,list(route))
    routes,info=select_routes(columns,len(vehicles),len(orders),1<<len(orders))
    return routes,{**info,'enumerated_routes':count,'routing_enumeration_complete':True,'packing_exact':False,
                   'local_search_improvements':0,'objective':'最大化按时完成订单数，其次最小化成本'}

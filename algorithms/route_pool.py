"""Vehicle-indexed disjoint route selection; exact only inside the discovered pool."""
def select_routes(columns,vehicle_count,order_count,state_limit=4096):
    states={0:(0,[[] for _ in range(vehicle_count)])};pruned=False;peak=1
    for vehicle in range(vehicle_count):
        next_states=dict(states)
        for used,(cost,routes) in states.items():
            for (v,mask),(price,route) in columns.items():
                if v!=vehicle or used&mask:continue
                key=used|mask;value=cost+price
                if key not in next_states or value<next_states[key][0]-1e-6:
                    updated=list(routes);updated[vehicle]=route;next_states[key]=(value,updated)
        peak=max(peak,len(next_states))
        if len(next_states)>state_limit:
            pruned=True;next_states=dict(sorted(next_states.items(),key=lambda x:(-x[0].bit_count(),x[1][0],x[0]))[:state_limit])
        states=next_states
    best=min(states,key=lambda mask:(-mask.bit_count(),states[mask][0],mask))
    return states[best][1],{'route_pool_columns':len(columns),'pool_states_peak':peak,'pool_selection_exact':not pruned,
        'pool_scope':'仅在发现的可行路线池内选择；状态截断可能遗漏更优组合，无联合全局最优证明'}

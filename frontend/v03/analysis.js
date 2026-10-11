/* Derive explanatory charts from the confirmed solver outputs. */
(function(root){
'use strict';
const sum=(xs,key)=>xs.reduce((n,x)=>n+key(x),0),round=n=>Math.round(n*100)/100;
function summarize(plan,data){
 const routes=plan.routes,ids=routes.flatMap(r=>r.order_ids).sort();
 const time=Object.fromEntries(['loading','driving','waiting','unloading'].map(k=>[k,sum(routes,r=>r.time_parts[k])]));
 const cost=Object.fromEntries(['fixed','distance','labor'].map(k=>[k,sum(routes,r=>r.cost_parts[k])]));
 const slack=routes.flatMap(r=>r.stops.map(s=>({order_id:s.id,name:s.name,minutes:s.due-s.service_end,completion:s.service_end,due:s.due})));
 const loads=routes.map(r=>{const boxes=r.packing.layout,volume=sum(boxes,b=>b.dx*b.dy*b.dz),weight=sum(boxes,b=>b.weight);return {id:r.vehicle.id,name:r.vehicle.name,stops:r.stops.length,boxes:boxes.length,stacked:boxes.filter(b=>b.z>0).length,volume,weight,volume_ratio:volume/(r.vehicle.length*r.vehicle.width*r.vehicle.height),weight_ratio:weight/r.vehicle.capacity_kg};});
 return {ids,assigned:ids.length,orders:data.orders.length,vehicles:routes.length,km:sum(routes,r=>r.km),work:sum(Object.values(time),n=>n),cost:sum(Object.values(cost),n=>n),elapsed:routes.length?Math.max(...routes.map(r=>r.end))-data.start:0,time,cost_parts:cost,loads,slack:slack.sort((a,b)=>a.minutes-b.minutes),boxes:sum(loads,l=>l.boxes)};
}
function difference(reference,optimized){
 const sameWorkload=JSON.stringify(reference.ids)===JSON.stringify(optimized.ids);
 const savings=Object.fromEntries(['work','cost','elapsed','km','vehicles'].map(k=>[k,reference[k]-optimized[k]]));
 const percentages=Object.fromEntries(['work','cost','elapsed','km'].map(k=>[k,sameWorkload&&reference[k]>0?100*savings[k]/reference[k]:null]));
 const time=Object.fromEntries(Object.keys(reference.time).map(k=>[k,reference.time[k]-optimized.time[k]]));
 const cost=Object.fromEntries(Object.keys(reference.cost_parts).map(k=>[k,reference.cost_parts[k]-optimized.cost_parts[k]]));
 return {same_workload:sameWorkload,service_change:optimized.assigned-reference.assigned,savings,percentages,time,cost};
}
function timeline(plan,data){return plan.routes.map(r=>{
 let events=[],now=data.start;
 const add=(type,start,end,label,stop=null)=>{if(end-start>1e-8)events.push({type,start,end,minutes:end-start,label,stop});};
 add('loading',now,now+r.time_parts.loading,'仓库装车');now+=r.time_parts.loading;
 for(const [i,s] of r.stops.entries()){
  add('driving',now,s.arrival,'前往第'+(i+1)+'站 · '+s.name,i+1);
  add('waiting',s.arrival,s.service_start,'第'+(i+1)+'站等待收货 · '+s.name,i+1);
  add('unloading',s.service_start,s.service_end,'第'+(i+1)+'站卸货 · '+s.name,i+1);now=s.service_end;
 }
 add('driving',now,r.end,'前往任务终点 · '+r.endpoint.name);
 return {vehicle_id:r.vehicle.id,start:data.start,end:r.end,minutes:r.work_minutes,events};
});}
const api={summarize,difference,timeline,round};if(typeof module==='object'&&module.exports)module.exports=api;else root.UrbanAnalysis=api;
})(typeof self!=='undefined'?self:globalThis);

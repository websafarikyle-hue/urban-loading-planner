/* Shared browser/Node solver. Paper-inspired heuristics; no global optimality claim. */
(function(root){
"use strict";
const EPS=1e-6,copy=x=>JSON.parse(JSON.stringify(x)),sum=(a,f=x=>x)=>a.reduce((s,x)=>s+f(x),0),round=x=>Math.round(x*100)/100;
const defaults={endpoint:"return",unload:"direct",max_vehicles:3,objective:"time",max_rehandles:2,
  loading_setup:10,loading_per_box:1,setup_minutes:3,per_box_minutes:1,fragile_extra_minutes:.5,
  heavy_extra_minutes:.5,heavy_threshold_kg:30,move_out_minutes:1,move_in_minutes:1,speed_kmh:28};
const skus=[
 {code:'HOOD',sku:'模拟烟机箱',length:80,width:60,height:55,weight:22,fragile:true,stackable:false,rotate:true,max_top_weight:0},
 {code:'HOB',sku:'模拟灶具箱',length:80,width:50,height:25,weight:15,fragile:true,stackable:false,rotate:true,max_top_weight:0},
 {code:'DISH',sku:'模拟洗碗机箱',length:65,width:65,height:90,weight:48,fragile:false,stackable:true,rotate:true,max_top_weight:25},
 {code:'PIPE',sku:'模拟烟管配件箱',length:60,width:40,height:35,weight:12,fragile:false,stackable:true,rotate:true,max_top_weight:25},
 {code:'KIT',sku:'模拟安装辅料箱',length:40,width:30,height:25,weight:8,fragile:false,stackable:true,rotate:true,max_top_weight:16}
];
const vehicleRates=[{fixed_cost:160,cost_per_km:1.2,labor_per_hour:30},{fixed_cost:220,cost_per_km:1.6,labor_per_hour:35},{fixed_cost:300,cost_per_km:2.1,labor_per_hour:40}];
function assert(ok,message){if(!ok)throw Error(message);}
function number(n,label,min=0,max=100000){assert(typeof n==="number"&&Number.isFinite(n)&&n>=min&&n<=max,label+"超出范围或不是有效数字");}
function validate(d){
 assert(d&&typeof d==="object","场景格式无效");assert(Array.isArray(d.orders)&&d.orders.length>=1&&d.orders.length<=30,"订单需为1～30单");
 assert(Array.isArray(d.vehicles)&&d.vehicles.length>=1&&d.vehicles.length<=10,"车辆需为1～10辆");
 const c={...defaults,...d.config};assert(["return","open","parking"].includes(c.endpoint),"车辆终点无效");
 assert(["direct","limited"].includes(c.unload),"卸货规则无效");assert(["time","cost"].includes(c.objective),"优化目标无效");
 const point=(p,label)=>{assert(p&&typeof p.id==="string"&&p.id&&typeof p.name==="string"&&p.name,label+"缺少名称或编号");number(p.lon,label+"经度",-180,180);number(p.lat,label+"纬度",-85,85);};
 point(d.depot,"仓库");if(c.endpoint==="parking"){point(d.end_point,"停车点");assert(d.end_point.id!==d.depot.id,"停车点编号不能与仓库相同");}
 number(d.start,"发车时刻",0,1439);const ids=new Set([d.depot.id]),bids=new Set(),vids=new Set();
 for(const o of d.orders){point(o,"门店");assert(!ids.has(o.id),"订单编号重复");ids.add(o.id);number(o.ready,"最早收货",0,1439);number(o.due,"完成截止",o.ready,1439);
  assert(Array.isArray(o.boxes)&&o.boxes.length>0,"订单必须包含箱件");
  for(const b of o.boxes){assert(typeof b.id==="string"&&b.id&&!bids.has(b.id),"箱件编号缺失或重复");bids.add(b.id);
   for(const k of ["length","width","height","weight"])number(b[k],"箱件"+k,.01,10000);
   for(const k of ["fragile","stackable","rotate"])assert(typeof b[k]==="boolean","箱件规则必须为布尔值");number(b.max_top_weight,"上层承重");}
 }
 assert(bids.size<=150,"最多150箱");
 for(const v of d.vehicles){assert(typeof v.id==="string"&&v.id&&!vids.has(v.id),"车辆编号缺失或重复");vids.add(v.id);
  for(const k of ["length","width","height","capacity_kg"])number(v[k],"车辆"+k,.01,10000);
  for(const k of ["fixed_cost","cost_per_km","labor_per_hour"])number(v[k],"费用"+k);
  number(v.shift_end,"班次截止",d.start,1440);assert(typeof v.enabled==="boolean","车辆可用状态无效");}
 const enabled=d.vehicles.filter(v=>v.enabled).length;assert(enabled>0,"至少需要一辆可用车");
 number(c.max_vehicles,"最大出车数",1,enabled);assert(Number.isInteger(c.max_vehicles),"最大出车数应为整数");
 number(c.max_rehandles,"每站搬移上限",0,5);assert(Number.isInteger(c.max_rehandles),"搬移上限应为整数");
 for(const k of ["loading_setup","loading_per_box","setup_minutes","per_box_minutes","fragile_extra_minutes","heavy_extra_minutes","move_out_minutes","move_in_minutes"])number(c[k],k,0,120);
 number(c.heavy_threshold_kg,"重货阈值",0,1000);number(c.speed_kmh,"估算时速",5,100);
 if(d.travel){const t=d.travel;assert(Array.isArray(t.points),"道路缓存缺少坐标绑定");
  const n=t.points.length;assert(n>=2&&n<=42,"道路缓存点数量无效");assert(t.coordinate_system==="WGS84"&&typeof t.provider==="string"&&typeof t.query_date==="string","道路元数据无效");
  for(const p of t.points){assert(typeof p.id==="string"&&p.id,"道路点编号无效");number(p.lon,"道路点经度",-180,180);number(p.lat,"道路点纬度",-85,85);}
  assert(new Set(t.points.map(p=>p.id)).size===n,"道路点编号重复");
  for(const p of [d.depot,...d.orders,...(c.endpoint==="parking"?[d.end_point]:[])]){const q=t.points.find(q=>q.id===(p.store_id||p.id));assert(q&&Math.abs(q.lon-p.lon)<EPS&&Math.abs(q.lat-p.lat)<EPS,"道路缓存与地点不匹配，请重新查询");}
  for(const key of ["distances","durations"]){assert(Array.isArray(t[key])&&t[key].length===n,"道路矩阵维度无效");t[key].forEach((r,i)=>{assert(Array.isArray(r)&&r.length===n,"道路矩阵维度无效");r.forEach((x,j)=>{if(x!==null)number(x,"道路矩阵");if(i===j)assert(x===0,"道路对角线应为0");});});}}
 return c;
}
const overlap=(a,b)=>Math.min(a[1],b[1])-Math.max(a[0],b[0])>EPS;
const intersects=(a,b)=>["x","y","z"].every(k=>overlap([a[k],a[k]+a["d"+k]],[b[k],b[k]+b["d"+k]]));
function support(b,placed){
 if(b.z<EPS)return true;
 return placed.some(a=>a.id!==b.id&&a.z<EPS&&a.stackable&&!a.fragile&&Math.abs(a.z+a.dz-b.z)<EPS&&
  a.x<=b.x+EPS&&a.x+a.dx>=b.x+b.dx-EPS&&a.y<=b.y+EPS&&a.y+a.dy>=b.y+b.dy-EPS&&
  sum(placed.filter(q=>q.id!==a.id&&q.z>=a.z+a.dz-EPS&&q.x>=a.x-EPS&&q.x+q.dx<=a.x+a.dx+EPS&&q.y>=a.y-EPS&&q.y+q.dy<=a.y+a.dy+EPS),q=>q.weight)+(!placed.some(q=>q.id===b.id)?b.weight:0)<=a.max_top_weight+EPS);
}
function blockers(b,placed){return placed.filter(a=>a.id!==b.id&&(
 (a.x<b.x-EPS&&overlap([a.y,a.y+a.dy],[b.y,b.y+b.dy])&&overlap([a.z,a.z+a.dz],[b.z,b.z+b.dz]))||
 (a.z>=b.z+b.dz-EPS&&overlap([a.x,a.x+a.dx],[b.x,b.x+b.dx])&&overlap([a.y,a.y+a.dy],[b.y,b.y+b.dy]))));}
function restoreBox(b,placed,v){
 const xs=[b.x,0,...placed.flatMap(a=>[a.x+a.dx,a.x-b.dx])],ys=[b.y,0,...placed.flatMap(a=>[a.y+a.dy,a.y-b.dy])];
 const options=[{...b},...xs.flatMap(x=>ys.map(y=>({...b,x,y,z:0})))];
 return options.find(p=>p.x>=-EPS&&p.y>=-EPS&&p.z>=-EPS&&p.x+p.dx<=v.length+EPS&&p.y+p.dy<=v.width+EPS&&p.z+p.dz<=v.height+EPS&&!placed.some(a=>intersects(a,p))&&support(p,placed)&&!blockers(p,placed).length);
}
function unloadPlan(layout,route,v,c){
 let remaining=copy(layout),steps=[],rehandles=0;
 for(let index=0;index<route.length;index++){
  const order=route[index],before=copy(remaining),operations=[],temporary=[],boxes=[];
  while(remaining.some(b=>b.order_id===order.id)){
   const available=remaining.filter(b=>!blockers(b,remaining).length).sort((a,b)=>b.z-a.z||a.x-b.x||a.y-b.y||a.id.localeCompare(b.id));
   let b=available.find(b=>b.order_id===order.id),type="unload";
   if(!b){
    if(c.unload!=="limited"||temporary.length>=c.max_rehandles)return {feasible:false,reason:"本站取货受阻或临时搬移超过上限"};
    const needed=new Set();const collect=b=>{for(const a of blockers(b,remaining))if(!needed.has(a.id)){needed.add(a.id);collect(a);}};
    remaining.filter(b=>b.order_id===order.id).forEach(collect);
    b=available.find(b=>needed.has(b.id)&&b.order_id!==order.id);type="move_out";
    if(!b)return {feasible:false,reason:"未找到可执行的临时搬移顺序"};
   }
   const position=[b.x,b.y,b.z];operations.push({type,box_id:b.id,position,minutes:type==="move_out"?c.move_out_minutes:0});
   if(type==="move_out")temporary.push(copy(b));else boxes.push({box_id:b.id,position});
   remaining=remaining.filter(a=>a.id!==b.id);
   if(remaining.some(a=>!support(a,remaining)))return {feasible:false,reason:"取货后剩余箱件失去完整支撑"};
  }
  for(const b of temporary.reverse()){
   const placed=restoreBox(b,remaining,v);if(!placed)return {feasible:false,reason:"临时搬出的货物无法稳定恢复到车厢"};
   operations.push({type:"move_in",box_id:b.id,position:[placed.x,placed.y,placed.z],minutes:c.move_in_minutes});remaining.push(placed);
  }
  rehandles+=temporary.length;
  steps.push({stop:index+1,order_id:order.id,name:order.name,boxes,operations,before_layout:before,after_layout:copy(remaining),rehandles:temporary.length});
 }
 return {feasible:true,steps,rehandles};
}
function packAttempt(route,v,c,strategy=0){
 const all=route.flatMap((o,i)=>o.boxes.map(b=>({...b,order_id:o.id,stop:i+1})));
 if(sum(all,b=>b.weight)>v.capacity_kg+EPS)return {feasible:false,reason:"超过车辆载重"};
 if(sum(all,b=>b.length*b.width*b.height)>v.length*v.width*v.height+EPS)return {feasible:false,reason:"箱件总体积超过车厢"};
 all.sort((a,b)=>(strategy===2?0:b.stop-a.stop)||Number(a.fragile)-Number(b.fragile)||Number(!a.stackable)-Number(!b.stackable)||b.length*b.width*(strategy===1?1:b.height)-a.length*a.width*(strategy===1?1:a.height)||b.weight-a.weight||a.id.localeCompare(b.id));
 let points=[[v.length,0,0]],placed=[];
 for(const b of all){
  if(strategy)for(const x of [v.length,...placed.map(a=>a.x)])for(const y of [0,...placed.map(a=>a.y+a.dy)])points.push([x,y,0]);
  points=[...new Map(points.map(p=>[p.join(","),p])).values()];
  const orientations=[[b.length,b.width,b.height]];if(b.rotate&&b.length!==b.width)orientations.push([b.width,b.length,b.height]);
  const options=[];
  for(const [anchor,y,z] of points)for(const [dx,dy,dz] of orientations){
   const a={...b,x:anchor-dx,y,z,dx,dy,dz};
   if(a.x<-EPS||y+dy>v.width+EPS||z+dz>v.height+EPS||placed.some(q=>intersects(a,q))||!support(a,placed))continue;
   if(c.unload==="direct"&&(blockers(a,placed).some(q=>q.stop>a.stop)||placed.some(q=>q.stop<a.stop&&blockers(q,[a]).length)))continue;
   options.push(a);
  }
  if(!options.length)return {feasible:false,reason:"装箱启发式未找到符合支撑及取货要求的位置"};
   options.sort((a,b)=>(strategy?Number(b.z>EPS)-Number(a.z>EPS):a.z-b.z)||b.x-a.x||a.y-b.y||a.dx*a.dy-b.dx*b.dy);
  const a=options[0];placed.push(a);points.push([a.x,a.y,a.z],[a.x+a.dx,a.y+a.dy,a.z],[a.x+a.dx,a.y,a.z+a.dz]);
 }
 const unloading=unloadPlan(placed,route,v,c);if(!unloading.feasible)return unloading;
 // Initial loading is an independent removal order reversed, before any delivery.
 let remaining=copy(placed),removal=[];
 while(remaining.length){const a=remaining.filter(b=>!blockers(b,remaining).length).sort((a,b)=>b.z-a.z||a.x-b.x||a.id.localeCompare(b.id))[0];if(!a)return {feasible:false,reason:"初始装车顺序不可执行"};removal.push(a);remaining=remaining.filter(b=>b.id!==a.id);}
 const loading=removal.reverse().map((b,i)=>({step:i+1,box_id:b.id,order_id:b.order_id,position:[b.x,b.y,b.z]}));
 return {feasible:true,layout:placed,loading,unloading};
}
function pack(route,v,c){let last,best;const floor=p=>sum(p.layout.filter(b=>b.z<EPS),b=>b.dx*b.dy);for(const strategy of (c.unload==="limited"?[0,1,2]:[0,1])){last=packAttempt(route,v,c,strategy);if(last.feasible&&(!best||last.unloading.rehandles<best.unloading.rehandles||(last.unloading.rehandles===best.unloading.rehandles&&floor(last)<floor(best)-EPS)))best=last;}return best||last;}
function service(o,c,step){const components={setup:c.setup_minutes,boxes:o.boxes.length*c.per_box_minutes,fragile:o.boxes.filter(b=>b.fragile).length*c.fragile_extra_minutes,heavy:o.boxes.filter(b=>b.weight>c.heavy_threshold_kg).length*c.heavy_extra_minutes,rehandle:step.rehandles*(c.move_out_minutes+c.move_in_minutes)};return {minutes:Math.ceil(sum(Object.values(components))*2)/2,components};}
function travel(a,b,d,c){
 if(d.travel){const t=d.travel,i=t.points.findIndex(p=>p.id===(a.store_id||a.id)),j=t.points.findIndex(p=>p.id===(b.store_id||b.id));const km=t.distances[i][j],minutes=t.durations[i][j];return km===null||minutes===null?null:{km,minutes};}
 const rad=x=>x*Math.PI/180,dl=rad(b.lon-a.lon),dt=rad(b.lat-a.lat),h=Math.sin(dt/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dl/2)**2;
 const km=6371*2*Math.asin(Math.min(1,Math.sqrt(h)))*1.28;return {km,minutes:km/c.speed_kmh*60};
}
function schedule(route,v,d,c,packing){
 const loading=c.loading_setup+sum(route,o=>o.boxes.length)*c.loading_per_box;
 let now=d.start+loading,last=d.depot,km=0,driving=0,waiting=0,unloading=0,stops=[];
 for(let i=0;i<route.length;i++){
  const o=route[i],leg=travel(last,o,d,c);if(!leg)return {feasible:false,reason:"道路不可达"};
  const arrival=now+leg.minutes,begin=Math.max(arrival,o.ready),s=service(o,c,packing.unloading.steps[i]),end=begin+s.minutes;
  if(end>o.due+EPS)return {feasible:false,reason:o.id+"无法在截止前完成卸货"};
  stops.push({...o,boxes:undefined,arrival,service_start:begin,service_end:end,wait:begin-arrival,service_estimate:s,leg_km:leg.km,travel_minutes:leg.minutes});
  waiting+=begin-arrival;unloading+=s.minutes;km+=leg.km;driving+=leg.minutes;now=end;last=o;
 }
 const endpoint=c.endpoint==="return"?d.depot:c.endpoint==="parking"?d.end_point:last;
 let finalLeg={km:0,minutes:0};if(c.endpoint!=="open"){finalLeg=travel(last,endpoint,d,c);if(!finalLeg)return {feasible:false,reason:"终点道路不可达"};km+=finalLeg.km;driving+=finalLeg.minutes;now+=finalLeg.minutes;}
 if(now>v.shift_end+EPS)return {feasible:false,reason:"任务结束超过车辆班次"};
 const work=now-d.start,cost_parts={fixed:v.fixed_cost,distance:km*v.cost_per_km,labor:work/60*v.labor_per_hour};
 return {feasible:true,stops,km,end:now,endpoint,final_leg:finalLeg,work_minutes:work,time_parts:{loading,driving,waiting,unloading},cost_parts,cost:sum(Object.values(cost_parts)),packing,vehicle:v,order_ids:route.map(o=>o.id),rehandles:packing.unloading.rehandles};
}
// Output verifier replays operations rather than trusting the packing search.
function verify(result,d){
 const c=validate(d),seen=new Set(),source=new Map(d.orders.flatMap(o=>o.boxes.map(b=>[b.id,{...b,order_id:o.id}])));
 assert(JSON.stringify(result.config)===JSON.stringify(c),"方案条件与输入不一致");
 assert(result.routes.length<=c.max_vehicles,"出车数超上限");const vehicles=new Set();
 function inspect(layout,v){const ids=new Set();let mass=0;for(const b of layout){const original=source.get(b.id);assert(original&&!ids.has(b.id),"箱件未知或重复");ids.add(b.id);mass+=b.weight;
  for(const k of ["weight","fragile","stackable","max_top_weight","order_id"])assert(b[k]===original[k],"箱件属性不一致");
  assert(b.dz===original.height&&((b.dx===original.length&&b.dy===original.width)||(original.rotate&&b.dx===original.width&&b.dy===original.length)),"箱件尺寸不一致");
  for(const [k,size] of [["x",v.length],["y",v.width],["z",v.height]])assert(Number.isFinite(b[k])&&b[k]>=-EPS&&b[k]+b["d"+k]<=size+EPS,"箱件越界");
  for(const a of layout)if(a.id!==b.id)assert(!intersects(a,b),"箱件重叠");
  if(b.z>EPS){const base=layout.find(a=>a.id!==b.id&&a.z<EPS&&a.stackable&&!a.fragile&&Math.abs(a.z+a.dz-b.z)<EPS&&a.x<=b.x+EPS&&a.y<=b.y+EPS&&a.x+a.dx>=b.x+b.dx-EPS&&a.y+a.dy>=b.y+b.dy-EPS);assert(base,"箱件悬空或非法堆叠");
   const upper=sum(layout.filter(a=>a.id!==base.id&&a.z>=base.z+base.dz-EPS&&a.x>=base.x-EPS&&a.y>=base.y-EPS&&a.x+a.dx<=base.x+base.dx+EPS&&a.y+a.dy<=base.y+base.dy+EPS),a=>a.weight);assert(upper<=base.max_top_weight+EPS,"上层累计承重超限");}}
  assert(mass<=v.capacity_kg+EPS,"超载");
 }
 const stateKey=layout=>JSON.stringify(layout.map(b=>[b.id,b.x,b.y,b.z]).sort((a,b)=>a[0].localeCompare(b[0])));
 for(const r of result.routes){assert(!vehicles.has(r.vehicle.id),"车辆重复使用");vehicles.add(r.vehicle.id);const original=d.vehicles.find(v=>v.id===r.vehicle.id);assert(original?.enabled&&JSON.stringify(original)===JSON.stringify(r.vehicle),"车辆与输入不一致");
  for(const id of r.order_ids){assert(!seen.has(id)&&d.orders.some(o=>o.id===id),"订单未知或重复");seen.add(id);}
  const expected=d.orders.filter(o=>r.order_ids.includes(o.id)).flatMap(o=>o.boxes.map(b=>b.id));assert(expected.length===r.packing.layout.length&&expected.every(id=>r.packing.layout.some(b=>b.id===id)),"箱件缺失");
  inspect(r.packing.layout,r.vehicle);let loaded=[];const loadedIds=new Set();
  for(const op of r.packing.loading){const b=r.packing.layout.find(b=>b.id===op.box_id);assert(b&&!loadedIds.has(b.id),"装车箱件重复或缺失");assert(op.position.every((p,i)=>Math.abs(p-b[["x","y","z"][i]])<EPS),"装车指引位置不一致");assert(!blockers(b,loaded).length,"装车路径受阻");loaded.push(copy(b));loadedIds.add(b.id);inspect(loaded,r.vehicle);}
  assert(loaded.length===expected.length,"装车遗漏");let remaining=copy(loaded),moves=0;
  assert(r.packing.unloading.steps.length===r.order_ids.length,"卸货站点遗漏");
  for(let i=0;i<r.packing.unloading.steps.length;i++){const step=r.packing.unloading.steps[i],temporary=new Map(),delivered=new Set();assert(step.order_id===r.order_ids[i]&&step.stop===i+1,"卸货站序错误");inspect(step.before_layout,r.vehicle);assert(stateKey(remaining)===stateKey(step.before_layout),"卸货前快照不一致");
   for(const op of step.operations){
    if(op.type==="move_in"){const b=temporary.get(op.box_id);assert(b,"恢复箱件未曾搬出");const a={...b,x:op.position[0],y:op.position[1],z:op.position[2]};assert(!blockers(a,remaining).length,"恢复路径受阻");remaining.push(a);temporary.delete(b.id);}
    else {const b=remaining.find(b=>b.id===op.box_id);assert(b&&!blockers(b,remaining).length,"卸货路径或上层受阻");assert(op.position.every((p,i)=>Math.abs(p-b[["x","y","z"][i]])<EPS),"卸货指引位置不一致");
     if(op.type==="unload"){assert(b.order_id===step.order_id,"卸错门店货物");delivered.add(b.id);}else{assert(op.type==="move_out"&&c.unload==="limited"&&b.order_id!==step.order_id,"非法搬移");temporary.set(b.id,b);moves++;}remaining=remaining.filter(a=>a.id!==b.id);}
    inspect(remaining,r.vehicle);
   }
   assert(!temporary.size&&!remaining.some(b=>b.order_id===step.order_id),"卸货或恢复遗漏");assert(step.rehandles<=c.max_rehandles&&step.rehandles===step.operations.filter(o=>o.type==="move_out").length,"搬移上限或计数错误");
   inspect(step.after_layout,r.vehicle);assert(stateKey(remaining)===stateKey(step.after_layout),"卸货后快照不一致");assert(step.boxes.length===delivered.size&&step.boxes.every(b=>delivered.has(b.box_id)),"本站箱件清单不一致");
  }
  assert(!remaining.length&&moves===r.rehandles,"卸货最终状态错误");
  const route=r.order_ids.map(id=>d.orders.find(o=>o.id===id)),timing=schedule(route,r.vehicle,d,c,r.packing);assert(timing.feasible,"排程不可行");
  for(const k of ["work_minutes","cost","km","end"])assert(Math.abs(timing[k]-r[k])<.001,"计算结果与排程不一致");
  assert(r.stops.length===timing.stops.length,"排程站点缺失");for(let i=0;i<r.stops.length;i++)for(const k of ["arrival","service_start","service_end","wait","leg_km","travel_minutes"])assert(Math.abs(r.stops[i][k]-timing.stops[i][k])<.001,"站点时间或距离不一致");
  for(const k of ["loading","driving","waiting","unloading"])assert(Math.abs(r.time_parts[k]-timing.time_parts[k])<.001,"作业时间明细不一致");
  for(const k of ["fixed","distance","labor"])assert(Math.abs(r.cost_parts[k]-timing.cost_parts[k])<.001,"费用明细不一致");
 }
 assert(result.metrics.assigned===seen.size&&result.metrics.orders===d.orders.length&&result.metrics.vehicles===vehicles.size,"服务量不一致");
 for(const k of ["cost","km","work_minutes"])assert(Math.abs(result.metrics[k]-round(sum(result.routes,r=>r[k])))<.001,"汇总指标不一致");
 const finish=result.routes.length?Math.max(...result.routes.map(r=>r.end)):d.start;
 assert(Math.abs(result.metrics.finish-finish)<.001&&Math.abs(result.metrics.elapsed_minutes-round(finish-d.start))<.001,"任务历时不一致");
 assert(result.metrics.stacked_boxes===sum(result.routes,r=>r.packing.layout.filter(b=>b.z>EPS).length),"上层箱件汇总不一致");
 assert(result.unassigned.length===d.orders.length-seen.size&&new Set(result.unassigned.map(o=>o.order_id)).size===result.unassigned.length&&result.unassigned.every(o=>!seen.has(o.order_id)&&d.orders.some(x=>x.id===o.order_id)),"未安排清单不一致");return true;
}
function solve(d,mode="optimized"){
 const started=Date.now(),c=validate(d),vehicles=d.vehicles.filter(v=>v.enabled),orders=d.orders,index=new Map(orders.map((o,i)=>[o.id,i]));
 const cache=new Map(),columns=new Map();let checks=0,rejected=0,improvements=0,budgetHit=false;const evaluationLimit=2200;
 const value=r=>c.objective==="time"?r.work_minutes:r.cost;
 const mask=r=>r.reduce((m,o)=>m|(1<<index.get(o.id)),0);
 function evaluate(i,route){if(!route.length)return null;const key=i+":"+route.map(o=>o.id).join(">");if(cache.has(key))return cache.get(key);
  if(checks>=evaluationLimit){budgetHit=true;return null;}checks++;
  const packing=pack(route,vehicles[i],c),result=packing.feasible?schedule(route,vehicles[i],d,c,packing):packing;
  cache.set(key,result);if(!result.feasible){rejected++;return result;}
  const colkey=i+":"+mask(route),old=columns.get(colkey);if(!old||value(result)<value(old.result)-EPS)columns.set(colkey,{vehicle:i,mask:mask(route),route:route.slice(),result});return result;
 }
 function score(routes){let assigned=0,primary=0,secondary=0,count=0;routes.forEach((r,i)=>{if(r.length){const e=evaluate(i,r);if(!e?.feasible){primary=Infinity;return;}assigned+=r.length;primary+=value(e);secondary+=c.objective==="time"?e.cost:e.work_minutes;count++;}});return [-assigned,primary,secondary,count];}
 const better=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]<b[i]-EPS)return true;if(a[i]>b[i]+EPS)return false;}return false;};
 function insert(routes,o,baseline=false,vehicleOrder=vehicles.map((v,i)=>i)){
  const used=routes.filter(r=>r.length).length,options=[];
  for(const i of vehicleOrder){const r=routes[i];if(!r.length&&used>=c.max_vehicles)continue;const old=r.length?value(evaluate(i,r)):0;
   for(const p of baseline?[r.length]:Array.from({length:r.length+1},(_,i)=>i)){const trial=[...r.slice(0,p),o,...r.slice(p)],e=evaluate(i,trial);if(e?.feasible){options.push({delta:value(e)-old,i,p,trial});if(baseline)break;}}
   if(baseline&&options.length)break;
  }
  if(!options.length)return false;if(!baseline)options.sort((a,b)=>a.delta-b.delta||a.i-b.i||a.p-b.p);const chosen=options[0];routes[chosen.i]=chosen.trial;return true;
 }
 function construct(sequence,baseline=false,vehicleOrder){const routes=vehicles.map(()=>[]);sequence.forEach(o=>insert(routes,o,baseline,vehicleOrder));return routes;}
 const nearest=[];let cursor=d.depot,remainingOrders=orders.slice();while(remainingOrders.length){remainingOrders.sort((a,b)=>(travel(cursor,a,d,c)?.minutes??Infinity)-(travel(cursor,b,d,c)?.minutes??Infinity)||a.id.localeCompare(b.id));cursor=remainingOrders.shift();nearest.push(cursor);}
 const sequence=mode==='nearest'?nearest:mode==='deadline'?orders.slice().sort((a,b)=>a.due-b.due||a.id.localeCompare(b.id)):orders;
 const baseline=construct(sequence,true);let best=baseline;
 if(!['baseline','nearest','deadline'].includes(mode)){
  for(const ordered of [nearest,orders.slice().sort((a,b)=>a.due-b.due||a.id.localeCompare(b.id))]){const trial=construct(ordered,true);if(better(score(trial),score(best)))best=trial;}
  const seeds=[orders.slice().sort((a,b)=>a.due-b.due||a.ready-b.ready||a.id.localeCompare(b.id)),orders.slice().sort((a,b)=>Math.atan2(a.lat-d.depot.lat,a.lon-d.depot.lon)-Math.atan2(b.lat-d.depot.lat,b.lon-d.depot.lon))];
  for(const sequence of seeds){let routes=construct(sequence,false,vehicles.map((v,i)=>i).sort((a,b)=>vehicles[b].length*vehicles[b].width*vehicles[b].height-vehicles[a].length*vehicles[a].width*vehicles[a].height));
   for(let pass=0;pass<2&&!budgetHit;pass++){
    for(let i=0;i<routes.length;i++){let improved=false;for(let a=0;a<routes[i].length-1&&!improved;a++)for(let b=a+2;b<=routes[i].length;b++){const r=routes[i],trial=[...r.slice(0,a),...r.slice(a,b).reverse(),...r.slice(b)],e=evaluate(i,trial);if(e?.feasible&&value(e)<value(evaluate(i,r))-EPS){routes[i]=trial;improved=true;improvements++;break;}}}
    let changed=false;for(let a=0;a<routes.length&&!changed;a++)for(let pos=0;pos<routes[a].length&&!changed;pos++)for(let b=0;b<routes.length&&!changed;b++){
     if(a===b)continue;if(!routes[b].length&&routes.filter(r=>r.length).length>=c.max_vehicles&&routes[a].length>1)continue;
     const ra=routes[a].filter((_,i)=>i!==pos),ea=ra.length?evaluate(a,ra):null;if(ra.length&&!ea?.feasible)continue;
     for(let q=0;q<=routes[b].length;q++){const rb=[...routes[b].slice(0,q),routes[a][pos],...routes[b].slice(q)],eb=evaluate(b,rb);if(!eb?.feasible)continue;
      const before=value(evaluate(a,routes[a]))+(routes[b].length?value(evaluate(b,routes[b])):0),after=(ea?value(ea):0)+value(eb);
      if(after<before-EPS){routes[a]=ra;routes[b]=rb;changed=true;improvements++;break;}}
    }
    const used=new Set(routes.flatMap(r=>r.map(o=>o.id)));for(const o of orders)if(!used.has(o.id)&&insert(routes,o))improvements++;
   }
   if(better(score(routes),score(best)))best=routes;
  }
  // Repair service gaps by replacing a used vehicle from the whole enabled pool.
  // A larger/cheaper vehicle may enable insertions that a time-only relocation misses.
  for(let pass=0;pass<2&&!budgetHit;pass++){
   let improved=false;
   for(let a=0;a<vehicles.length&&!budgetHit;a++)if(best[a].length)for(let b=0;b<vehicles.length&&!budgetHit;b++)if(!best[b].length){
    const e=evaluate(b,best[a]);if(!e?.feasible)continue;
    const trial=best.map(r=>r.slice());trial[b]=trial[a];trial[a]=[];
    for(let other=0;other<vehicles.length&&!budgetHit;other++)if(other!==b)for(const o of trial[other].slice()){
     const reduced=trial[other].filter(x=>x.id!==o.id),er=reduced.length?evaluate(other,reduced):null;
     if(reduced.length&&!er?.feasible)continue;
     for(let p=0;p<=trial[b].length;p++){
      const merged=[...trial[b].slice(0,p),o,...trial[b].slice(p)],em=evaluate(b,merged);if(!em?.feasible)continue;
      const current=value(evaluate(b,trial[b]))+(trial[other].length?value(evaluate(other,trial[other])):0);
      if(value(em)+(er?value(er):0)<current-EPS){trial[b]=merged;trial[other]=reduced;break;}
     }
    }
    const used=new Set(trial.flatMap(r=>r.map(o=>o.id)));
    for(const o of orders)if(!used.has(o.id))insert(trial,o);
    if(better(score(trial),score(best))){best=trial;improvements++;improved=true;}
   }
   if(!improved)break;
  }
  // Every enabled vehicle can participate; the cap is on selected routes, not first K vehicles.
  for(let v=0;v<vehicles.length&&!budgetHit;v++)for(const o of orders)evaluate(v,[o]);
  let states=new Map([["0:0",{mask:0,count:0,value:0,routes:vehicles.map(()=>[])}]]),pruned=false,peak=1;
  for(let v=0;v<vehicles.length;v++){
   let next=new Map(states);const options=[...columns.values()].filter(col=>col.vehicle===v);
   for(const st of states.values())if(st.count<c.max_vehicles)for(const col of options)if(!(st.mask&col.mask)){
    const m=st.mask|col.mask,count=st.count+1,key=m+":"+count,total=st.value+value(col.result),old=next.get(key);
    if(!old||total<old.value-EPS){const routes=st.routes.map(r=>r.slice());routes[v]=col.route;next.set(key,{mask:m,count,value:total,routes});}
   }
   peak=Math.max(peak,next.size);if(next.size>1024){pruned=true;next=new Map([...next].sort((a,b)=>popcount(b[1].mask)-popcount(a[1].mask)||a[1].value-b[1].value||a[1].count-b[1].count).slice(0,1024));}states=next;
  }
  for(const st of states.values())if(better(score(st.routes),score(best)))best=st.routes;
  var poolInfo={pool_pruned:pruned,pool_states_peak:peak};
 }
 const routes=best.map((r,i)=>r.length?evaluate(i,r):null).filter(Boolean),served=new Set(routes.flatMap(r=>r.order_ids));
 const unassigned=orders.filter(o=>!served.has(o.id)).map(o=>({order_id:o.id,name:o.name,reasons:[...new Set([...cache.entries()].filter(([k,r])=>k.split(":")[1].split(">").includes(o.id)&&!r.feasible).map(([k,r])=>r.reason))].slice(0,4)}));
 const metrics={orders:orders.length,assigned:served.size,vehicles:routes.length,km:round(sum(routes,r=>r.km)),cost:round(sum(routes,r=>r.cost)),work_minutes:round(sum(routes,r=>r.work_minutes)),finish:routes.length?Math.max(...routes.map(r=>r.end)):d.start,rehandles:sum(routes,r=>r.rehandles),on_time_rate:served.size/orders.length,
  volume_utilization:routes.length?sum(routes,r=>sum(r.packing.layout,b=>b.dx*b.dy*b.dz))/sum(routes,r=>r.vehicle.length*r.vehicle.width*r.vehicle.height):0,
  time_parts:Object.fromEntries(["loading","driving","waiting","unloading"].map(k=>[k,round(sum(routes,r=>r.time_parts[k]))]))};
 metrics.stacked_boxes=sum(routes,r=>r.packing.layout.filter(b=>b.z>EPS).length);
 metrics.elapsed_minutes=round(metrics.finish-d.start);
 const result={version:"0.9",mode,config:c,routes,unassigned,metrics,diagnostics:{packing_checks:checks,packing_rejections:rejected,local_search_improvements:improvements,route_pool_columns:columns.size,evaluation_limit_hit:budgetHit,...poolInfo,duration_ms:Date.now()-started,optimality:"有限启发式搜索；无联合全局最优证明"}};
 verify(result,d);return result;
}
function popcount(n){let c=0;while(n){n&=n-1;c++;}return c;}
function simulate(catalog,seed=42,date="2026-10-12"){
 let state=Number(seed)>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const stores=catalog.stores.slice();for(let i=stores.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[stores[i],stores[j]]=[stores[j],stores[i]];}
 const count=12+Math.floor(random()*5);
 const orders=stores.slice(0,count).map((s,i)=>{const id="O"+String(i+1).padStart(2,"0"),n=2+Math.floor(random()*3),ready=540+Math.floor(random()*4)*30,due=ready+240+Math.floor(random()*3)*60;return {id,store_id:s.id,name:s.name,address:s.address,lon:s.lon,lat:s.lat,ready,due,boxes:Array.from({length:n},(_,j)=>({...skus[Math.floor(random()*skus.length)],id:id+"-B"+(j+1)}))};});
 const types=[[280,155,180,1200,"小型厢车"],[420,185,205,2500,"中型厢车"],[520,220,220,4500,"大型厢车"]];
 const vehicles=Array.from({length:6},(_,i)=>{const [length,width,height,capacity_kg,name]=types[i%3];return {id:"V"+String(i+1).padStart(2,"0"),name,length,width,height,capacity_kg,...vehicleRates[i%3],shift_end:1140,enabled:true};});
 return {version:3,date,seed,orders,vehicles,start:480,depot:copy(catalog.depot),end_point:copy(catalog.parking),config:copy(defaults),provenance:catalog.note,travel:catalog.travel?copy(catalog.travel):undefined};
}
const api={defaults,skus,vehicleRates,validate,solve,verify,pack,unloadPlan,simulate,travel,service,schedule,blockers};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.UrbanEngine=api;
})(typeof self!=="undefined"?self:globalThis);

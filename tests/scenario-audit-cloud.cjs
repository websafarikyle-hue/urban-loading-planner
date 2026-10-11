const assert=require('node:assert/strict'),E=require('../frontend/v03/engine.js'),P=require('../frontend/v03/product.js'),A=require('../frontend/v03/analysis.js'),C=require('../data/hangzhou-fotile-store-catalog.json');
const clone=x=>JSON.parse(JSON.stringify(x)),sum=a=>a.reduce((s,x)=>s+x,0),base=E.simulate(C,42,'2026-10-13'),cases=[];
function add(id,edit=()=>{},source=base){const d=clone(source);edit(d);cases.push({id,d});}
for(const endpoint of ['return','open','parking'])for(const unload of ['direct','limited'])for(const objective of ['time','cost'])add('combo-'+endpoint+'-'+unload+'-'+objective,d=>Object.assign(d.config,{endpoint,unload,objective}));
for(const cap of [1,2,4,6])add('cap-'+cap,d=>d.config.max_vehicles=cap);
for(const seed of [1,2,3,7,99,2026])add('seed-'+seed,()=>{},E.simulate(C,seed,'2026-10-13'));
function workload(count,boxes=3){const d=clone(base);d.orders=Array.from({length:count},(_,i)=>{const s=C.stores[i%C.stores.length],id='N'+i;return {id,store_id:s.id,name:s.name,lon:s.lon,lat:s.lat,address:s.address,ready:480,due:1140,boxes:Array.from({length:boxes},(_,j)=>({...clone(E.skus[(i+j)%E.skus.length]),id:id+'B'+j}))};});return d;}
for(const n of [1,4,8,20,30])add('orders-'+n,()=>{},workload(n));
for(const n of [100,150])add('boxes-'+n,()=>{},workload(n/5,5));
add('small-only',d=>{d.vehicles=d.vehicles.filter((_,i)=>i%3===0);d.config.max_vehicles=2;});
add('medium-only',d=>{d.vehicles=d.vehicles.filter((_,i)=>i%3===1);d.config.max_vehicles=2;});
add('large-disabled',d=>{d.vehicles.forEach((v,i)=>{if(i%3===2)v.enabled=false;});d.config.max_vehicles=4;});
add('one-small',d=>{d.vehicles=[d.vehicles[0]];d.config.max_vehicles=1;});
add('short-shift',d=>d.vehicles.forEach(v=>v.shift_end=600));
add('wide-windows',d=>d.orders.forEach(o=>Object.assign(o,{ready:480,due:1140})));
add('tight-windows',d=>d.orders.forEach(o=>Object.assign(o,{ready:540,due:600})));
add('estimated-roads',d=>delete d.travel);
add('unreachable-store',d=>{const n=d.travel.points.findIndex(p=>p.id===d.orders[0].store_id);for(let i=0;i<d.travel.points.length;i++)if(i!==n){d.travel.durations[i][n]=null;d.travel.distances[i][n]=null;}});
add('expensive-large',d=>{d.config.objective='cost';d.vehicles.forEach((v,i)=>{if(i%3===2)v.fixed_cost=5000;});});
add('free-small',d=>{d.config.objective='cost';d.config.max_vehicles=6;d.vehicles.forEach((v,i)=>{if(i%3===0)Object.assign(v,{fixed_cost:0,cost_per_km:0,labor_per_hour:0});});});
add('zero-service',d=>{for(const k of ['loading_setup','loading_per_box','setup_minutes','per_box_minutes','fragile_extra_minutes','heavy_extra_minutes','move_out_minutes','move_in_minutes'])d.config[k]=0;});
for(const name of ['stack','rehandle'])for(const unload of ['direct','limited'])add(name+'-'+unload,d=>d.config.unload=unload,P.examples(name,C));
function audit(r,d){
 E.verify(r,d);const s=A.summarize(r,d);assert.ok(Math.abs(s.work-r.metrics.work_minutes)<.011);assert.ok(Math.abs(s.cost-r.metrics.cost)<.011);
 const served=new Set(),timeline=A.timeline(r,d);
 for(let i=0;i<r.routes.length;i++){
  const route=r.routes[i],v=route.vehicle;let now=d.start+d.config.loading_setup+route.packing.layout.length*d.config.loading_per_box,last=d.depot;
  for(const stop of route.stops){
   assert.ok(!served.has(stop.id));served.add(stop.id);const o=d.orders.find(o=>o.id===stop.id);now+=E.travel(last,o,d,d.config).minutes;assert.ok(Math.abs(now-stop.arrival)<1e-5);now=Math.max(now,o.ready);
   const step=route.packing.unloading.steps.find(x=>x.order_id===o.id),duration=Math.ceil((d.config.setup_minutes+o.boxes.length*d.config.per_box_minutes+o.boxes.filter(b=>b.fragile).length*d.config.fragile_extra_minutes+o.boxes.filter(b=>b.weight>d.config.heavy_threshold_kg).length*d.config.heavy_extra_minutes+step.operations.filter(x=>x.type==='move_out').length*(d.config.move_out_minutes+d.config.move_in_minutes))*2)/2;
   now+=duration;assert.ok(Math.abs(now-stop.service_end)<1e-5&&now<=o.due+1e-5);last=o;
  }
  if(d.config.endpoint!=='open')now+=E.travel(last,d.config.endpoint==='return'?d.depot:d.end_point,d,d.config).minutes;
  assert.ok(Math.abs(now-route.end)<1e-5&&now<=v.shift_end+1e-5);assert.ok(Math.abs(route.cost-v.fixed_cost-route.km*v.cost_per_km-(now-d.start)*v.labor_per_hour/60)<1e-5);
  let prior=d.start;for(const event of timeline[i].events){assert.ok(Math.abs(event.start-prior)<1e-5);prior=event.end;}assert.ok(Math.abs(prior-now)<1e-5);
 }
 assert.deepEqual([...served,...r.unassigned.map(o=>o.order_id)].sort(),d.orders.map(o=>o.id).sort());
}
const shard=Number(process.env.SCENARIO_SHARD||0),selected=cases.filter((_,i)=>i%3===shard);
for(const {id,d}of selected){
 const before=JSON.stringify(d),r=E.solve(d);assert.equal(JSON.stringify(d),before);audit(r,d);
 if(id==='unreachable-store')assert.ok(r.unassigned.some(o=>o.order_id===d.orders[0].id));
 if(id==='expensive-large'){assert.equal(r.metrics.assigned,16);assert.ok(r.metrics.cost<2000,'cost candidates must avoid expensive trucks when inexpensive full-service plans exist');}
 console.log('AUDIT_RECORD '+JSON.stringify({id,orders:d.orders.length,boxes:sum(d.orders.map(o=>o.boxes.length)),cap:d.config.max_vehicles,assigned:r.metrics.assigned,vehicles:r.metrics.vehicles,selected:r.routes.map(x=>x.vehicle.id),work:r.metrics.work_minutes,cost:r.metrics.cost,elapsed:r.metrics.elapsed_minutes,stacked:r.metrics.stacked_boxes,rehandles:r.metrics.rehandles,checks:r.diagnostics.packing_checks,budget:r.diagnostics.evaluation_limit_hit,seconds:r.diagnostics.duration_ms/1000,unassigned:r.unassigned}));
 if(id==='combo-return-direct-time')console.log('DEFAULT_ROADS '+JSON.stringify(r.routes.map(route=>({id:route.vehicle.id,points:P.routePoints(route,d)}))));
}
function perms(xs){if(!xs.length)return [[]];return xs.flatMap((x,i)=>perms(xs.filter((_,j)=>i!==j)).map(p=>[x,...p]));}
for(const objective of ['time','cost'])for(const cap of [1,2,3]){
 const d=workload(3,1);d.vehicles=d.vehicles.slice(0,3);Object.assign(d.config,{objective,max_vehicles:cap});const c=E.validate(d),cols=d.vehicles.map(v=>{const rows=[{mask:0}];for(let mask=1;mask<8;mask++)for(const seq of perms(d.orders.filter((_,i)=>mask&(1<<i)))){const p=E.pack(seq,v,c);if(p.feasible){const r=E.schedule(seq,v,d,c,p);if(r.feasible)rows.push({mask,r});}}return rows;});let best=[0,Infinity,Infinity,Infinity];
 const better=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]<b[i]-1e-5)return true;if(a[i]>b[i]+1e-5)return false;}return false;};
 function visit(i,mask,rows){if(i===3){const work=sum(rows.map(r=>r.work_minutes)),cost=sum(rows.map(r=>r.cost)),s=[-mask.toString(2).replace(/0/g,'').length,objective==='time'?work:cost,objective==='time'?cost:work,rows.length];if(better(s,best))best=s;return;}for(const col of cols[i])if(!(mask&col.mask)&&rows.length+(!!col.r)<=cap)visit(i+1,mask|col.mask,col.r?[...rows,col.r]:rows);}
 visit(0,0,[]);const r=E.solve(d);const actual=[-r.metrics.assigned,sum(r.routes.map(x=>objective==='time'?x.work_minutes:x.cost)),sum(r.routes.map(x=>objective==='time'?x.cost:x.work_minutes)),r.routes.length];assert.ok(actual.every((n,i)=>Math.abs(n-best[i])<.001));}
const forced=clone(base);delete forced.travel;forced.orders=forced.orders.slice(0,6).map((o,i)=>({...o,lon:forced.depot.lon,lat:forced.depot.lat,ready:480,due:1000,boxes:[{...E.skus[3],id:'B'+i,length:100,width:100,height:100,weight:10,rotate:false}]}));forced.vehicles=forced.vehicles.map(v=>({...v,length:100,width:100,height:100,capacity_kg:100}));
for(const cap of [1,2,3,4,6]){forced.config.max_vehicles=cap;const r=E.solve(forced);assert.equal(r.metrics.assigned,cap);assert.equal(r.metrics.vehicles,cap);audit(r,forced);}
console.log('AUDIT_SUMMARY '+JSON.stringify({shard,passed:selected.length,oracles:6,fleet:5}));

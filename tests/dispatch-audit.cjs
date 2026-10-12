const assert=require('node:assert/strict'),E=require(process.env.AUDIT_ENGINE||'../frontend/v03/engine.js'),P=require('../frontend/v03/product.js'),C=require('../data/hangzhou-fotile-store-catalog.json');
const copy=x=>JSON.parse(JSON.stringify(x));let passed=0;
const test=(name,f)=>{f();passed++;console.log('PASS',name);};
const box=(id,extra={})=>({id,sku:id,length:40,width:40,height:40,weight:10,fragile:false,stackable:true,rotate:false,max_top_weight:20,...extra});
const vehicle=(id,extra={})=>({id,name:id,length:100,width:100,height:80,capacity_kg:100,fixed_cost:100,cost_per_km:2,labor_per_hour:60,enabled:true,shift_end:1200,...extra});
const order=(id,boxes=[box(id+'-box')])=>({id,name:id,lon:120,lat:30,ready:480,due:1100,boxes});
const sample=()=>({date:'2026-10-13',start:480,depot:{id:'D',name:'仓库',lon:120,lat:30},end_point:{id:'P',name:'停车点',lon:120.2,lat:30},orders:[order('A')],vehicles:[vehicle('V')],config:{...E.defaults,max_vehicles:1}});
const score=r=>[-r.metrics.assigned,...(r.config.objective==='time'?['work_minutes','cost']:['cost','work_minutes']).map(k=>r.routes.reduce((s,x)=>s+x[k],0)),r.routes.length];
function noWorse(a,b){const x=score(a),y=score(b);for(let i=0;i<x.length;i++){if(x[i]<y[i]-1e-5)return;if(x[i]>y[i]+1e-5)assert.fail(JSON.stringify({actual:x,reference:y}));}}

test('exact completion/shift boundaries, asymmetric roads and hand-calculated costs',()=>{
 const d=sample();d.orders[0].boxes=[box('heavy',{weight:48,fragile:true})];d.orders[0].ready=510;d.orders[0].due=515;d.vehicles[0].shift_end=535;
 d.travel={points:[d.depot,d.orders[0]],distances:[[0,5],[7,0]],durations:[[0,10],[20,0]],provider:'audit fixture',coordinate_system:'WGS84',query_date:'2026-10-12'};
 const r=E.solve(d);assert.equal(r.metrics.assigned,1);assert.equal(r.metrics.cost,179);assert.equal(r.metrics.work_minutes,55);assert.equal(r.routes[0].stops[0].arrival,501);assert.equal(r.routes[0].stops[0].wait,9);assert.equal(r.routes[0].end,535);
 d.orders[0].due=514.99;assert.equal(E.solve(d).metrics.assigned,0);d.orders[0].due=515;d.vehicles[0].shift_end=534.99;assert.equal(E.solve(d).metrics.assigned,0);
 d.config.endpoint='open';const open=E.solve(d);assert.equal(open.metrics.cost,145);assert.equal(open.metrics.work_minutes,35);
 d.config.endpoint='parking';d.travel.points.push(d.end_point);d.travel.distances=[[0,5,4],[7,0,3],[4,3,0]];d.travel.durations=[[0,10,9],[20,0,8],[9,8,0]];
 const parking=E.solve(d);assert.equal(parking.metrics.cost,159);assert.equal(parking.metrics.work_minutes,43);
});
test('weight limits, cumulative top load, fragile bases, rotations and two-layer limit',()=>{
 const d=sample(),v=d.vehicles[0];v.capacity_kg=10;assert.equal(E.solve(d).metrics.assigned,1);d.orders[0].boxes[0].weight=10.01;assert.equal(E.solve(d).metrics.assigned,0);
 v.capacity_kg=100;const base=box('base',{length:100,width:100,max_top_weight:20}),tops=[box('top1'),box('top2')];d.orders=[order('A',[base,...tops])];assert.ok(E.pack(d.orders,v,d.config).feasible);
 base.max_top_weight=19.99;assert.equal(E.pack(d.orders,v,d.config).feasible,false);base.max_top_weight=20;base.fragile=true;assert.equal(E.pack(d.orders,v,d.config).feasible,false);base.fragile=false;base.stackable=false;assert.equal(E.pack(d.orders,v,d.config).feasible,false);
 v.height=120;d.orders=[order('A',[0,1,2].map(i=>box('L'+i,{length:100,width:100})))];assert.equal(E.pack(d.orders,v,d.config).feasible,false);
 v.length=60;v.width=100;v.height=80;const b=box('rot',{length:100,width:60,height:80});d.orders=[order('A',[b])];assert.equal(E.pack(d.orders,v,d.config).feasible,false);b.rotate=true;assert.ok(E.pack(d.orders,v,d.config).feasible);b.height=81;assert.equal(E.pack(d.orders,v,d.config).feasible,false);
});
test('limited moves restore support and contribute to deadline and labor',()=>{
 const d=sample();d.vehicles[0].length=100;d.orders=[order('A',[box('base',{length:100,width:100})]),order('B',[box('top')])];d.orders[0].due=500;d.orders[1].ready=600;
 assert.equal(E.pack(d.orders,d.vehicles[0],d.config).feasible,false);d.config.unload='limited';const p=E.pack(d.orders,d.vehicles[0],d.config);assert.ok(p.feasible);assert.deepEqual(p.unloading.steps[0].operations.map(o=>o.type),['move_out','unload','move_in']);assert.equal(p.unloading.steps[0].after_layout[0].z,0);
 const r=E.solve(d,'baseline');assert.equal(r.metrics.assigned,2);assert.equal(r.routes[0].stops[0].service_end,498);d.orders[0].due=497.99;assert.equal(E.solve(d,'baseline').metrics.assigned,1);
 d.config.max_rehandles=0;assert.equal(E.pack(d.orders,d.vehicles[0],d.config).feasible,false);
});
test('JSON order IDs cannot collide with route cache delimiters',()=>{
 const d=sample();d.orders=['A>B','A','B','A:C','汉字'].map(id=>order(id));d.vehicles[0].length=400;const r=E.solve(d);assert.equal(r.metrics.assigned,5);assert.ok(E.verify(r,d));
 const bad=sample();bad.orders[0].id='A:C';bad.orders[0].due=480;const r2=E.solve(bad);assert.ok(r2.unassigned[0].reasons.length>0);
});
test('verifier rejects corrupted summaries, instruction coordinates and display data',()=>{
 const d=sample(),r=E.solve(d);for(const edit of [x=>x.metrics.rehandles++,x=>x.metrics.on_time_rate=0,x=>x.metrics.volume_utilization=.9,x=>x.metrics.time_parts.waiting++,x=>x.routes[0].final_leg.minutes++,x=>x.routes[0].endpoint.name='wrong',x=>x.routes[0].stops[0].id='wrong',x=>x.routes[0].stops[0].service_estimate.minutes++,x=>x.routes[0].packing.layout[0].stop=99,x=>x.routes[0].packing.loading[0].position=[],x=>x.routes[0].packing.unloading.steps[0].operations[0].position=[]]){const altered=copy(r);edit(altered);assert.throws(()=>E.verify(altered,d));}
});
test('valid minimal scenes normalize before UI state changes',()=>{
 const d=sample();delete d.end_point;delete d.config;d.vehicles.push(vehicle('V2'),vehicle('V3'));const before=JSON.stringify(d),normalized=P.normalizeScenario(d,C,'2026-10-13');assert.equal(normalized.config.endpoint,'return');assert.ok(normalized.end_point);assert.equal(JSON.stringify(d),before);
 for(const date of ['2026-02-30','invalid',17])assert.throws(()=>P.normalizeScenario({...d,date},C,'2026-10-13'));
 assert.throws(()=>P.normalizeScenario({...d,provenance:{}},C,'2026-10-13'));
});
test('fleet count responds to load, and maximizing served orders precedes any cost',()=>{
 const d=sample();d.orders=Array.from({length:6},(_,i)=>order('O'+i,[box('B'+i,{length:100,width:100,height:80})]));d.vehicles=Array.from({length:6},(_,i)=>vehicle('V'+i,{fixed_cost:100000}));
 for(const objective of ['time','cost'])for(const cap of [1,2,3,4,6]){Object.assign(d.config,{objective,max_vehicles:cap});const r=E.solve(d);assert.equal(r.metrics.assigned,cap);assert.equal(r.metrics.vehicles,cap);}
});
test('search budget cannot lose a feasible limited-move reference plan (20 orders)',()=>{
 const d=P.examples('rehandle',C);delete d.travel;
 d.orders=Array.from({length:10},(_,i)=>d.orders.map((o,j)=>({...o,id:`O${i}_${j}`,lon:d.depot.lon,lat:d.depot.lat,store_id:undefined,boxes:o.boxes.map((b,k)=>({...b,id:`B${i}_${j}_${k}`}))}))).flat();
 d.vehicles=Array.from({length:10},(_,i)=>({...d.vehicles[1],id:'V'+i,enabled:true}));d.config.max_vehicles=10;
 for(const objective of ['time','cost']){d.config.objective=objective;const r=E.solve(d);assert.equal(r.metrics.assigned,20);for(const mode of ['baseline','nearest','deadline'])noWorse(r,E.solve(d,mode));console.log('BUDGET_RECORD',JSON.stringify({objective,assigned:r.metrics.assigned,vehicles:r.metrics.vehicles,rehandles:r.metrics.rehandles,checks:r.diagnostics.packing_checks,reference_checks:r.diagnostics.reference_checks}));}
});
test('cap/objective and unloading relaxation comparisons use the same feasible workload',()=>{
 const d=P.examples('rehandle',C);d.vehicles=d.vehicles.filter(v=>v.enabled);d.vehicles.push({...d.vehicles[0],id:'SECOND',fixed_cost:1000});
 for(const objective of ['time','cost']){d.config.objective=objective;let prior;
  for(const cap of [1,2]){d.config.max_vehicles=cap;d.config.unload='direct';const strict=E.solve(d);d.config.unload='limited';const relaxed=E.solve(d);noWorse(relaxed,strict);if(prior)noWorse(relaxed,prior);prior=relaxed;for(const mode of ['baseline','nearest','deadline'])noWorse(relaxed,E.solve(d,mode));}
 }
});
console.log(passed+' dispatch audit groups passed');

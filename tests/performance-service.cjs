'use strict';
const assert=require('node:assert/strict'),E=require('../frontend/v03/engine.js'),P=require('../frontend/v03/product.js'),C=require('../data/hangzhou-fotile-store-catalog.json');
const clone=x=>JSON.parse(JSON.stringify(x));
const d=E.simulate(C,42,'2026-10-13');
d.orders=Array.from({length:30},(_,i)=>{const p=C.stores[i%C.stores.length],id='N'+i;return {id,store_id:p.id,name:p.name,address:p.address,lon:p.lon,lat:p.lat,ready:480,due:1140,boxes:E.skus.map((b,j)=>({...b,id:id+'B'+j}))};});
const before=JSON.stringify(d),proof=E.analyzeService(d,E.validate(d));
assert.equal(proof.upper_bound,23);assert.equal(proof.bounds.floor,23);assert.equal(proof.budgets.floor,306500);
assert.ok(proof.orders.every(o=>!o.individually_impossible&&o.floor===13025));
let progress=[];const start=Date.now(),r=E.solve(d,'optimized',{time_limit_ms:15000,onProgress:p=>{assert.ok(E.verify(p,d));progress.push(p.metrics.assigned);}});
assert.ok(E.verify(r,d));assert.equal(JSON.stringify(d),before);assert.ok(r.metrics.assigned>=18);
assert.equal(r.service_bound.upper_bound,23);assert.equal(r.service_bound.gap,23-r.metrics.assigned);
assert.ok(Date.now()-start<22000,'budget plus verification must remain bounded');
assert.ok(progress.length>0);for(let i=1;i<progress.length;i++)assert.ok(progress[i]>=progress[i-1]);
assert.ok(r.unassigned.every(o=>o.status==='search_unresolved'));
console.log('PERFORMANCE_RECORD',JSON.stringify({ms:Date.now()-start,assigned:r.metrics.assigned,bound:r.service_bound,progress,checks:r.diagnostics.packing_checks}));
// A tiny budget must still return a self-consistent (possibly empty) plan.
const tiny=clone(d);tiny.orders=tiny.orders.slice(0,2);let bundles=[];
const combined=E.compare(tiny,{time_limit_ms:1000,onProgress:b=>{assert.ok(E.verify(b.optimized,tiny));bundles.push(b);}});
assert.ok(E.verify(combined.optimized,tiny));assert.ok(bundles.length>0);assert.ok(combined.optimized.metrics.assigned>=combined.baseline.metrics.assigned);
const expired=E.solve(tiny,'optimized',{time_limit_ms:0});assert.ok(E.verify(expired,tiny));assert.equal(expired.diagnostics.time_limit_hit,true);
// Prove only necessary-condition failures; finite heuristic failure stays unresolved.
const bad=clone(tiny);bad.orders[0].boxes[0].weight=9999;
assert.ok(E.analyzeService(bad,E.validate(bad)).orders[0].individually_impossible);
const failure=E.solve(bad);assert.equal(failure.unassigned.find(o=>o.order_id===bad.orders[0].id).status,'proven_individually_infeasible');
const altered=clone(r);altered.service_bound.upper_bound=30;assert.throws(()=>E.verify(altered,d));
const wrongReason=clone(r);wrongReason.unassigned[0].status='proven_individually_infeasible';assert.throws(()=>E.verify(wrongReason,d));
const boundFor=cap=>{const x={...d,config:{...d.config,max_vehicles:cap}};return E.analyzeService(x,E.validate(x));};
assert.equal(boundFor(4).upper_bound,29);assert.equal(boundFor(5).upper_bound,30);
// Non-triangular matrices and IDs aliased to public store points must not create false proofs.
const nonmetric=clone(tiny);nonmetric.start=0;nonmetric.orders.forEach(o=>{o.ready=0;o.due=100});
nonmetric.depot.store_id='WAREHOUSE';nonmetric.travel={points:[{id:'WAREHOUSE',lon:nonmetric.depot.lon,lat:nonmetric.depot.lat},...nonmetric.orders.map(o=>({id:o.store_id,lon:o.lon,lat:o.lat}))],distances:[[0,100,1],[1,0,1],[1,1,0]],durations:[[0,1000,1],[1,0,1],[1,1,0]],provider:'test',coordinate_system:'WGS84',query_date:'2026-10-12'};
assert.ok(E.analyzeService(nonmetric,E.validate(nonmetric)).orders.every(o=>!o.individually_impossible));
assert.ok(E.verify(E.solve(nonmetric),nonmetric));
console.log('PASS time budget, feasible checkpoints, service certificate, immutable source and infeasibility classification');

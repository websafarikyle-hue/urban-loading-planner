const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../frontend/v03/engine.js'),P=require('../frontend/v03/product.js'),C=require('../data/hangzhou-fotile-store-catalog.json');
const copy=x=>JSON.parse(JSON.stringify(x));let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name);}
test('five package types and actual supported upper boxes',()=>{
 assert.equal(E.skus.length,5);const d=P.examples('stack',C),r=E.solve(d);assert.equal(r.metrics.assigned,4);assert.ok(r.metrics.stacked_boxes>0);assert.ok(E.verify(r,d));
 const bad=copy(r);bad.routes[0].packing.layout.find(b=>b.z>0).z+=1;assert.throws(()=>E.verify(bad,d),/支撑|悬空|堆叠/);
 const wrong=copy(r);wrong.metrics.stacked_boxes++;assert.throws(()=>E.verify(wrong,d),/上层/);
});
test('limited moves restore cargo and direct rule exposes service loss',()=>{
 const d=P.examples('rehandle',C),r=E.solve(d),step=r.routes[0].packing.unloading.steps[0],ops=P.operations(step,d.config);
 assert.equal(r.metrics.assigned,2);assert.equal(r.metrics.rehandles,1);assert.equal(step.operations.filter(o=>o.type==='unload').length,4);
 assert.equal(ops.length,6);assert.ok(ops.find(o=>o.type==='move_out'));assert.ok(ops.find(o=>o.type==='move_in'));assert.ok(ops.every(o=>o.reason&&o.minutes>=0));
 assert.equal(r.routes[0].stops[0].service_estimate.components.rehandle,2);assert.ok(E.verify(r,d));
 const bad=copy(r),operations=bad.routes[0].packing.unloading.steps[0].operations;const bottom=operations.findIndex(o=>o.type==='unload'&&o.box_id===step.before_layout.find(b=>b.z===0&&E.blockers(b,step.before_layout).length).id);[operations[0],operations[bottom]]=[operations[bottom],operations[0]];assert.throws(()=>E.verify(bad,d),/受阻|支撑/);
 d.config.unload='direct';assert.equal(E.solve(d).metrics.assigned,1);
});
test('CSV groups package rows and imports atomically',()=>{
 const d=E.simulate(C,42),prior=JSON.stringify(d),text=P.template(C),imported=P.importOrders(text,d,C);assert.equal(imported.orders.length,2);assert.equal(imported.orders[0].boxes.length,3);assert.equal(JSON.stringify(d),prior);
 for(const value of [text.replace('09:00','29:00'),text.replace('HOOD','MISSING'),text.replace('ORDER01','<script>'),text.replace('HZ-FT01','NO_STORE')])assert.throws(()=>P.importOrders(value,d,C));
 assert.equal(JSON.stringify(d),prior);assert.throws(()=>P.parseCSV('"unclosed'));
 assert.deepEqual(P.parseCSV('\ufeff"a,b","a""b"\r\n"c","d"'),[['a,b','a"b'],['c','d']]);assert.ok(P.csv([['=WEBSERVICE(1)']]).includes("'=WEBSERVICE"));
});
test('roads are coordinate-bound and match planned distance and time',()=>{
 const w={window:{}};vm.runInNewContext(fs.readFileSync('frontend/v03/roads.js','utf8'),w);const cache=w.window.FOTILE_ROADS.edges,d=P.examples('stack',C),r=E.solve(d).routes[0];
 const shape=P.cachedGeometry(r,d,cache);assert.ok(shape.length>100);const key=Object.keys(cache)[0],edge=cache[key];
 const matched=P.patchTravel(d,[edge]);assert.equal(matched.changed,false);const changed=P.patchTravel(d,[{...edge,minutes:edge.minutes+10}]);assert.equal(changed.changed,true);
 assert.throws(()=>P.patchTravel(d,[{...edge,from:{...edge.from,lon:edge.from.lon+.01}}]),/坐标/);
 const altered=copy(d),points=P.routePoints(r,d),first=cache[P.edgeKey(points[0],points[1])],i=altered.travel.points.findIndex(p=>p.id===(points[0].store_id||points[0].id)),j=altered.travel.points.findIndex(p=>p.id===(points[1].store_id||points[1].id));altered.travel.durations[i][j]=first.minutes+1;assert.equal(P.cachedGeometry(r,altered,cache),null);
 assert.throws(()=>P.roadSegments(r,d,{code:'Ok',routes:[{legs:[]}]}),/路段/);
 const legs=points.slice(1).map(()=>({distance:100,duration:60,steps:[{geometry:{coordinates:[[120,30],[120.1,30.1]]}}]})),good={code:'Ok',routes:[{legs}]};assert.equal(P.roadSegments(r,d,good).length,points.length-1);legs[0].steps[0].geometry.coordinates[0][0]=NaN;assert.throws(()=>P.roadSegments(r,d,good),/坐标/);
});
test('print sheet contains every unload action, times and escaped input',()=>{
 const d=P.examples('rehandle',C),r=E.solve(d);d.date='<script>alert(1)</script>';const html=P.printPlan(d,r);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>alert(1)</script>'));assert.ok(html.includes('打印 / 保存为 PDF'));assert.ok(html.includes('恢复装入'));for(const box of d.orders.flatMap(o=>o.boxes))assert.ok(html.includes(box.id));assert.ok(html.includes('min'));
});
test('all 12 endpoint/unload/objective combinations replay correctly',()=>{
 for(const endpoint of ['return','open','parking'])for(const unload of ['direct','limited'])for(const objective of ['time','cost']){
  const d=P.examples('stack',C);d.config={...d.config,endpoint,unload,objective};const r=E.solve(d);assert.ok(E.verify(r,d));assert.equal(r.metrics.assigned,4);assert.ok(r.metrics.elapsed_minutes>=0);
 }
});
console.log(checks+' v0.9 product groups passed');

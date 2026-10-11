const assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../frontend/v03/engine.js'),P=require('../frontend/v03/product.js'),A=require('../frontend/v03/analysis.js'),C=require('../data/hangzhou-fotile-store-catalog.json');
const d=P.examples('rehandle',C),r=E.solve(d),s=A.summarize(r,d),base=A.summarize(E.solve(d,'nearest'),d);
assert.equal(s.assigned,2);assert.equal(s.boxes,5);assert.equal(s.loads[0].stacked,1);
assert.ok(Math.abs(s.work-r.metrics.work_minutes)<.01);assert.ok(Math.abs(s.cost-r.metrics.cost)<.01);
assert.ok(s.slack.every(x=>x.minutes>=-1e-7));assert.ok(s.loads.every(l=>l.volume_ratio<=1&&l.weight_ratio<=1));
for(const line of A.timeline(r,d)){
 let end=d.start;for(const e of line.events){assert.ok(Math.abs(e.start-end)<1e-7);assert.ok(e.minutes>0);end=e.end;}assert.ok(Math.abs(end-line.end)<1e-7);assert.ok(Math.abs(line.events.reduce((n,e)=>n+e.minutes,0)-line.minutes)<1e-7);
}
const same=A.difference(s,s);assert.equal(same.same_workload,true);assert.equal(same.percentages.work,0);
const altered={...s,ids:['OTHER01','OTHER02']},different=A.difference(s,altered);assert.equal(different.same_workload,false);assert.equal(different.service_change,0);assert.equal(different.percentages.cost,null);
const empty={...s,ids:[],assigned:0,vehicles:0,work:0,cost:0,elapsed:0,km:0,time:Object.fromEntries(Object.keys(s.time).map(k=>[k,0])),cost_parts:Object.fromEntries(Object.keys(s.cost_parts).map(k=>[k,0]))};assert.equal(A.difference(empty,empty).percentages.work,null);assert.equal(A.difference(empty,s).service_change,2);
const synthetic={...s,work:s.work+20,cost:s.cost+10,elapsed:s.elapsed+5,time:{...s.time,waiting:s.time.waiting+20},cost_parts:{...s.cost_parts,labor:s.cost_parts.labor+10}},delta=A.difference(synthetic,s);assert.equal(delta.savings.work,20);assert.equal(delta.time.waiting,20);assert.equal(delta.cost.labor,10);
console.log('PASS v0.9.1 analysis: output reconciliation, supported loads, time-window slack, continuous timeline, matched order sets, zero denominators and component differences');

const fs=require('node:fs'),E=require('../frontend/v03/engine.js'),P=require('../frontend/v03/product.js'),C=require('../data/hangzhou-fotile-store-catalog.json');
const records=[];
for(const kind of ['normal','stack','rehandle']){
 const d=P.examples(kind,C,'2026-10-12');for(const mode of ['baseline','nearest','deadline','optimized']){const r=E.solve(d,mode);E.verify(r,d);records.push({kind,mode,metrics:r.metrics,diagnostics:r.diagnostics});}
}
for(const seed of [7,43]){const d=E.simulate(C,seed,'2026-10-12');d.orders=d.orders.slice(0,8);const r=E.solve(d);E.verify(r,d);records.push({kind:'additional-seed',seed,input_orders:d.orders.length,metrics:r.metrics});}
for(const endpoint of ['return','open','parking'])for(const unload of ['direct','limited'])for(const objective of ['time','cost']){const d=P.examples('stack',C,'2026-10-12');d.config={...d.config,endpoint,unload,objective};const r=E.solve(d);E.verify(r,d);records.push({kind:'condition-combination',endpoint,unload,objective,metrics:r.metrics});}
fs.writeFileSync('docs/v09-results.json',JSON.stringify({version:'0.9',query_date:new Date().toISOString(),records},null,2)+'\n');console.log('Validated',records.length,'result snapshots with independent operation replay');

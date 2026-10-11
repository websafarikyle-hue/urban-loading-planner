/* Consume saved public OSRM responses; no network or invented road geometry. */
const fs=require('node:fs'),E=require('../frontend/v03/engine.js'),P=require('../frontend/v03/product.js');
if(!process.argv[2])throw Error('Usage: node scripts/cache_release_roads.cjs <manifest.json>; entries: {route,data,response_file}');
const requests=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const catalog=JSON.parse(fs.readFileSync('data/hangzhou-fotile-store-catalog.json','utf8'));
catalog.travel=JSON.parse(fs.readFileSync('data/fotile-road-cache.json','utf8'));
const edges={};
for(const q of requests){
 const json=JSON.parse(fs.readFileSync(q.response_file,'utf8'));
 for(const edge of P.roadSegments(q.route,q.data,json)){
  // Keep only coordinate identity and geometry; order contents are not road metadata.
  edge.from={id:edge.from.store_id||edge.from.id,lon:edge.from.lon,lat:edge.from.lat};
  edge.to={id:edge.to.store_id||edge.to.id,lon:edge.to.lon,lat:edge.to.lat};edges[edge.key]=edge;
 }
}
const scenario=E.simulate(catalog,42,'2026-10-12'),patched=P.patchTravel(scenario,Object.values(edges));
catalog.travel=patched.data.travel;catalog.travel.provider='OSRM public demo · OpenStreetMap · table + matched route legs';
fs.writeFileSync('data/fotile-road-cache.json',JSON.stringify(catalog.travel,null,2)+'\n');
fs.writeFileSync('data/hangzhou-fotile-store-catalog.json',JSON.stringify(catalog,null,2)+'\n');
fs.writeFileSync('frontend/v03/catalog.js','window.FOTILE_CATALOG='+JSON.stringify(catalog)+';\n');
fs.writeFileSync('frontend/v03/roads.js','/* Public OSRM ordinary driving shapes, coordinate-bound to the scenario. */\nwindow.FOTILE_ROADS='+JSON.stringify({provider:catalog.travel.provider,query_date:new Date().toISOString(),edges})+';\n');
fs.writeFileSync('data/fotile-road-shapes.json',JSON.stringify({provider:catalog.travel.provider,edges})+'\n');
console.log('Cached',Object.keys(edges).length,'road legs; matrix updated:',patched.changed);

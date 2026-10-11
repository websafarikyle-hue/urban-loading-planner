// DOM logic test only. Native touch/visual QA remains a separate check.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('../frontend/v03/engine.js'),C=require('../data/hangzhou-fotile-store-catalog.json');
const nodes=new Map();let calls=0;const context=new Proxy({},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
class Element{
 constructor(id,tag='div',attrs=''){this.id=id;this.tag=tag;this.hidden=false;this.disabled=false;this.value='';this.checked=false;this.dataset={};this.classList={toggle(){}};this.children=[];this._html='';for(const m of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)){const k=m[1],v=m[2]||'';if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,a)=>a.toUpperCase())]=v;else if(k==='value')this.value=v;else if(k==='type')this.type=v;else if(k==='checked')this.checked=true;}}
 set innerHTML(s){this._html=s;this.children=[];for(const m of s.matchAll(/<(input|button|select)\b([^>]*)>/g))this.children.push(new Element('',m[1],m[2]));}
 get innerHTML(){return this._html;}
 querySelectorAll(s){return this.children.filter(n=>s==='input'?n.tag==='input':s.startsWith('[data-')?Object.hasOwn(n.dataset,s.slice(6,-1).replace(/-([a-z])/g,(_,a)=>a.toUpperCase())):false);}
 getContext(){return context;}getBoundingClientRect(){return {width:500,height:330};}setPointerCapture(){}click(){if(this.onclick&&!this.disabled)this.onclick();}
}
const html=fs.readFileSync('frontend/v03/index.html','utf8');for(const m of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g))nodes.set(m[3],new Element(m[3],m[1],m[2]));
const tabs=[...html.matchAll(/<button([^>]*data-tab[^>]*)>/g)].map(m=>new Element('', 'button',m[1]));
const document={getElementById:id=>{if(id==='embedded-worker')return null;assert.ok(nodes.has(id),'existing HTML id '+id);return nodes.get(id);},querySelectorAll:s=>s==='[data-tab]'?tabs:s==='[data-route]'?[...nodes.values()].flatMap(n=>n.querySelectorAll(s)):s==='input,select,button'?[...nodes.values(),...nodes.values()].flatMap(n=>[n,...n.children]).filter(n=>['input','select','button'].includes(n.tag)):[],createElement:()=>new Element('anchor','a')};
class Worker{postMessage(p){calls++;queueMicrotask(()=>{if(this.stopped)return;try{this.onmessage({data:{request_id:p.request_id,result:{baseline:E.solve(p.data,'baseline'),optimized:E.solve(p.data)}}});}catch(e){this.onmessage({data:{request_id:p.request_id,error:e.message}});}});}terminate(){this.stopped=true;}}
const localStorage={data:{},getItem(k){return this.data[k]||null;},setItem(k,v){this.data[k]=v;}};
const window={UrbanEngine:E,FOTILE_CATALOG:C,devicePixelRatio:1,addEventListener(){}};
const sandbox={window,document,Worker,localStorage,console,URL,Blob,setTimeout,clearTimeout,Date,AbortController,fetch:async()=>{throw Error('test network failure');}};vm.createContext(sandbox);vm.runInContext(fs.readFileSync('frontend/v03/app.js','utf8'),sandbox);
const $=id=>nodes.get(id),ui=window.UrbanUI,tick=()=>new Promise(r=>setTimeout(r,5));
assert.equal(ui.getPlan(),null);assert.ok($('status').textContent.includes('20家'));assert.equal((html.match(/data-tab=/g)||[]).length,4);assert.ok($('order-list').innerHTML.includes(C.stores[19].name));
const base=E.simulate(C,7);base.orders=base.orders.slice(0,2);base.config.max_vehicles=2;ui.adopt(base);assert.equal(ui.getDraft().orders.length,2);
// Order changes edit draft first; plan is an immutable prior calculation.
$('solve').click();$('solve').onclick();assert.equal(calls,1);await tick();assert.equal(ui.getPlan().metrics.assigned,2);assert.ok($('route-list').innerHTML.includes('终点'));assert.ok($('map').innerHTML.includes('<polyline'));assert.ok($('diagnostics').textContent.includes('校验通过'));
const prior=JSON.stringify(ui.getPlan());$('fixed-cost').value='550';$('km-cost').value='2';$('labor-cost').value='45';$('apply-costs').click();assert.equal(ui.getDraft().vehicles[0].fixed_cost,550);assert.equal(JSON.stringify(ui.getPlan()),prior);assert.equal($('stale').hidden,false);
$('endpoint').value='open';$('endpoint').onchange();$('objective').value='cost';$('objective').onchange();$('solve').click();await tick();assert.equal(ui.getPlan().config.endpoint,'open');assert.equal($('stale').hidden,true);assert.ok(ui.getPlan().metrics.cost>0);assert.equal(ui.getPlan().routes[0].final_leg.minutes,0);
$('operation-mode').value='loading';$('operation-mode').onchange();assert.equal(ui.cargoState().layout.length,0);$('op-next').click();assert.equal(ui.cargoState().layout.length,1);$('op-all').click();assert.equal(ui.cargoState().layout.length,ui.getPlan().routes[0].packing.layout.length);
$('operation-mode').value='unloading';$('operation-mode').onchange();const n=ui.cargoState().layout.length;$('op-next').click();assert.equal(ui.cargoState().layout.length,n-1);$('op-all').click();assert.ok(ui.cargoState().layout.every(b=>b.order_id!==ui.getPlan().routes[0].order_ids[0]));
// Editing a box and adding/deleting order update the actual input.
const more=$('order-list').querySelectorAll('[data-more]')[0],before=ui.getDraft().orders[0].boxes.length;more.click();assert.equal(ui.getDraft().orders[0].boxes.length,before+1);const editable=$('order-list').querySelectorAll('[data-box]').find(n=>n.dataset.field==='weight');editable.value='33';editable.onchange();assert.equal(ui.getDraft().orders[0].boxes[0].weight,33);
$('add-order').click();assert.equal(ui.getDraft().orders.length,3);$('order-list').querySelectorAll('[data-delete]').at(-1).click();assert.equal(ui.getDraft().orders.length,2);
$('save').click();assert.equal(JSON.parse(localStorage.data['urban-flow-v03-scenes']).length,1);$('load').click();assert.equal(ui.getPlan(),null);
// Invalid import preserves valid draft; failed online query preserves cached roads.
const old=JSON.stringify(ui.getDraft());$('file').files=[{size:3,text:async()=>'{"orders":[]}'}];await $('file').onchange();assert.equal(JSON.stringify(ui.getDraft()),old);assert.ok($('notice').textContent.includes('导入失败'));
await $('road-query').onclick();assert.equal(JSON.stringify(ui.getDraft()),old);assert.ok($('notice').textContent.includes('已有缓存'));
$('seed').value='42';$('date').value='2026-10-12';$('simulate').click();assert.equal(ui.getDraft().orders.length,16);assert.equal(ui.getDraft().vehicles[0].fixed_cost,550);assert.equal(ui.getDraft().config.endpoint,'open');
$('solve').click();$('cancel-solve').click();await tick();assert.equal(ui.getPlan(),null);assert.equal($('solve').disabled,false);
console.log('PASS v0.3 UI: initial readiness; confirmation; immutable result; editable fees; endpoint/objective; real operation replay; box/order editing; scene storage/import; offline failure; seeded simulation; cancellation');

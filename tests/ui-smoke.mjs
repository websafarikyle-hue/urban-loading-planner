// Node-only frontend logic smoke test. This does not replace browser visual QA.
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
const server=spawn("python",["server.py","--port","9876"],{stdio:"ignore",windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try {
 let ready=false;for(let i=0;i<80;i++){try{const r=await fetch("http://127.0.0.1:9876/api/health");if(r.ok){ready=true;break;}}catch{}await delay(50);}
 assert.ok(ready,"Python service must start");
 const nodes=new Map(),docEvents={};
 let beforeCompare=null;const sent=[];
 const context2d=new Proxy({},{get:()=>()=>{}});
 function element(id){
  if(!nodes.has(id))nodes.set(id,{id,innerHTML:"",textContent:"",value:"",hidden:false,disabled:false,dataset:{},events:{},
   classList:{toggle(){}},getBoundingClientRect(){return {width:600,height:296};},
   getContext(){return context2d;},addEventListener(e,f){this.events[e]=f;},setPointerCapture(){},click(){},style:{}});
  return nodes.get(id);
 }
 for(const match of fs.readFileSync("frontend/index.html","utf8").matchAll(/id="([^"]+)"/g))element(match[1]);
 element("dispatch-tab").hidden=false;
 const document={querySelector:s=>element(s.slice(1)),querySelectorAll:s=>s===".nav"?[]:s===".tab-panel"?["dispatch-tab","orders-tab","compare-tab","method-tab"].map(element):s.split(",").filter(s=>s.trim().startsWith("#")&&!s.includes(" ")).map(s=>element(s.trim().slice(1))),
 addEventListener:(e,f)=>{const old=docEvents[e];docEvents[e]=old?event=>{old(event);f(event);}:f;},createElement:()=>element("temp-anchor")};
 const sandbox={document,window:{devicePixelRatio:1,addEventListener(){}},console,
 fetch:async(url,options)=>{if(url==="/api/compare"){sent.push(JSON.parse(options.body));if(beforeCompare){const action=beforeCompare;beforeCompare=null;await action();}}return fetch("http://127.0.0.1:9876"+url,options);},
 localStorage:{values:{},getItem(k){return this.values[k]||null;},setItem(k,v){this.values[k]=v;}},requestAnimationFrame:f=>f(),URL,Blob,setTimeout,clearTimeout};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync("frontend/app.js","utf8"),sandbox);vm.runInContext(fs.readFileSync("frontend/features.js","utf8"),sandbox);
 for(let i=0;i<800&&!element("kpis").innerHTML;i++)await delay(50);
 assert.ok(element("data-badge").textContent.includes("10 单 / 40 箱"));
 assert.ok(element("route-map").innerHTML.includes("<polyline"));
 assert.ok(element("unload-detail").innerHTML.includes("O"));
 // A proposed change must not modify the data until confirmation.
 element("assistant-input").value="新增一单，14点前送达";
 element("assistant-form").onsubmit({preventDefault(){}});
 assert.ok(element("assistant-preview").innerHTML.includes("14:00"));
 assert.ok(element("data-badge").textContent.includes("10 单"));
 element("cancel-draft").onclick();assert.equal(element("assistant-preview").innerHTML,"");
 element("assistant-form").onsubmit({preventDefault(){}});
 await element("confirm-draft").onclick();
 assert.ok(element("data-badge").textContent.includes("11 单 / 42 箱"));
 // Vehicle changes must trigger a plan that excludes the unavailable vehicle.
 element("assistant-input").value="V02停用";
 element("assistant-form").onsubmit({preventDefault(){}});
 await element("confirm-draft").onclick();
 assert.ok(!element("vehicle-editor").innerHTML.includes('data-v="V02"'));
 // Reset restores the initial scenario.
 await element("reset-btn").onclick();
 assert.ok(element("data-badge").textContent.includes("10 单 / 40 箱"));
 assert.ok(element("vehicle-editor").innerHTML.includes('data-v="V02"'));
 // Editor fields are drafts; cancellation preserves the previous result and input.
 const initialKpis=element("kpis").innerHTML;
 docEvents.change({target:{dataset:{due:"O01"},value:"11:00"}});
 assert.ok(element("edit-preview").innerHTML.includes("待确认"));
 assert.equal(element("kpis").innerHTML,initialKpis);
 element("cancel-edits").onclick();
 await element("solve-btn").onclick();
 assert.equal(sent.at(-1).data.orders[0].due,600);
 // Failed computation must not apply a confirmed draft to the active data.
 docEvents.change({target:{dataset:{due:"O01"},value:"11:00"}});
 beforeCompare=async()=>{throw Error("模拟连接失败");};
 await element("confirm-edits").onclick();
 assert.ok(element("notice").textContent.includes("改动尚未生效"));
 assert.equal(element("kpis").innerHTML,initialKpis);
 element("cancel-edits").onclick();
 await element("solve-btn").onclick();
 assert.equal(sent.at(-1).data.orders[0].due,600);
 // Confirmation applies multiple field edits in one immutable request.
 docEvents.change({target:{dataset:{due:"O01"},value:"11:00"}});
 docEvents.change({target:{dataset:{v:"V01",field:"fixed_cost"},value:"250"}});
 await element("confirm-edits").onclick();
 assert.equal(sent.at(-1).data.orders[0].due,660);
 assert.equal(sent.at(-1).data.vehicles[0].fixed_cost,250);
 assert.equal(element("edit-preview").innerHTML,"");
 // An in-flight request blocks a second change and a second solve.
 let release;beforeCompare=()=>new Promise(resolve=>release=resolve);
 const pending=element("solve-btn").onclick();
 assert.ok(release);const count=sent.length;
 docEvents.change({target:{dataset:{due:"O01"},value:"12:00"}});
 await element("solve-btn").onclick();
 assert.equal(sent.length,count);assert.ok(element("notice").textContent.includes("正在计算"));
 release();await pending;
 assert.equal(sent.at(-1).data.orders[0].due,660);
 // Invalid new instructions cannot leave an older draft actionable.
 element("assistant-input").value="V02停用";element("assistant-form").onsubmit({preventDefault(){}});
 element("assistant-input").value="没有有效指令";element("assistant-form").onsubmit({preventDefault(){}});
 assert.equal(element("assistant-preview").innerHTML,"");
 // An imported scene invalidates any pending assistant draft only on success.
 element("assistant-input").value="V02停用";element("assistant-form").onsubmit({preventDefault(){}});
 const imported=JSON.parse(fs.readFileSync("data/sample.json","utf8"));delete imported.start;
 await element("file-input").onchange({target:{value:"scene.json",files:[{size:10000,text:async()=>JSON.stringify(imported)}]}});
 assert.equal(element("assistant-preview").innerHTML,"");
 element("assistant-input").value="新增一单，14点前送达";element("assistant-form").onsubmit({preventDefault(){}});
 await element("confirm-draft").onclick();
 assert.equal(sent.at(-1).data.orders.at(-1).ready,480);
 assert.ok(element("data-badge").textContent.includes("11 单 / 42 箱"));
 // The known service-priority counterexample must be visible to the dispatcher.
 const counterexample=JSON.parse(fs.readFileSync("docs/audit-results.json","utf8")).counterexample.data;
 await element("file-input").onchange({target:{value:"counterexample.json",files:[{size:10000,text:async()=>JSON.stringify(counterexample)}]}});
 assert.equal(element("notice").textContent,"");
 assert.ok(element("kpis").innerHTML.includes("2 / 2"));
 // Actual v0.2 operations, details and immutable box edits.
 await element("reset-btn").onclick();
 assert.ok(element("service-detail").textContent.includes("作业估计"));
 element("operation-mode").onchange({target:{value:"loading"}});
 assert.equal(vm.runInContext("visibleCargo(current()).length",sandbox),0);
 element("operation-next").onclick();assert.equal(vm.runInContext("visibleCargo(current()).length",sandbox),1);
 element("operation-mode").onchange({target:{value:"unloading"}});
 const beforeCount=vm.runInContext("visibleCargo(current()).length",sandbox);
 element("operation-next").onclick();assert.equal(vm.runInContext("visibleCargo(current()).length",sandbox),beforeCount-1);
 element("cargo-picker").onchange({target:{value:vm.runInContext("current().packing.layout[0].id",sandbox)}});
 assert.ok(element("box-detail").textContent.includes("尺寸"));
 const oldWeight=vm.runInContext("data.orders[0].boxes[0].weight",sandbox),bid=vm.runInContext("data.orders[0].boxes[0].id",sandbox);
 docEvents.change({target:{dataset:{box:bid,field:"weight"},value:String(oldWeight+1)}});
 assert.equal(vm.runInContext("data.orders[0].boxes[0].weight",sandbox),oldWeight);
 await element("confirm-edits").onclick();assert.equal(vm.runInContext("data.orders[0].boxes[0].weight",sandbox),oldWeight+1);
 element("save-scene-btn").onclick();assert.ok(element("saved-scenes").innerHTML.includes("10单"));
 await element("road-sample-btn").onclick();assert.ok(element("travel-note").textContent.includes("OSRM"));
 assert.ok(element("route-map").innerHTML.includes("OpenStreetMap"));
 const oldLon=vm.runInContext("data.orders[0].lon",sandbox);
 docEvents.change({target:{dataset:{order:"O01",field:"lon"},value:String(oldLon+.001)}});
 assert.equal(vm.runInContext("data.orders[0].lon",sandbox),oldLon);
 assert.ok(vm.runInContext("data.travel",sandbox));assert.equal(vm.runInContext("editorDraft.travel",sandbox),undefined);
 element("cancel-edits").onclick();
 // Configurable service coefficients and an added order are confirmed atomically.
 docEvents.change({target:{dataset:{policy:"setup_minutes"},value:"4"}});
 assert.equal(vm.runInContext("data.service_policy",sandbox),undefined);
 await element("confirm-edits").onclick();assert.equal(vm.runInContext("data.service_policy.setup_minutes",sandbox),4);
 assert.ok(element("service-detail").textContent.includes("到站准备 4 分钟"));
 for(const [id,value] of Object.entries({"new-name":"测试模拟地点","new-customer":"SIM-C99","new-lon":"120.16","new-lat":"30.27","new-ready":"08:00","new-due":"18:00","new-count":"1","new-box-type":"small"}))element(id).value=value;
 element("new-order-form").onsubmit({preventDefault(){}});
 assert.equal(vm.runInContext("data.orders.length",sandbox),10);
 assert.equal(vm.runInContext("editorDraft.orders.length",sandbox),11);
 await element("confirm-edits").onclick();assert.equal(vm.runInContext("data.orders.length",sandbox),11);
 assert.ok(element("plan-changes").textContent.includes("本次变化"));
 console.log("PASS: v0.2 loading/unloading replay; box and coordinate drafts; scene storage; cached roads; service estimates; prior checks; actual APIs; draft cancel/confirm; atomic failure; in-flight edit guard; invalid command; import clears stale draft; default start");
} finally {server.kill();}

const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'outputs');fs.mkdirSync(artifacts,{recursive:true});const profile=fs.mkdtempSync(path.join(os.tmpdir(),'urban-v09-browser-'));const bin=process.env.URBAN_BROWSER_BIN||['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(p=>fs.existsSync(p));if(!bin)throw Error('Set URBAN_BROWSER_BIN to a Chromium executable');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname+(req.url==='/'?'index.html':''));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}try{const b=fs.readFileSync(file),ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json'})[ext]||'application/octet-stream');res.end(b);}catch{res.writeHead(404);res.end();}});server.listen(8768,'127.0.0.1');
const child=spawn(bin,['--headless=new','--no-sandbox','--disable-gpu','--in-process-gpu','--disable-extensions','--disable-background-networking','--no-first-run','--remote-debugging-port=9236','--user-data-dir='+profile,'about:blank'],{windowsHide:true});
let stderr='';child.stderr.on('data',x=>stderr+=x);child.on('exit',code=>console.log('Chrome exit',code));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,id=0,pending=new Map(),errors=[];
async function command(method,params={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression){const x=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(x.exceptionDetails)throw Error(JSON.stringify(x.exceptionDetails));return x.result.value;}
async function waitFor(expression,timeout=50000){const until=Date.now()+timeout;while(Date.now()<until){if(await evaluate(expression))return;await sleep(300);}throw Error('Timed out '+expression);}
(async()=>{let targets;for(let i=0;i<50;i++){for(const host of ['127.0.0.1','[::1]']){try{targets=await fetch('http://'+host+':9236/json').then(x=>x.json());break;}catch{}}if(targets)break;await sleep(300);}
 if(!targets)throw Error('Browser debugging port unavailable: '+stderr.slice(-1500));
 ws=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){const p=pending.get(x.id);pending.delete(x.id);if(x.error)p.reject(Error(JSON.stringify(x.error)));else p.resolve(x.result);}else if(x.method==='Runtime.exceptionThrown')errors.push(x.params);};
 await command('Runtime.enable');await command('Page.enable');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await command('Page.navigate',{url:'http://127.0.0.1:8768/'});
 await waitFor('!!window.UrbanUI',10000);await evaluate("document.getElementById('solve').click()");await waitFor('!!window.UrbanUI.getPlan() && !document.getElementById("solve").disabled');
 assert.equal(await evaluate('window.UrbanUI.getPlan().version'),'0.9.4');assert.equal(await evaluate('window.UrbanUI.getPlan().metrics.assigned'),16);assert.ok(await evaluate('Object.keys(window.UrbanUI.getGeometry()).length<=window.UrbanUI.getPlan().routes.length'));assert.ok(await evaluate('window.UrbanUI.getComparisons().length>=1'));
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));fs.writeFileSync(path.join(artifacts,'v09-desktop.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));

 // Inspect the revised comparison and the exact button spacing reported by the user.
 await evaluate("document.querySelector('[data-tab=compare]').click()");
 assert.equal(await evaluate('document.querySelectorAll(".bar-row").length'),2*(await evaluate('window.UrbanUI.getComparisons().length')+1));
 assert.ok(await evaluate('document.querySelectorAll(".timeline-segment").length>10'));
 assert.ok(await evaluate('document.getElementById("comparison-insights").textContent.includes("结束")'));
 const overlaps=()=>evaluate(`(()=>{const groups=[...document.querySelectorAll('.button-row,.map-actions,.simulator,.tabs,.fields')];for(const group of groups){const controls=[...group.children].filter(e=>['BUTTON','SELECT','INPUT','LABEL'].includes(e.tagName)).map(e=>({r:e.getBoundingClientRect(),text:e.textContent})).filter(e=>e.r.width&&e.r.height);for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i].r,b=controls[j].r;if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5)return controls[i].text+' / '+controls[j].text;}}return '';})()`);
 for(const width of [1366,1024,768,390,320]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<700});
  await evaluate('window.scrollTo(0,0)');await sleep(100);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'no horizontal overflow at '+width);
  assert.equal(await overlaps(),'','no overlapping controls at '+width);
 }
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await evaluate('document.getElementById("compare-panel").scrollIntoView()');
 fs.writeFileSync(path.join(artifacts,'v091-comparison-desktop.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
 await evaluate('document.getElementById("compare-reference").value=String(Math.min(2,UrbanUI.getComparisons().length-1));document.getElementById("compare-reference").onchange()');
 assert.ok(await evaluate('document.getElementById("comparison-insights").textContent.includes(UrbanUI.getComparisons().at(-1).name)'));
 await evaluate('document.querySelector(".timeline-segment").click()');assert.ok(await evaluate('document.getElementById("timeline-detail").textContent.includes("min")'));
 await evaluate("document.querySelector('[data-tab=help]').click();window.scrollTo(0,0)");
 assert.ok(await evaluate('["settings-panel","storage-panel","methods-panel"].every(id=>getComputedStyle(document.getElementById(id)).display==="none")'));
 fs.writeFileSync(path.join(artifacts,'v091-help.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
 await evaluate("document.querySelector('[data-tab=plan]').click()");await evaluate('document.getElementById("vehicle-tabs").scrollIntoView()');
 assert.ok(await evaluate('document.getElementById("map-actions").getBoundingClientRect().top-document.getElementById("vehicle-tabs").getBoundingClientRect().bottom>=16'));
 assert.equal(await overlaps(),'');fs.writeFileSync(path.join(artifacts,'v091-map-buttons.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});
 await evaluate("document.querySelector('[data-tab=compare]').click();document.getElementById('compare-panel').scrollIntoView()");assert.equal(await overlaps(),'');
 fs.writeFileSync(path.join(artifacts,'v091-comparison-mobile.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await evaluate("document.querySelector('[data-tab=cargo]').click()");assert.ok(await evaluate('document.getElementById("cargo-canvas").width>0'));await evaluate('document.getElementById("cargo-panel").scrollIntoView()');fs.writeFileSync(path.join(artifacts,'v09-cargo.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate("document.querySelector('[data-tab=plan]').click()");await sleep(300);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
 fs.writeFileSync(path.join(artifacts,'v09-mobile.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
 await evaluate("document.getElementById('example-rehandle').click();document.getElementById('solve').click()");await waitFor('!!window.UrbanUI.getPlan() && !document.getElementById("solve").disabled');assert.equal(await evaluate('window.UrbanUI.getPlan().metrics.rehandles'),1);
 await evaluate("document.querySelector('[data-tab=cargo]').click();let e=document.getElementById('operation-mode');e.value='unloading';e.onchange()");assert.equal(await evaluate('window.UrbanUI.cargoState().ops.length'),6);await evaluate("document.getElementById('op-all').click();document.getElementById('next-stop').click()");assert.equal(await evaluate('window.UrbanUI.cargoState().stop'),1);
 // Exercise actual DOM NodeLists (the old VM mock returned an Array).
 await evaluate("document.querySelector('[data-tab=orders]').click();document.querySelector('[data-sku]').value='KIT'");
 const beforeAdd=await evaluate('UrbanUI.getDraft().orders[0].boxes.length');
 await evaluate("document.querySelector('[data-sku-add]').click()");
 assert.equal(await evaluate('UrbanUI.getDraft().orders[0].boxes.length'),beforeAdd+1);
 assert.equal(await evaluate('UrbanUI.getDraft().orders[0].boxes.at(-1).code'),'KIT');
 await evaluate("document.getElementById('print-plan').click()");assert.ok(await evaluate("document.getElementById('notice').textContent.includes('确认重算')"));
 // Minimal valid imports normalize optional UI fields; invalid metadata is atomic.
 await evaluate("{const d=UrbanUI.getDraft();delete d.end_point;delete d.config;d.vehicles.forEach(v=>v.enabled=true);UrbanUI.adopt(d)}");
 assert.equal(await evaluate('UrbanUI.getDraft().config.endpoint'),'return');
 assert.ok(await evaluate('!!UrbanUI.getDraft().end_point'));
 assert.ok(await evaluate("(()=>{const before=JSON.stringify(UrbanUI.getDraft());try{UrbanUI.adopt({...UrbanUI.getDraft(),provenance:{bad:true}})}catch{}return before===JSON.stringify(UrbanUI.getDraft())})()"));
 await evaluate("{const d=UrbanUI.getDraft();d.orders.forEach(o=>{o.ready=0;o.due=1});UrbanUI.adopt(d);document.getElementById('solve').click()}");await waitFor('!!window.UrbanUI.getPlan() && !document.getElementById("solve").disabled');
 assert.equal(await evaluate('UrbanUI.getPlan().metrics.assigned'),0);
 assert.ok(await evaluate("['cargo-stats','box-info','operation-list','service-breakdown'].every(id=>!document.getElementById(id).textContent)"));
 await evaluate("document.querySelector('[data-tab=help]').click()");assert.ok(await evaluate('!document.getElementById("help-panel").hidden'));assert.equal(errors.length,0);
 // A real DOM must retain the last checkpoint when the worker stalls.
 await evaluate(`window.__realWorker=window.Worker;window.__realTimeout=window.setTimeout;window.Worker=class{postMessage(p){const r=UrbanEngine.solve(p.data,'baseline');this.onmessage({data:{type:'progress',request_id:p.request_id,result:{baseline:r,optimized:r}}});}terminate(){}};window.setTimeout=(fn,ms,...args)=>window.__realTimeout(fn,ms===45000?100:ms,...args);UrbanUI.adopt(UrbanProduct.examples('stack',FOTILE_CATALOG));document.getElementById('solve').click()`);
 await waitFor('!!UrbanUI.getPlan()&&!document.getElementById("solve").disabled');
 assert.equal(await evaluate('UrbanUI.getPlan().metrics.assigned'),4);
 assert.equal(await evaluate('UrbanUI.getPlan().diagnostics.time_limit_hit'),true);
 assert.ok(await evaluate('document.getElementById("notice").textContent.includes("保留")'));
 await evaluate('window.Worker=window.__realWorker;window.setTimeout=window.__realTimeout');
 await command('Page.navigate',{url:'http://127.0.0.1:8768/standalone-demo.html'});await waitFor('!!window.UrbanUI',10000);await evaluate("document.getElementById('example-stack').click();document.getElementById('solve').click()");await waitFor('!!window.UrbanUI.getPlan() && !document.getElementById("solve").disabled');assert.equal(await evaluate('window.UrbanUI.getPlan().metrics.stacked_boxes'),12);assert.equal(await evaluate('Object.keys(window.UrbanUI.getGeometry()).length'),1);assert.equal(errors.length,0);
 console.log('PASS v0.9.1 real Chrome browser: analyses, time/cost charts, interactive timeline, help isolation, control overlap and widths 320–1440; default Worker, road shapes, three comparisons, desktop/mobile width, 3D canvas, rehandle playback, next stop and help');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>{ws?.close();child.kill();server.close();});

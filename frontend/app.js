"use strict";
const $=s=>document.querySelector(s),colors=["#168d79","#d59458","#6c85ae","#bb79a9","#56a0ad"];
let data,comparison,selected=0,stopSelected=null,busy=false,draft=null,editorDraft=null,editorChanges=new Map(),camera={angle:-.72,elevation:.46,zoom:1},drag=null;
const clone=value=>JSON.parse(JSON.stringify(value));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const percent=v=>(v*100).toFixed(1)+"%";
const clock=m=>{m=Math.round(m);return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");};
const volume=o=>o.boxes.reduce((s,b)=>s+b.length*b.width*b.height/1e6,0),weight=o=>o.boxes.reduce((s,b)=>s+b.weight,0);
function parseClock(s){if(!/^\d{1,2}:\d{2}$/.test(s))throw Error("时间格式应为 HH:MM");const [h,m]=s.split(":").map(Number);if(h>23||m>59)throw Error("时间范围不正确");return h*60+m;}
function notice(message,error=false){$("#notice").textContent=message;$("#notice").classList.toggle("error",error);$("#notice").hidden=!message;}
async function api(url,body){const r=await fetch(url,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{});let j;try{j=await r.json();}catch{throw Error("服务未返回有效 JSON");}if(!r.ok)throw Error(j.error||"请求失败");return j;}
async function generate(candidate=editorDraft||data){
 if(busy||!candidate)return false;const snapshot=clone(candidate);busy=true;setBusy(true);$("#loading").hidden=false;notice("");
 try{const result=await api("/api/compare",{data:snapshot});recordPlanChange(comparison,result);data=snapshot;comparison=result;clearDrafts();selected=Math.min(selected,Math.max(0,comparison.optimized.routes.length-1));stopSelected=null;resetOperations();render();
 if(comparison.optimized.unassigned.length){const worse=comparison.optimized.metrics.assigned<comparison.baseline.metrics.assigned;notice((worse?"注意：联合方案完成订单数少于基础规则，请核对运力分配。":"")+comparison.optimized.unassigned.length+" 单未分配："+comparison.optimized.unassigned.map(o=>o.order_id+" — "+o.reasons.join("；")).join(" / "),true);}
 return true;
 }catch(e){notice("计算失败，改动尚未生效，当前方案仍对应上次已确认数据："+e.message,true);return false;}finally{busy=false;setBusy(false);$("#loading").hidden=true;}
}
function setBusy(value){
 document.querySelectorAll("[data-due], [data-v], [data-box], [data-order], [data-policy], .scenario-toolbar button, #new-order-form input, #new-order-form button, #reference-btn, #solve-btn, #reset-btn, #import-btn, #file-input, #assistant-input, #assistant-form button, #confirm-draft, #cancel-draft, #confirm-edits, #cancel-edits").forEach(el=>el.disabled=value);
}
function clearDrafts(){draft=null;editorDraft=null;editorChanges.clear();$("#assistant-preview").innerHTML="";$("#edit-preview").innerHTML="";$("#solve-btn").textContent="↗ 生成联合方案";}
function renderEditorDraft(){
 $("#edit-preview").innerHTML='<div class="draft"><p>待确认修改：'+[...editorChanges.values()].map(esc).join("；")+'。当前方案对应上次已确认数据。</p><button id="confirm-edits" class="button primary">确认修改并重算</button> <button id="cancel-edits" class="button secondary">取消修改</button></div>';
 $("#confirm-edits").onclick=()=>generate();
 $("#cancel-edits").onclick=()=>{if(busy)return;clearDrafts();renderOrders();notice("已取消修改，保留已确认数据与方案。");};
 $("#solve-btn").textContent="确认修改并生成方案";
}
function current(){return comparison?.optimized.routes[selected];}
function render(){
 const m=comparison.optimized.metrics,b=comparison.baseline.metrics,comparable=m.assigned===b.assigned;
 const improvement=comparable&&b.cost>0?(b.cost-m.cost)/b.cost:null,kmDiff=comparable?b.km-m.km:null;
 const cards=[
 ["运输成本",m.cost.toLocaleString("zh-CN",{maximumFractionDigits:2}),"元",improvement!==null?(improvement>=0?"↓ ":"↑ ")+percent(Math.abs(improvement))+" 相比基础规则":"完成订单数不同，请结合服务率比较"],
 ["配送里程",m.km.toFixed(2),"km",kmDiff!==null?(kmDiff>=0?"减少 ":"增加 ")+Math.abs(kmDiff).toFixed(2)+" km":"当前距离来源见道路说明"],
 ["按时完成",m.assigned+" / "+m.orders,"单",percent(m.on_time_rate)+" 全订单按时完成率"],
 ["车辆与装载",String(m.vehicles),"辆",percent(m.volume_utilization)+" 车厢体积利用率"]];
 $("#kpis").innerHTML=cards.map(([title,val,unit,foot],i)=>'<div class="kpi"><div class="kpi-top"><span>'+title+'</span><span class="kpi-icon">'+["¥","↗","◷","▦"][i]+'</span></div><div class="kpi-value">'+val+'<small>'+unit+'</small></div><div class="kpi-foot '+(comparable&&((i===0&&improvement>=0)||(i===1&&kmDiff>=0))?"positive":"")+'">'+esc(foot)+'</div></div>').join("");
 $("#data-badge").textContent="模拟数据 · "+data.orders.length+" 单 / "+data.orders.reduce((n,o)=>n+o.boxes.length,0)+" 箱";
 renderMap();renderRoute();renderOrders();renderCompare();drawCargo();renderFeatures();
}
function renderRoute(){
 const r=current();
 if(!r){$("#truck-subtitle").textContent="暂无装载方案";$("#timeline").innerHTML='<div class="empty">暂无可行路线，请检查订单与车辆资源</div>';$("#unload-detail").innerHTML="";$("#load-stats").innerHTML="";$("#route-label").textContent="未分配";$("#checks").innerHTML='<div class="empty">当前没有可验证的配送方案</div>';return;}
 $("#truck-subtitle").textContent=r.vehicle.id+" · "+r.vehicle.length+" × "+r.vehicle.width+" × "+r.vehicle.height+" cm";
 $("#route-label").textContent=r.vehicle.id+" · "+r.packing.layout.length+" 件箱货";
 $("#load-stats").innerHTML='<span>载重<strong>'+r.weight_kg+' / '+r.vehicle.capacity_kg+' kg</strong></span><span>体积<strong>'+percent(r.volume_utilization)+'</strong></span><span>校验<strong>通过</strong></span>';
 if(!stopSelected||!r.order_ids.includes(stopSelected))stopSelected=r.order_ids[0];
 $("#timeline").innerHTML=r.stops.map((s,i)=>'<button class="stop '+(s.order_id===stopSelected?"selected":"")+'" data-unload="'+esc(s.order_id)+'"><span class="stop-number">'+(i+1)+'</span><strong>'+esc(s.name.split("·")[0])+'</strong><small>到达 '+clock(s.arrival)+' · 卸货 '+clock(s.service_start)+'–'+clock(s.service_end)+'</small><small class="on-time">✓ 完成截止 '+clock(s.ready)+'–'+clock(s.due)+'</small></button>').join("");
 const step=r.packing.unloading.steps.find(s=>s.order_id===stopSelected),order=data.orders.find(o=>o.id===stopSelected);
 $("#unload-detail").innerHTML='<div class="unload-info"><div><h3>第 '+step.stop+' 站 · '+esc(step.order_id)+'</h3><p>'+step.boxes.length+' 箱 · '+weight(order)+' kg<br>按序取出，无需搬开其他站货物</p></div><div class="box-list">'+step.boxes.map((b,i)=>'<div class="box-chip"><b>'+(i+1)+'</b>'+esc(b.box_id)+'<br><span>'+b.position.map(Math.round).join(" / ")+' cm</span></div>').join("")+'</div></div>';
 $("#checks").innerHTML=[["箱件完整性",r.packing.layout.length+" 件 / 无重复"],["载重、越界与重叠","通过"],["支撑、易碎与堆叠","通过"],["逐站卸货可达性","通过"],["求解方法","启发式 / 无最优性证明"]].map(([a,b])=>'<div class="check-row"><span>'+a+'</span><span>'+b+'</span></div>').join("");
}
function renderOrders(){
 const source=editorDraft||data,assigned=new Set(comparison?.optimized.routes.flatMap(r=>r.order_ids)||[]);
 $("#orders-body").innerHTML=source.orders.map(o=>'<tr><td><strong>'+esc(o.id)+'</strong><small>'+esc(o.name+" / "+(o.customer_id||"未指定货主"))+'</small></td><td>'+clock(o.ready)+' — <input type="time" aria-label="'+esc(o.id)+' 最晚完成卸货" value="'+clock(o.due)+'" data-due="'+esc(o.id)+'"></td><td>'+o.boxes.length+' 件</td><td>'+weight(o)+' kg</td><td>'+volume(o).toFixed(2)+' m³</td><td><span class="order-status '+(assigned.has(o.id)?"":"warning")+'">'+(editorDraft?"待确认修改":assigned.has(o.id)?"已分配":"未分配")+'</span></td></tr>').join("");
 $("#vehicle-editor").innerHTML=source.vehicles.map(v=>'<div class="vehicle-edit"><h3>'+esc(v.id)+' <span>'+esc(v.name.split("·")[1]||"")+'</span></h3>'+[["capacity_kg","载重 kg"],["length","车厢长 cm"],["width","车厢宽 cm"],["height","车厢高 cm"],["fixed_cost","固定费用 元"],["cost_per_km","每公里费用 元"]].map(([k,label])=>'<label class="vehicle-field">'+label+'<input type="number" min="'+(k.includes("cost")?0:1)+'" step="'+(k==="cost_per_km"?.1:1)+'" value="'+v[k]+'" data-v="'+esc(v.id)+'" data-field="'+k+'"></label>').join("")+'</div>').join("");
 renderEditors();
}
function renderCompare(){
 const b=comparison.baseline.metrics,o=comparison.optimized.metrics;
 const rows=[["使用车辆",b.vehicles,o.vehicles,"辆"],["配送里程",b.km,o.km,"km"],["运输成本",b.cost,o.cost,"元"],["按时完成订单",b.assigned+" / "+b.orders,o.assigned+" / "+o.orders,"单"],["车厢体积利用率",percent(b.volume_utilization),percent(o.volume_utilization),""],["其他站货物搬开次数",b.rehandles,o.rehandles,"次"]];
 $("#comparison").innerHTML='<table class="comparison-table"><thead><tr><th>指标</th><th>基础规则</th><th>联合优化</th></tr></thead><tbody>'+rows.map(([label,a,c,u])=>'<tr><td>'+label+'</td><td>'+a+' '+u+'</td><td><strong>'+c+' '+u+'</strong></td></tr>').join("")+'</tbody></table><p class="compare-note">基础规则按输入顺序逐车追加；联合优化优先服务完成量，再比较成本，执行运力修复、局部搜索和可行路线池组合。两者执行相同的装载与卸货检查。费用降低不保证在每份输入中发生；未分配订单必须同时比较。</p>';
 const d=comparison.optimized.diagnostics;
 $("#diagnostics").innerHTML=[[d.packing_checks,"装载候选检查"],[d.packing_rejections,"装载失败反馈"],[d.local_search_improvements,"局部搜索改进"],[d.duration_ms+" ms","本次求解耗时"]].map(([v,label])=>'<div class="diag"><strong>'+v+'</strong><span>'+label+'</span></div>').join("");
}
function rgb(hex,ratio){const n=parseInt(hex.slice(1),16);return "rgb("+[(n>>16)&255,(n>>8)&255,n&255].map(v=>Math.round(v*ratio)).join(",")+")";}
function drawCargo(){
 const canvas=$("#cargo-canvas"),r=current();if(!canvas||$("#dispatch-tab").hidden)return;
 const bounds=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;canvas.width=bounds.width*dpr;canvas.height=bounds.height*dpr;
 const ctx=canvas.getContext("2d");ctx.scale(dpr,dpr);const w=bounds.width,h=bounds.height;
 if(!r){ctx.fillStyle="#8fa3a8";ctx.font="12px sans-serif";ctx.textAlign="center";ctx.fillText("暂无装载布局",w/2,h/2);return;}
 const L=r.vehicle.length,W=r.vehicle.width,H=r.vehicle.height;
 const scale=Math.min(w/(L+W)*1.25,h/(H+W*.6+L*.5)*1.25)*camera.zoom,c=Math.cos(camera.angle),s=Math.sin(camera.angle),e=camera.elevation;
 function project(x,y,z){x-=L/2;y-=W/2;const side=x*c-y*s,depth=x*s+y*c;return [w/2+side*scale,h*.68+(depth*Math.sin(e)-z*Math.cos(e))*scale,depth];}
 function polygon(vertices,fill,stroke="#ffffff88",line=.6){ctx.beginPath();vertices.forEach((v,i)=>{const p=project(...v);i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);});ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}
 polygon([[0,0,0],[L,0,0],[L,W,0],[0,W,0]],"#dce6e2","#acbcb4",1);
 const outline=[[0,0,0],[L,0,0],[L,W,0],[0,W,0],[0,0,H],[L,0,H],[L,W,H],[0,W,H]];
 [[0,4],[1,5],[2,6],[3,7],[4,5],[5,6],[6,7],[7,4]].forEach(([a,b])=>{const p=project(...outline[a]),q=project(...outline[b]);ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.strokeStyle="#b9c9c2";ctx.lineWidth=.8;ctx.stroke();});
 const visible=visibleCargo(r);cargoHits=[];const boxes=[...visible].sort((a,b)=>project(a.x+a.dx/2,a.y+a.dy/2,a.z)[2]-project(b.x+b.dx/2,b.y+b.dy/2,b.z)[2]);
 boxes.forEach(b=>{const {x,y,z,dx,dy,dz}=b,color=colors[(b.stop-1)%colors.length];const active=boxSelected?b.id===boxSelected:b.order_id===stopSelected;ctx.globalAlpha=active?1:.43;
 const xface=s>=0?x+dx:x,yface=c>=0?y+dy:y;
 polygon([[xface,y,z],[xface,y+dy,z],[xface,y+dy,z+dz],[xface,y,z+dz]],rgb(color,.72));
 polygon([[x,yface,z],[x+dx,yface,z],[x+dx,yface,z+dz],[x,yface,z+dz]],rgb(color,.86));
 polygon([[x,y,z+dz],[x+dx,y,z+dz],[x+dx,y+dy,z+dz],[x,y+dy,z+dz]],color,"#ffffffbb",.8);
 cargoHits.push({id:b.id,faces:[[[xface,y,z],[xface,y+dy,z],[xface,y+dy,z+dz],[xface,y,z+dz]],[[x,yface,z],[x+dx,yface,z],[x+dx,yface,z+dz],[x,yface,z+dz]],[[x,y,z+dz],[x+dx,y,z+dz],[x+dx,y+dy,z+dz],[x,y+dy,z+dz]]].map(f=>f.map(v=>project(...v)))});
 if(active){const p=project(x+dx/2,y+dy/2,z+dz);ctx.font="9px Segoe UI";ctx.textAlign="center";ctx.fillStyle="white";ctx.fillText(b.id,p[0],p[1]+3);}});
 ctx.globalAlpha=1;const a=project(0,0,0),b=project(0,W,0);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.strokeStyle="#3da28b";ctx.lineWidth=4;ctx.stroke();
 ctx.fillStyle="#76958a";ctx.font="9px Segoe UI";ctx.textAlign="center";ctx.fillText("车门",(a[0]+b[0])/2,(a[1]+b[1])/2+15);
 ctx.fillStyle="#7a8d91";ctx.textAlign="left";ctx.fillText(visible.length+" / "+r.packing.layout.length+" 箱 · 第 "+(r.order_ids.indexOf(stopSelected)+1)+" 站高亮",14,21);
}
function switchTab(tab){
 document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.tab===tab));document.querySelectorAll(".tab-panel").forEach(n=>n.hidden=n.id!==tab+"-tab");
 const titles={dispatch:["让每一趟配送，更有把握。","从订单到路线，从车厢到卸货，一份方案贯穿整个配送过程。"],orders:["订单与车辆，统一管理。","修改时间窗和运力参数，再生成新的联合方案。"],compare:["每一次优化，都有据可查。","同一份数据，对比费用、里程、服务率与装载利用率。"],method:["算法有依据，数据有边界。","查看联合求解流程、论文依据与演示限制。"]};
 $("#page-title").textContent=titles[tab][0];$("#page-subtitle").textContent=titles[tab][1];if(tab==="dispatch")requestAnimationFrame(drawCargo);
}
document.addEventListener("click",event=>{
 const nav=event.target.closest("[data-tab]");if(nav)switchTab(nav.dataset.tab);
 const vehicle=event.target.closest("[data-vehicle]");if(vehicle){selected=Number(vehicle.dataset.vehicle);stopSelected=null;resetOperations();renderMap();renderRoute();drawCargo();renderOperations();}
 const map=event.target.closest("[data-route]");if(map){selected=Number(map.dataset.route);stopSelected=map.dataset.stop||null;resetOperations();renderMap();renderRoute();drawCargo();renderOperations();}
 const stop=event.target.closest("[data-unload]");if(stop){stopSelected=stop.dataset.unload;resetOperations();renderRoute();drawCargo();renderOperations();}
 const cmd=event.target.closest("[data-command]");if(cmd)$("#assistant-input").value=cmd.dataset.command;
});
document.addEventListener("change",event=>{const el=event.target;if(!el.dataset.due&&!el.dataset.v)return;try{
 if(busy)throw Error("正在计算，请等待结果后修改。");if(draft)throw Error("请先确认或取消助手变更草案。");
 const candidate=clone(editorDraft||data);
 if(el.dataset.due){const o=candidate.orders.find(o=>o.id===el.dataset.due),due=parseClock(el.value);if(due<o.ready)throw Error("最晚完成卸货不能早于时间窗起点");o.due=due;editorChanges.set(o.id+".due",o.id+" 完成卸货截止时间改为 "+clock(due));}
 if(el.dataset.v){const value=Number(el.value);if(el.value.trim()===""||!Number.isFinite(value)||value<(el.dataset.field.includes("cost")?0:1))throw Error("车辆参数范围无效");candidate.vehicles.find(v=>v.id===el.dataset.v)[el.dataset.field]=value;const names={capacity_kg:"载重",length:"车厢长",width:"车厢宽",height:"车厢高",fixed_cost:"固定费用",cost_per_km:"每公里费用"};editorChanges.set(el.dataset.v+"."+el.dataset.field,el.dataset.v+" 的 "+names[el.dataset.field]+" 改为 "+value);}
 editorDraft=candidate;renderEditorDraft();notice("改动尚未生效，请确认修改或取消。");
 }catch(e){notice(e.message,true);renderOrders();}});
$("#solve-btn").onclick=()=>generate();
$("#reset-btn").onclick=async()=>{if(busy)return;try{const sample=await api("/api/sample");if(await generate(sample)){selected=0;camera={angle:-.72,elevation:.46,zoom:1};render();}}catch(e){notice(e.message,true);}};
$("#view-reset").onclick=()=>{camera={angle:-.72,elevation:.46,zoom:1};drawCargo();};
let dragStart=null;const canvas=$("#cargo-canvas");canvas.addEventListener("pointerdown",e=>{dragStart={x:e.clientX,y:e.clientY};drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener("pointermove",e=>{if(!drag)return;camera.angle+=(e.clientX-drag.x)*.009;camera.elevation=Math.max(.18,Math.min(.9,camera.elevation+(e.clientY-drag.y)*.005));drag={x:e.clientX,y:e.clientY};drawCargo();});
canvas.addEventListener("pointerup",e=>{if(dragStart&&Math.hypot(e.clientX-dragStart.x,e.clientY-dragStart.y)<4)selectCargoAt(e);drag=null;dragStart=null;});canvas.addEventListener("pointercancel",()=>drag=null);
canvas.addEventListener("wheel",e=>{e.preventDefault();camera.zoom=Math.max(.65,Math.min(1.65,camera.zoom-e.deltaY*.001));drawCargo();},{passive:false});
window.addEventListener("resize",drawCargo);
$("#assistant-form").onsubmit=event=>{
 event.preventDefault();if(!data||busy)return;if(editorDraft){notice("请先确认或取消订单与车辆修改。",true);return;}draft=null;$("#assistant-preview").innerHTML="";const text=$("#assistant-input").value.trim(),time=text.match(/(\d{1,2})(?:[:：](\d{2})|点(?:(\d{1,2})分?)?)/);
 const due=time?Number(time[1])*60+Number(time[2]||time[3]||0):null;
 if(time&&(Number(time[1])>23||Number(time[2]||time[3]||0)>59)){notice("请使用有效的当日时间。",true);return;}
 const order=text.toUpperCase().match(/O\d+/),vehicle=text.toUpperCase().match(/V\d+/);
 if(text.includes("新增")&&due!==null){if(due<(data.start??480)){notice("新增订单截止时间早于发车时间。",true);return;}if(data.orders.length>=30||data.orders.reduce((n,o)=>n+o.boxes.length,0)+2>150){notice("新增会超过 Demo 的 30 单 / 150 箱上限。",true);return;}draft={type:"add",due};}
 else if(order&&due!==null&&data.orders.some(o=>o.id===order[0])){if(due<data.orders.find(o=>o.id===order[0]).ready){notice("截止时间不能早于时间窗起点。",true);return;}draft={type:"deadline",id:order[0],due};}
 else if(vehicle&&/停用|不可用/.test(text)&&data.vehicles.some(v=>v.id===vehicle[0])){if(data.vehicles.length<=1){notice("至少保留一辆车。",true);return;}draft={type:"vehicle",id:vehicle[0]};}
 else{notice("规则演示支持：新增一单，14点前送达；订单O03改为11点前送达；V02停用。",true);return;}
 const description=draft.type==="add"?"新增模拟订单：城中演示点（示意坐标 120.26, 30.27），2 箱 / 160 kg，"+clock(draft.due)+" 前完成卸货。":draft.type==="deadline"?"将 "+draft.id+" 的完成卸货截止时间修改为 "+clock(draft.due)+"。":"停用 "+draft.id+"，使用剩余车辆重算。";
 $("#assistant-preview").innerHTML='<div class="draft"><p>'+esc(description)+'</p><button id="confirm-draft" class="button primary">确认变更并重算</button> <button id="cancel-draft" class="button secondary">取消</button></div>';
 $("#confirm-draft").onclick=async()=>{if(busy||!draft)return;const d=draft,candidate=clone(data);
 if(d.type==="add"){let n=11;const boxIds=new Set(data.orders.flatMap(o=>o.boxes.map(b=>b.id)));while(data.orders.some(o=>o.id==="O"+String(n).padStart(2,"0"))||[1,2].some(j=>boxIds.has("O"+String(n).padStart(2,"0")+"-B"+j)))n++;const id="O"+String(n).padStart(2,"0");candidate.orders.push({id,name:"新增·城中演示点",lon:120.26,lat:30.27,ready:data.start??480,due:d.due,service:8,service_mode:"estimate",customer_id:"SIM-C01",boxes:[1,2].map(j=>({id:id+"-B"+j,length:80,width:60,height:50,weight:80,fragile:false,stackable:true,rotate:true,max_top_weight:120}))});}
 if(d.type==="add")delete candidate.travel;
 if(d.type==="deadline")candidate.orders.find(o=>o.id===d.id).due=d.due;
 if(d.type==="vehicle")candidate.vehicles=candidate.vehicles.filter(v=>v.id!==d.id);
 await generate(candidate);};
 $("#cancel-draft").onclick=()=>{if(busy)return;draft=null;$("#assistant-preview").innerHTML="";};
};
$("#export-btn").onclick=()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="urban-flow-orders.json";a.click();URL.revokeObjectURL(url);};
$("#import-btn").onclick=()=>{if(!busy)$("#file-input").click();};
$("#file-input").onchange=async e=>{try{if(busy)return;const file=e.target.files[0];if(!file)return;if(file.size>300000)throw Error("文件超过 300 KB");const candidate=JSON.parse(await file.text());await generate(candidate);}catch(error){notice("导入失败："+error.message,true);}finally{e.target.value="";}};

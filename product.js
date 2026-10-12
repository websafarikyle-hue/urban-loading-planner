/* Product helpers shared by the browser and verification scripts. */
(function(root){
'use strict';
const E=typeof module==='object'&&module.exports?require('./engine.js'):root.UrbanEngine;
const copy=x=>JSON.parse(JSON.stringify(x));
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=x=>{const n=Math.round(x);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');};
const headers=['订单号','门店编号','开始收货','完成截止','箱型编号','数量'];
function normalizeScenario(data,catalog,date){
 const config=E.validate(data),next=copy(data);next.config=config;
 if(!next.end_point)next.end_point=copy(catalog.parking);
 if(typeof next.end_point.name!=='string'||!next.end_point.name||typeof next.end_point.id!=='string'||!Number.isFinite(next.end_point.lon)||!Number.isFinite(next.end_point.lat))throw Error('停车点信息无效');
 if(next.date===undefined)next.date=date;
 if(typeof next.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(next.date)||!Number.isFinite(Date.parse(next.date))||new Date(next.date).toISOString().slice(0,10)!==next.date)throw Error('配送日期无效');
 if(next.seed===undefined)next.seed=42;
 if(next.provenance!==undefined&&typeof next.provenance!=='string')throw Error('数据来源说明需为文本');
 return next;
}
function csv(rows){return '\ufeff'+rows.map(row=>row.map(value=>{let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n');}
function parseCSV(text){
 if(typeof text!=='string'||text.length>3000000)throw Error('CSV 文件过大或无效');
 text=text.replace(/^\ufeff/,'');let rows=[],row=[],field='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
 else if(c==='"'){if(field||closed)throw Error('CSV 引号格式错误');quoted=true;}
 else if(c===','||c==='\n'||c==='\r'){row.push(field);field='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(s=>s.trim()))rows.push(row);row=[];}}
 else {if(closed&&!/\s/.test(c))throw Error('CSV 引号后存在多余字符');if(!closed)field+=c;}}
 if(quoted)throw Error('CSV 引号未闭合');row.push(field);if(row.some(s=>s.trim()))rows.push(row);return rows;
}
function importOrders(text,current,catalog){
 const rows=parseCSV(text);if(rows.length<2)throw Error('CSV 至少应包含表头和一行订单');
 if(rows[0].map(s=>s.trim()).join('|')!==headers.join('|'))throw Error('CSV 表头不匹配，请使用下载的模板');
 const orders=new Map();const time=(s,line)=>{if(!/^\d{2}:\d{2}$/.test(s))throw Error('第 '+line+' 行时间应为 HH:MM');const [h,m]=s.split(':').map(Number);if(h>23||m>59)throw Error('第 '+line+' 行时间超出范围');return h*60+m;};
 for(let i=1;i<rows.length;i++){if(rows[i].length!==headers.length)throw Error('第 '+(i+1)+' 行列数错误');const [id,storeId,ready,due,code,q]=rows[i].map(s=>s.trim()),line=i+1;
  if(!/^[A-Za-z0-9_-]{1,40}$/.test(id))throw Error('第 '+line+' 行订单号需为字母、数字、下划线或连字符');
  const s=catalog.stores.find(s=>s.id===storeId),sku=E.skus.find(s=>s.code===code);if(!s)throw Error('第 '+line+' 行门店编号不存在');if(!sku)throw Error('第 '+line+' 行箱型编号不存在');
  if(!/^\d+$/.test(q)||Number(q)<1||Number(q)>50)throw Error('第 '+line+' 行数量需为 1～50 的整数');
  const a=time(ready,line),b=time(due,line);if(a>b)throw Error('第 '+line+' 行截止时间早于开始时间');let o=orders.get(id);
  if(o&&(o.store_id!==storeId||o.ready!==a||o.due!==b))throw Error('第 '+line+' 行同一订单的门店或时间窗不一致');
  if(!o){o={id,store_id:s.id,name:s.name,address:s.address,lon:s.lon,lat:s.lat,ready:a,due:b,boxes:[]};orders.set(id,o);}
  for(let j=0;j<Number(q);j++)o.boxes.push({...copy(sku),id:id+'-B'+(o.boxes.length+1)});
 }
 const d=copy(current);d.orders=[...orders.values()];if(d.travel&&d.orders.some(o=>!d.travel.points.some(p=>p.id===o.store_id&&Math.abs(p.lon-o.lon)<1e-6&&Math.abs(p.lat-o.lat)<1e-6)))delete d.travel;d.provenance='用户导入订单；门店采用公开目录，预设包装规格及费用为模拟假设。';E.validate(d);return d;
}
function template(catalog){return csv([headers,['ORDER01',catalog.stores[0].id,'09:00','15:00','HOOD',1],['ORDER01',catalog.stores[0].id,'09:00','15:00','PIPE',2],['ORDER02',catalog.stores[1].id,'10:00','16:00','KIT',4]]);}
function examples(kind,catalog,date){
 const d=E.simulate(catalog,42,date);if(kind==='normal')return d;
 d.orders=d.orders.slice(0,kind==='stack'?4:2);d.orders.forEach(o=>{o.ready=540;o.due=1080;});
 d.vehicles.forEach(v=>v.enabled=v.id==='V02');d.config.max_vehicles=1;
 if(kind==='stack'){d.orders.forEach(o=>{o.boxes=Array.from({length:6},(_,i)=>({...copy(E.skus[i%2?4:3]),id:o.id+'-B'+(i+1)}));});}
 else if(kind==='rehandle'){
  const v=d.vehicles.find(v=>v.enabled);v.length=120;v.width=80;v.height=100;v.name='装卸规则验证车厢（模拟单元）';
  d.orders[0].ready=540;d.orders[0].due=660;d.orders[1].ready=720;d.orders[1].due=1080;
  d.orders[0].boxes=Array.from({length:4},(_,i)=>({...copy(E.skus[3]),rotate:false,max_top_weight:8,id:d.orders[0].id+'-B'+(i+1)}));
  d.orders[1].boxes=[{...copy(E.skus[4]),id:d.orders[1].id+'-B1'}];d.config.unload='limited';d.config.max_rehandles=2;
 }
 d.provenance=kind==='stack'?'堆叠压力样例：4家公开门店、24箱模拟配件，展示两层完整支撑与取货顺序。':'搬移规则样例：缩小模拟车厢用于触发阻挡；全部尺寸可查看和修改，适用于装卸逻辑验证。';E.validate(d);return d;
}
function operations(step,c){
 let state=copy(step.before_layout),temporary=new Map();return step.operations.map(op=>{
  let b=op.type==='move_in'?temporary.get(op.box_id):state.find(b=>b.id===op.box_id);if(!b)throw Error('装卸步骤缺少箱件');
  let reason,minutes;if(op.type==='move_in'){reason='目标位置的装入通道、支撑和空间均已校验；恢复后继续配送。';minutes=c.move_in_minutes;state.push({...b,x:op.position[0],y:op.position[1],z:op.position[2]});temporary.delete(b.id);}
  else {const layer=b.z>0?'上层箱，先取走可释放下层支撑。':'地板层箱，当前上方无压货、车门方向无阻挡。';reason=op.type==='move_out'?'此箱挡住本站货物；先沿车门方向搬出，本站卸完后恢复。':layer+'沿 -x 方向取出并交付本站。';minutes=op.type==='move_out'?c.move_out_minutes:c.per_box_minutes+(b.fragile?c.fragile_extra_minutes:0)+(b.weight>c.heavy_threshold_kg?c.heavy_extra_minutes:0);if(op.type==='move_out')temporary.set(b.id,b);state=state.filter(q=>q.id!==b.id);}
  return {...op,sku:b.sku,layer:op.position[2]>0?2:1,minutes,reason};
 });
}
const pointKey=p=>(p.store_id||p.id)+'@'+p.lon+','+p.lat;
const edgeKey=(a,b)=>pointKey(a)+'>'+pointKey(b);
function routePoints(r,d){return [d.depot,...r.stops,...(d.config.endpoint==='open'?[]:[r.endpoint])];}
function roadSegments(r,d,response){
 const points=routePoints(r,d),route=response.routes?.[0];if(response.code!=='Ok'||!route||route.legs?.length!==points.length-1)throw Error('道路接口路段数量不匹配');
 return route.legs.map((leg,i)=>{const coords=leg.steps?.flatMap(s=>s.geometry?.coordinates||[])||[];if(coords.length<2||coords.some(p=>p.length!==2||p.some(x=>!Number.isFinite(x)))||!Number.isFinite(leg.distance)||leg.distance<0||!Number.isFinite(leg.duration)||leg.duration<0)throw Error('道路接口坐标或时间无效');return {key:edgeKey(points[i],points[i+1]),from:copy(points[i]),to:copy(points[i+1]),coordinates:coords,km:leg.distance/1000,minutes:leg.duration/60,query_date:new Date().toISOString()};});
}
function cachedGeometry(r,d,cache){
 const points=routePoints(r,d),coordinates=[];for(let i=0;i<points.length-1;i++){const edge=cache[edgeKey(points[i],points[i+1])],leg=E.travel(points[i],points[i+1],d,d.config);if(!edge||!leg||Math.abs(edge.km-leg.km)>.02||Math.abs(edge.minutes-leg.minutes)>.02)return null;coordinates.push(...edge.coordinates);}return coordinates.length?coordinates:null;
}
function patchTravel(d,segments){
 if(!d.travel)throw Error('请先查询道路时间，再显示与计划一致的道路路径');const next=copy(d);let changed=false;
 for(const edge of segments){const i=next.travel.points.findIndex(p=>pointKey(p)===pointKey(edge.from)),j=next.travel.points.findIndex(p=>pointKey(p)===pointKey(edge.to));if(i<0||j<0)throw Error('道路坐标与计划不一致');if(next.travel.distances[i][j]===null||next.travel.durations[i][j]===null||Math.abs(next.travel.distances[i][j]-edge.km)>.02||Math.abs(next.travel.durations[i][j]-edge.minutes)>.02)changed=true;next.travel.distances[i][j]=edge.km;next.travel.durations[i][j]=edge.minutes;}
 next.travel.query_date=new Date().toISOString();E.validate(next);return {data:next,changed};
}
function printPlan(d,result){
 const f=n=>Number(n).toFixed(1),table=(h,rows)=>'<table><thead><tr>'+h.map(x=>'<th>'+escape(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+escape(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 let body='<h1>城市共配 · 配送执行单</h1><p>'+escape(d.date)+' · v0.9.4 · 目标：'+(d.config.objective==='time'?'总作业时间最小':'配送费用最低')+' · '+result.metrics.assigned+'/'+result.metrics.orders+' 单完成</p><p>路线为普通驾车计划；卸货时长、包装和费用按当前参数估计。以下内容绑定本次已确认方案。</p>';
 if(result.service_bound){const b=result.service_bound;body+='<p>服务量：已完成 '+b.assigned+' 单；必要条件上界 '+b.upper_bound+' 单；'+(b.proven?'服务数量已达到上界。':'最多还有 '+b.gap+' 单改善空间。')+' 时间及费用仍采用有限搜索。</p>';}
 for(const r of result.routes){body+='<section><h2>'+escape(r.vehicle.id+' · '+r.vehicle.name)+'</h2><p>总作业 '+f(r.work_minutes)+' min；路线 '+f(r.km)+' km；费用 ¥'+f(r.cost)+'；任务结束 '+clock(r.end)+'</p><p>发货仓：'+escape(d.depot.name)+'；'+clock(d.start)+' 开始装车，'+clock(d.start+r.time_parts.loading)+' 出发；装车 '+f(r.time_parts.loading)+' min。</p><h3>配送顺序</h3>'+table(['站','门店','收货时间窗','到达','卸货开始','卸货完成','路段 km','路段 min'],r.stops.map((s,i)=>[i+1,s.name,clock(s.ready)+"—"+clock(s.due),clock(s.arrival),clock(s.service_start),clock(s.service_end),f(s.leg_km),f(s.travel_minutes)]))+'<p>终点：'+escape(r.endpoint.name)+'；最后行程 '+f(r.final_leg.km)+' km / '+f(r.final_leg.minutes)+' min。</p><h3>装车顺序</h3>'+table(['步','箱件','货物','配送站','位置 cm','层'],r.packing.loading.map((op,i)=>{const b=r.packing.layout.find(b=>b.id===op.box_id);return [i+1,b.id,b.sku,b.stop,op.position.join(', '),b.z>0?2:1];}));
  for(const step of r.packing.unloading.steps){const stop=r.stops[step.stop-1];body+='<h3>第 '+step.stop+' 站 · '+escape(step.name)+'</h3><p>卸货 '+step.boxes.length+' 箱；临时搬出 '+step.rehandles+' 箱；准备 '+d.config.setup_minutes+' min；本站合计 '+f(stop.service_estimate.minutes)+' min。</p>'+table(['步','动作','箱件','位置 cm','动作 min','说明'],operations(step,d.config).map((o,i)=>[i+1,{unload:'卸下本站',move_out:'临时搬出',move_in:'恢复装入'}[o.type],o.box_id,o.position.join(', '),f(o.minutes),o.reason]));}body+='</section>';}
 if(result.unassigned.length)body+='<h2>未安排订单</h2>'+table(['订单','门店','原因'],result.unassigned.map(o=>[o.order_id,o.name,o.status==='proven_individually_infeasible'?'必要条件已证实单独不可行：'+o.proven_reasons.join('；'):'组合搜索尚未安排，可继续优化或调整资源']));
 return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>配送执行单</title><style>body{font:14px system-ui;margin:32px;color:#173b36}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border:1px solid #cad6cd;padding:7px;text-align:left}section{break-before:page}h1{font-size:24px}h2{font-size:20px}p{line-height:1.8}@media print{button{display:none}body{margin:10mm}thead{display:table-header-group}tr{break-inside:avoid}}</style><button onclick="window.print()">打印 / 保存为 PDF</button>'+body+'</html>';
}
const api={headers,normalizeScenario,csv,parseCSV,importOrders,template,examples,operations,edgeKey,routePoints,roadSegments,cachedGeometry,patchTravel,printPlan};if(typeof module==='object'&&module.exports)module.exports=api;else root.UrbanProduct=api;
})(typeof self!=='undefined'?self:globalThis);

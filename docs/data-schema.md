# 数据规范 v0.3（旧格式保留作回归）

新版以frontend/v03/engine.js的validate为格式入口，时间为分钟、尺寸cm、重量kg。

| 对象 | 字段 |
|---|---|
| 根 | version=3,date,seed,start,depot,end_point,config,orders,vehicles；start为开始装车时间 |
| config | endpoint:return/open/parking；unload:direct/limited；objective:time/cost；max_vehicles,max_rehandles |
| config | loading_setup,loading_per_box,setup_minutes,per_box_minutes,fragile_extra_minutes,heavy_extra_minutes,heavy_threshold_kg,move_out_minutes,move_in_minutes,speed_kmh |
| order | id,store_id,name,address,lon,lat,ready,due,boxes；due为卸货完成截止 |
| box | id,sku,length,width,height,weight,fragile,stackable,rotate,max_top_weight |
| vehicle | id,name,length,width,height,capacity_kg,fixed_cost,cost_per_km,labor_per_hour,shift_end,enabled |
| travel | points,distances(km),durations(min),provider,query_date,profile,coordinate_system=WGS84,truck_restrictions_verified；按store_id与坐标绑定，可含整个门店目录 |

输出routes包含packing.layout/loading/unloading、service_estimate、time_parts和cost_parts。每站卸货包含before_layout、operations、after_layout；操作为unload/move_out/move_in和位置cm。
可选接口/api/v03/solve接受{data,mode:compare/baseline/optimized}，调用共享模块；网页在Worker运行同模块。导出包含草案data、已计算输入plan_data及方案；导入仅接收输入重新计算。

## 旧v0.2格式
时间为当日零点起分钟，尺寸cm，重量kg，费用元，坐标WGS84。

## 真实门店预设档案
`data/hangzhou-store-catalog.json` 提供10个杭州公开地图便利店、超市记录，用于后续订单录入下拉框。
`scripts/prepare_store_catalog.py` 可以重新查询相同OSM节点。当前手机版尚未接入该门店下拉框，也未修改固定样例。

门店id（HZ-S01等）是项目编号，name保留地图原名；display_name为编号＋地图原名，不编造分店名。
lon/lat采用WGS84；source_url、osm_node_id、osm_version、osm_updated_at保留地图来源，query_date为本次查询UTC时间。
address仅拼接地图已有地址标签，可能不完整，address_complete为false；无地址时为null。
门店营业状态、实际卸货入口未经核验；default_receiving_window为null，订单录入时独立设置。
坐标代表公开门店标记点，演示中假设为收货点；真实订单、客户关系、收货时间窗和箱件参数仍需另行提供或明确模拟。
原杭州道路样例的缓存矩阵绑定其原始地点，不能直接用于本档案；选择这些地点后必须重新计算或显式估算行驶时间。

| 对象 | 字段 | 含义 |
|---|---|---|
| depot | id/name/lon/lat | 假设发货点；不能与订单ID重复 |
| start | 分钟 | 默认480 |
| orders[] | id/name/customer_id/lon/lat | 唯一订单、收货点、模拟货主、公开或示意坐标 |
| orders[] | ready/due | 最早开始作业 / 最晚完成卸货 |
| orders[] | service_mode/service | estimate（默认）或manual；manual使用service分钟；estimate忽略service的旧值 |
| service_policy | setup_minutes/per_box_minutes/fragile_extra_minutes/heavy_extra_minutes/heavy_threshold_kg | 默认3 / 1 / 0.5 / 0.5 / 30，可覆盖；均为可调整演示假设 |
| boxes[] | id/length/width/height/weight/fragile/stackable/rotate/max_top_weight | 唯一箱件、直立尺寸、底面旋转、支撑与累计承重 |
| vehicles[] | id/name/length/width/height/capacity_kg/fixed_cost/cost_per_km/shift_end | 唯一车辆、内尺寸、载重、费用、返仓班次截止 |
| provenance | 字符串对象 | 保留来源、假设与单位 |
| travel | points/distances/durations | points为仓库＋订单顺序的id/lon/lat；km和分钟非对称方阵；null为不可达，不使用直线替代 |
| travel | provider/query_date/profile/coordinate_system/truck_restrictions_verified | 来源、UTC查询日期、普通驾车、WGS84、是否核验货车；本版来源均false |
| travel | geometries | 订单序列以 > 连接的键，值含相同order_ids及GeoJSON LineString；只有匹配路线才使用 |

坐标或新增订单改变后应清除travel，重新查询；服务端拒绝坐标绑定不一致的矩阵。
输出stops含arrival/service_start/service_end/service_estimate/customer_id，内部使用未舍入时间校验，展示到0.1分钟。
输出packing含layout/loading/unloading，装车步骤按卸货顺序逆序反推，并独立回放验证。
车门x=0，只沿-x取货；完整底面单箱支撑，最多两层；不搬开其他站箱件。

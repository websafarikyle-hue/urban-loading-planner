# 演示数据来源与许可

- 地点来自 OpenStreetMap API，© OpenStreetMap contributors，ODbL。https://www.openstreetmap.org/copyright
- 假设仓库参考 https://www.openstreetmap.org/way/1152870422 的公开边界；代表点不是核验过的车辆入口。
- 收货点对应公开OSM节点，具体链接保留在各订单 source_url 中；不意味着传化客户关系，不保证营业状态。
- 距离、时间与轨迹来自OSRM公共演示服务及OpenStreetMap道路数据。https://project-osrm.org/docs/v5.24.0/api/
- 查询日期分别保留在 provenance.location_query_date、travel.query_date 和轨迹元数据中。查询失败不会把不可达路段包装成可达。
- 普通驾车模型、非实时拥堵时间、未核验货车限行和装卸入口。
- 箱件、订单、车辆、费用、客户分组和卸货系数为本项目模拟与假设；这些不来自企业真实作业。
- 重新生成缓存：`python3 scripts/prepare_hangzhou.py`，会联网查询公开数据。缓存求解无需再访问道路服务。

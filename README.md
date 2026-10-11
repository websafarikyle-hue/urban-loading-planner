# 城市共配 / Urban Flow — Demo v0.3

杭州方太门店次日补货的派车、路线、三维装载与逐站装卸工作台。大模型助手暂缓。公开门店与模拟业务数据分别标注。

## 使用

公开网页的发布入口：仓库 [Settings → Pages](https://github.com/websafarikyle-hue/urban-loading-planner/settings/pages)。选择 `Deploy from a branch`、`main`、`/(root)` 并保存后，以该页面显示的发布成功链接为准。预期地址为 https://websafarikyle-hue.github.io/urban-loading-planner/ 。启用前该地址尚不可用。页面计算在浏览器 Worker 运行，使用者无需登录 ChatGPT，也不需要个人电脑持续开机。

当前工作台：https://urban-flow-kyle-mobile.cuddlylynx2.chatgpt.site ，需要所属 ChatGPT 账号登录，部分网络可能触发域名安全防护拦截。

下载版打开 standalone-demo.html，内置计算模块、20家门店和22点道路时间缓存。建议用系统浏览器打开；手机文件预览器可能禁用JavaScript或Worker。

源码本地运行：Python 3.10+，执行 python3 server.py --open，或Windows双击start-demo.cmd。默认进入/v03/。网页计算不需要Node；可选/api/v03/solve接口需Node.js 18+，与网页复用engine.js。旧页/legacy.html保留作回归参考。

## 演示

1. 点击“模拟次日订单”：从20家公开门店选择12～16家，生成可复现的模拟货物、数量与时间窗。
2. 在“订单与车辆”选择门店、增删订单，修改箱件尺寸/重量/易碎/堆叠/旋转/承重、车辆是否可用和车型。
3. 设置终点、卸货规则、最多出车数、目标。费用可统一应用、恢复默认或逐车修改。
4. 确认生成计划，查看先去哪家、再去哪家、到达和完成卸货时刻、终点行程及费用。
5. 拖动旋转三维车厢，逐箱装车或逐站卸货。有限搬移模式展示搬出、卸货和恢复位置。
6. 同一批订单改变条件后重新计算，比较方案。基础规则采用相同输入和可行性校验。
7. 保存最近5份场景或导出/导入JSON；旧结果绑定旧输入，成功重算才更新。

## 条件

| 条件 | 选项 / 默认 |
|---|---|
| 车辆终点 | 回仓、末站结束、指定停车点（含最后行程） |
| 卸货规则 | 直接取货无搬移；有限搬移，默认每站最多2件，可设0～5 |
| 出车上限 | 从全部启用车辆选择，默认3辆，非仅取前3辆 |
| 目标 | 服务完成量优先，再最小化总作业时间或费用 |
| 默认费用 | 200元/次＋1.5元/km＋30元/h完整作业时间，均可调 |
| 时间 | 装车、行驶、等待、卸货和终点行程；装卸系数可改 |

## 算法与数据

frontend/v03/engine.js是浏览器/Node共享实现：多起点贪心插入、2-opt、跨车移单、整条路线换车与合单修复、可行路线池组合。每条候选同步检查装載、卸货完成时间窗和班次。最多2200条候选评估、1024个组合状态，截断情况显示诊断。无全局最优性证明。借鉴2026年EJOR联合优化论文，未完整复现Benders或branch-and-cut；见docs/research.md。

名称地址来自方太官网，包括19个专卖/旗舰记录和1个社区服务门店。坐标来自门店或同址商场/楼宇高德公开参考点，GCJ02近似转WGS84，逐条来源见data/hangzhou-fotile-store-catalog.json。营业状态、卸货入口和真实补货条件未核验，不代表真实传化客户。

OSRM缓存使用普通驾车数据，保留查询日期与坐标绑定，未验证货车限行或实时拥堵。底图或在线查询失败不阻止缓存计算。连接线与道路轨迹区分说明。改变停车点坐标清除缓存，可重新查询或使用明确标注的估算。

装载最多两层、单箱完整支撑、保持直立、轴向装卸；易碎/不可叠箱不可支撑上层，累计承重有限。每次取货检查剩余支撑，搬移假设有现场临时空间。未建模轴荷、绑扎、叉车转向和真实场地。

## 验证与Git

运行：
- python -m unittest discover -s tests -v
- node --check frontend/app.js
- node --check frontend/features.js
- node tests/ui-smoke.mjs
- node tests/v03-engine.cjs
- node tests/v03-ui.mjs

32项Python测试、11组v0.3引擎检查、两版前端逻辑检查通过；12种条件组合及2个种子均经过操作回放校验。详见docs/v03-validation.md、docs/v03-results.json。完整手机视觉与真实触控尚未实机验收。

项目仓库：https://github.com/websafarikyle-hue/urban-loading-planner 。本次发布使用独立功能分支，保留仓库初始化提交。源码包含代码、公开数据、测试及说明。GitHub Pages 的启用与源码上传是两个步骤；以 Settings → Pages 和 Actions 的部署结果确认网页是否上线。

# 算法文献与实现对应
检索核验日期：2026-10-11。阅读依据包括出版商摘要，以及Tamke等作者2024年公开预印本；不等于阅读最终2026期刊全文或完整复现。
## 1. 带时间窗的联合求解
Douglas Nogueira Nascimento, Franklina Maria Bragion Toledo, Leandro C. Coelho.
*Logic-based Benders decomposition for the three-dimensional loading capacitated vehicle routing problem with time windows*.
European Journal of Operational Research，2026-06-06 online，corrected proof.
DOI: https://doi.org/10.1016/j.ejor.2026.05.051
出版商: https://www.sciencedirect.com/science/article/pii/S0377221726005321

出版商说明包含 exact logic-based Benders decomposition、optimal/heuristic packing feasibility checks 和不同 feasibility cuts。
Demo 借鉴路径与装载子问题分解及候选可行性反馈；实际采用贪心插入、relocate 和保守角点装载。
未实现 MIP master、最优装载子求解器、Benders cuts、下界与最优性证明。

## 2. 装载不可行反馈与启发式
Felix Tamke, Florian Linß, Leopold Kuttner, Udo Buscher.
*A branch-and-cut algorithm for vehicle routing problems with three-dimensional loading constraints*.
European Journal of Operational Research 331(3), 790–808，2026-06-16 issue date.
DOI: https://doi.org/10.1016/j.ejor.2025.10.010
作者预印本: https://arxiv.org/abs/2402.14868

出版商说明包含 infeasible path elimination、incremental feasibility property，以及 extreme point-based packing heuristic。
Demo 使用一种简化角点摆放，并对失败路线拒绝或改变插入位置；不是上述论文算法的代码复现。
论文指出支撑约束下，添加货物可能令原本不可行的装载变可行。因此本 Demo 不将失败路线的所有超集永久剪枝，也不把启发式失败判作精确不可行。

## 模型限制
轴向取货、直立箱件、单箱完整支撑、保守上层承重；未模拟摩擦、车轴载荷、车辆倾斜、叉车作业。
启发式可遗漏可行布局；有限 relocate 搜索可遗漏更优路线；成本降低比例仅属于固定演示数据。
v0.2已增加有限路线池组合、路线穷举对照和固定种子实验；完整精确装载模型仍未实现。

首版保守限制最多两层堆叠，保证底层箱件承重易于校验；这可能降低空间利用率。

## v0.3方法落地
浏览器/Node共享JavaScript计算模块。增加整条路线换车、合单和未服务订单修复；从全部可用车辆选择。路线池按服务量优先、时间或费用次之，候选评估上限2200、状态上限1024，报告截断。
有限搬移通过实际阻挡关系依次搬出、卸货、恢复，每步检查剩余支撑，耗时反馈时间窗。直接规则要求0搬移。回放检查装车、站点快照、守恒、支撑、承重、时间和费用；部分阻挡判断复用几何定义，不是第二套精确装箱器。
有限搬移理论可行域包含直接规则，但有限搜索和启发式可能得到不同质量结果，不能预设必然改善。未实现完整Benders、branch-and-cut或最优性证明。

## v0.2方法落地与差异
Tamke等2024年作者预印本 https://arxiv.org/pdf/2402.14868 第5.2节讨论增强极点装载启发式；第7.5.2节讨论对缓存可行路线进行集合划分选择。
本版装载保留简化后向角点，并在失败时更换箱件排序、扩充地板投影角点；未实现论文完整极点更新、全部摆放规则和迭代破坏重建。
调度缓存已经通过时间与装载检查的路线。按车辆和订单子集保留低成本列，动态规划选择每车至多一条、每单至多服务一次的组合。目标改为先服务完成量再成本；允许订单未分配，异质车辆占用分别检查，与论文标准集合划分模型存在明确差异。
最多16单时状态上限4096，超过16单时512；诊断说明是否发生状态截断。未截断也仅在发现的路线池内精确，不能给出全局联合最优证明。
小规模对照枚举5单以内的全部路线排列，保留车辆/子集最低成本可行列并完整组合；仍使用同一启发式装载校验，会遗漏该校验找不到的布局。未实现CP-SAT、MIP、Benders cuts或branch-and-cut。
独立验证器不调用装载辅助函数，重放几何、支撑和装卸步骤；这提高结果检查独立性，不增加最优性证据。

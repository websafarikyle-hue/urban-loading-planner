"""Adjustable handling assumptions; these coefficients are not measured standards."""
from math import ceil
DEFAULT_POLICY={"setup_minutes":3,"per_box_minutes":1,"fragile_extra_minutes":.5,
                "heavy_extra_minutes":.5,"heavy_threshold_kg":30}
def estimate_service(order,policy=None):
    if order.get('service_mode','estimate')=='manual':
        return {'minutes':order['service'],'mode':'manual','components':{'人工指定':order['service']},'note':'人工指定作业时长，建议通过现场记录校准'}
    p={**DEFAULT_POLICY,**(policy or {})};boxes=order['boxes']
    c={'到站准备':p['setup_minutes'],'逐箱处理':len(boxes)*p['per_box_minutes'],
       '易碎附加':sum(b['fragile'] for b in boxes)*p['fragile_extra_minutes'],
       '重件附加':sum(b['weight']>p['heavy_threshold_kg'] for b in boxes)*p['heavy_extra_minutes']}
    return {'minutes':ceil(sum(c.values())*2)/2,'mode':'estimate','components':c,'parameters':p,
            'note':'演示估计，向上取整到半分钟；系数可调整，未由企业实测校准'}

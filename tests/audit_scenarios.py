"""Limited, reproducible audit scenarios; not a research benchmark."""
import copy
import json
import random
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from algorithms.planner import solve
from server import validate

def scenario(seed,count=10):
    data=json.loads((ROOT/"data/sample.json").read_text(encoding="utf8"))
    rng=random.Random(seed);base=copy.deepcopy(data["orders"])
    data["orders"]=[]
    for i in range(count):
        o=copy.deepcopy(base[i%10]);o["id"]=f"A{i+1:02}"
        o["lon"]=120.4+rng.uniform(-.18,.18);o["lat"]=30.3+rng.uniform(-.12,.12)
        o["due"]=rng.choice([600,660,720,840,960]);o["ready"]=480
        for j,b in enumerate(o["boxes"]):b["id"]=f'{o["id"]}-B{j+1}'
        data["orders"].append(o)
    if count>10:
        base_vehicles=copy.deepcopy(data["vehicles"])
        data["vehicles"]=[]
        for i in range(9):
            v=copy.deepcopy(base_vehicles[i%3]);v["id"]=f"V{i+1:02}"
            data["vehicles"].append(v)
    return validate(data)

def run():
    rows=[]
    for seed,count in [(s,10) for s in range(10)]+[(42,30)]:
        data=scenario(seed,count);baseline=solve(data,"baseline");optimized=solve(data)
        rows.append({"seed":seed,"orders":count,"boxes":4*count,"available_vehicles":len(data["vehicles"]),
                     "baseline":baseline["metrics"],"optimized":optimized["metrics"],
                     "optimized_ms":optimized["diagnostics"]["duration_ms"]})
    # A small early order can occupy the only truck suitable for a large late order.
    # v0.1 cost-only insertion missed a repair; v0.2 should serve both orders.
    data=scenario(0,2)
    for o in data["orders"]:o.update(lon=data["depot"]["lon"],lat=data["depot"]["lat"])
    template=copy.deepcopy(data["orders"][0]["boxes"][1])
    small=copy.deepcopy(data["orders"][0]);large=copy.deepcopy(data["orders"][1])
    small.update(due=600,boxes=[dict(template,id="SMALL",length=50,width=50,height=50,weight=10,rotate=False)])
    large.update(due=900,boxes=[dict(template,id="LARGE",length=150,width=50,height=50,weight=20,rotate=False)])
    data["orders"]=[large,small]
    vehicle=copy.deepcopy(data["vehicles"][0])
    data["vehicles"]=[dict(vehicle,id="V01",length=200,width=100,height=100,capacity_kg=20,fixed_cost=1),
                      dict(vehicle,id="V02",length=100,width=100,height=100,capacity_kg=10,fixed_cost=100)]
    validate(data);baseline=solve(data,"baseline");optimized=solve(data)
    counterexample={"name":"early_small_order_occupies_only_large_truck","data":data,
                    "baseline":baseline["metrics"],"optimized":optimized["metrics"],
                    "unassigned":optimized["unassigned"]}
    return {"scope":"10 seeded simulated cases, one 30-order case and a service-priority counterexample; not statistical or real-road validation", "rows":rows,"counterexample":counterexample}

if __name__=="__main__":
    result=run()
    if len(sys.argv)>1:Path(sys.argv[1]).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf8")
    print(json.dumps(result,ensure_ascii=False))

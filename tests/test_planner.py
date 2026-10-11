import copy,json,unittest,threading,urllib.request,urllib.error
from pathlib import Path
from http.server import ThreadingHTTPServer
from algorithms.planner import solve,pack,validate_layout,unload_plan,supported
from server import validate,Handler
from algorithms.service import estimate_service

ROOT=Path(__file__).resolve().parents[1]
def sample():return json.loads((ROOT/"data/sample.json").read_text(encoding="utf8"))
def box(id="B",**kwargs):
    value=dict(id=id,length=50,width=50,height=50,weight=10,fragile=False,stackable=True,rotate=True,max_top_weight=100)
    value.update(kwargs);return value
def item(id,order,stop,x,y,z,**kwargs):
    value=dict(box(id),order_id=order,stop=stop,x=x,y=y,z=z,dx=50,dy=50,dz=50);value.update(kwargs);return value
def truck(**kwargs):
    value=dict(id="V",name="test",length=200,width=100,height=100,capacity_kg=100,fixed_cost=100,cost_per_km=1,shift_end=1080)
    value.update(kwargs);return value
def order(id,boxes):return dict(id=id,name=id,lon=120.2,lat=30.2,ready=480,due=1000,service=5,boxes=boxes)

class PlannerTests(unittest.TestCase):
    def test_sample_conservation_and_independent_geometry(self):
        data=sample();result=solve(data);assigned=[]
        for r in result["routes"]:
            route=[next(o for o in data["orders"] if o["id"]==oid) for oid in r["order_ids"]]
            assigned+=r["order_ids"];layout=r["packing"]["layout"];v=r["vehicle"]
            self.assertEqual(validate_layout(layout,v,route),[])
            self.assertEqual(len(layout),sum(len(o["boxes"]) for o in route))
            for a in layout:
                for axis,dim in [("x","length"),("y","width"),("z","height")]:
                    self.assertGreaterEqual(a[axis],0);self.assertLessEqual(a[axis]+a["d"+axis],v[dim])
            for i,a in enumerate(layout):
                for b in layout[i+1:]:
                    separated=any(a[k]+a["d"+k]<=b[k]+1e-6 or b[k]+b["d"+k]<=a[k]+1e-6 for k in ("x","y","z"))
                    self.assertTrue(separated)
            self.assertTrue(all(s["service_end"]<=s["due"] for s in r["stops"]))
        self.assertEqual(set(assigned),{o["id"] for o in data["orders"]})
        self.assertEqual(len(assigned),len(set(assigned)))
    def test_overweight_never_loaded(self):
        o=order("O",[box(weight=101)])
        self.assertFalse(pack([o],truck())["feasible"])
    def test_dimensions_fail_even_when_volume_fits(self):
        o=order("O",[box(length=201,width=5,height=5,rotate=False)])
        self.assertFalse(pack([o],truck())["feasible"])
    def test_fragile_box_cannot_support_another(self):
        base=item("A","O",1,100,0,0,fragile=True)
        upper=item("B","O",1,100,0,50)
        self.assertFalse(supported(upper,[base]))
    def test_nonstackable_and_overload_support_rejected(self):
        upper=item("B","O",1,100,0,50,weight=60)
        self.assertFalse(supported(upper,[item("A","O",1,100,0,0,stackable=False)]))
        self.assertFalse(supported(upper,[item("A","O",1,100,0,0,max_top_weight=50)]))
    def test_cumulative_support_load_rejected(self):
        base=item("A","O",1,100,0,0,dx=100,max_top_weight=70)
        first=item("B","O",1,100,0,50,weight=40)
        second=item("C","O",1,150,0,50,weight=40)
        self.assertFalse(supported(second,[base,first]))
    def test_floating_and_overlap_detected(self):
        route=[order("O",[box("A"),box("B")])]
        layout=[item("A","O",1,0,0,0),item("B","O",1,0,0,20)]
        errors=validate_layout(layout,truck(),route)
        self.assertIn("箱件重叠",errors);self.assertIn("支撑、堆叠或承重规则违反",errors)
    def test_later_stop_blocks_earlier_stop(self):
        layout=[item("A","O1",1,100,0,0),item("B","O2",2,0,0,0)]
        route=[order("O1",[box("A")]),order("O2",[box("B")])]
        self.assertFalse(unload_plan(layout,route)["feasible"])
    def test_same_stop_top_is_removed_first(self):
        layout=[item("A","O",1,100,0,0),item("B","O",1,100,0,50)]
        result=unload_plan(layout,[order("O",[box("A"),box("B")])])
        self.assertTrue(result["feasible"])
        self.assertEqual([b["box_id"] for b in result["steps"][0]["boxes"]],["B","A"])
    def test_insufficient_fleet_and_tight_window_reported(self):
        data=sample();data["vehicles"]=[truck(capacity_kg=1)]
        result=solve(data);self.assertEqual(result["metrics"]["assigned"],0);self.assertEqual(len(result["unassigned"]),10)
        data=sample();data["orders"][0]["due"]=480
        result=solve(data);self.assertIn("O01",[o["order_id"] for o in result["unassigned"]])
    def test_determinism(self):
        a=solve(sample());b=solve(sample());a["diagnostics"].pop("duration_ms");b["diagnostics"].pop("duration_ms")
        self.assertEqual(a,b)
    def test_duplicate_and_invalid_data_rejected(self):
        data=sample();data["orders"][1]["id"]=data["orders"][0]["id"]
        with self.assertRaises(ValueError):validate(data)
        data=sample();data["vehicles"][0]["length"]=-1
        with self.assertRaises(ValueError):validate(data)
    def test_vehicle_unavailable_recomputes_without_using_it(self):
        data=sample();data["vehicles"]=[v for v in data["vehicles"] if v["id"]!="V02"]
        result=solve(data);self.assertNotIn("V02",[r["vehicle"]["id"] for r in result["routes"]])
        total=result["metrics"]["assigned"]+len(result["unassigned"]);self.assertEqual(total,10)

    def test_malformed_shapes_and_times_rejected(self):
        cases=[("orders",[None]),("orders","invalid"),("vehicles",{}),
               ("depot",[]),("provenance",None)]
        for key,value in cases:
            with self.subTest(key=key,value=value):
                data=sample();data[key]=value
                with self.assertRaises(ValueError):validate(data)
        for field,value in [("id",[]),("id",""),("ready",-1),("due",1500)]:
            with self.subTest(field=field,value=value):
                data=sample();data["orders"][0][field]=value
                with self.assertRaises(ValueError):validate(data)
        for value in [float("nan"),"18:00",-1]:
            with self.subTest(shift_end=value):
                data=sample();data["vehicles"][0]["shift_end"]=value
                with self.assertRaises(ValueError):validate(data)

    def test_layout_matches_original_box_and_order(self):
        route=[order("O",[box("A",rotate=False)])];v=truck()
        original=pack(route,v)["layout"]
        for field,value in [("dx",1),("x",float("nan")),("weight",0),("fragile",True),
                            ("order_id","UNKNOWN"),("stop",2)]:
            with self.subTest(field=field):
                changed=copy.deepcopy(original);changed[0][field]=value
                self.assertTrue(validate_layout(changed,v,route))

    def test_service_end_is_explicit(self):
        data=sample();result=solve(data)
        for route in result["routes"]:
            for stop in route["stops"]:
                source=next(o for o in data["orders"] if o["id"]==stop["order_id"])
                self.assertAlmostEqual(stop["service_end"]-stop["service_start"],estimate_service(source)['minutes'],delta=.11)

class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(("127.0.0.1",0),Handler);cls.url="http://127.0.0.1:"+str(cls.server.server_port)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def test_health_sample_page_and_compare(self):
        for path in ("/api/health","/api/sample","/","/app.js","/style.css"):
            with urllib.request.urlopen(self.url+path) as response:self.assertEqual(response.status,200)
        req=urllib.request.Request(self.url+"/api/compare",data=json.dumps({"data":sample()}).encode(),headers={"Content-Type":"application/json"})
        with urllib.request.urlopen(req) as response:
            result=json.load(response);self.assertEqual(result["optimized"]["metrics"]["assigned"],10)
    def test_bad_json_returns_400(self):
        req=urllib.request.Request(self.url+"/api/solve",data=b"{")
        with self.assertRaises(urllib.error.HTTPError) as caught:urllib.request.urlopen(req)
        self.assertEqual(caught.exception.code,400)

    def test_malformed_order_returns_400_instead_of_500(self):
        data=sample();data["orders"]=[None]
        req=urllib.request.Request(self.url+"/api/solve",data=json.dumps({"data":data}).encode())
        with self.assertRaises(urllib.error.HTTPError) as caught:urllib.request.urlopen(req)
        self.assertEqual(caught.exception.code,400)

if __name__=="__main__":unittest.main()

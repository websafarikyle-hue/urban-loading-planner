import copy,json,unittest
from pathlib import Path
from unittest.mock import patch
from test_planner import sample,box,order,truck
from algorithms.planner import solve,schedule,pack
from algorithms.service import estimate_service
from algorithms.verify import verify
from algorithms.route_pool import select_routes
from server import validate
from roads import fetch_matrix
ROOT=Path(__file__).resolve().parents[1]
class V02Tests(unittest.TestCase):
    def test_service_formula_rounding_threshold_and_manual(self):
        o=order('O',[box('A',weight=30),box('B',weight=31,fragile=True)])
        e=estimate_service(o);self.assertEqual(e['minutes'],6);self.assertEqual(e['components']['重件附加'],.5)
        self.assertEqual(estimate_service(o,{'per_box_minutes':.1})['minutes'],4.5)
        o.update(service_mode='manual',service=12.25);self.assertEqual(estimate_service(o)['minutes'],12.25)
    def test_completion_deadline_not_start_and_service_propagation(self):
        data=sample();o=order('O',[box()]);o.update(lon=data['depot']['lon'],lat=data['depot']['lat'],due=483)
        result=schedule([o],truck(),data['depot'],480);self.assertEqual(result['stops'][0]['service_start'],480);self.assertFalse(result['feasible'])
        o['due']=484;self.assertTrue(schedule([o],truck(),data['depot'],480)['feasible'])
        self.assertFalse(schedule([o],truck(),data['depot'],480,service_policy={'per_box_minutes':2})['feasible'])
    def test_counterexample_service_first_and_small_reference(self):
        data=json.loads((ROOT/'docs/audit-results.json').read_text(encoding="utf-8"))['counterexample']['data']
        for mode in ('baseline','optimized','reference'):
            r=solve(data,mode);self.assertEqual(r['metrics']['assigned'],2);self.assertEqual(r['metrics']['cost'],101)
        data['orders'].reverse();self.assertEqual(solve(data)['metrics']['assigned'],2)
    def test_pool_unique_vehicle_and_order_and_priority(self):
        columns={(0,1):(1,['A']),(0,2):(2,['B']),(1,1):(100,['A']),(1,3):(250,['A','B'])}
        routes,info=select_routes(columns,2,2);self.assertEqual(sum(map(len,routes)),2);self.assertEqual(len(set(o for r in routes for o in r)),2)
        self.assertTrue(info['pool_selection_exact'])
    def test_reference_limits_and_gap_on_small_scene(self):
        data=sample();data['orders']=data['orders'][:3];data['vehicles']=data['vehicles'][:2]
        r=solve(data,'reference');o=solve(data);self.assertGreaterEqual(r['metrics']['assigned'],o['metrics']['assigned'])
        if r['metrics']['assigned']==o['metrics']['assigned']:self.assertLessEqual(r['metrics']['cost'],o['metrics']['cost']+.02)
        self.assertTrue(r['diagnostics']['routing_enumeration_complete']);self.assertFalse(r['diagnostics']['packing_exact'])
        with self.assertRaises(ValueError):solve(sample(),'reference')
    def test_matrix_asymmetry_unreachable_and_coordinate_binding(self):
        d=sample();d['orders']=d['orders'][:1];o=d['orders'][0]
        d['travel']={'provider':'TEST','query_date':'2026-10-11','profile':'car','coordinate_system':'WGS84','truck_restrictions_verified':False,
            'points':[{k:p[k] for k in ('id','lon','lat')} for p in [d['depot'],o]],'distances':[[0,2],[5,0]],'durations':[[0,10],[20,0]]}
        validate(d);r=schedule([o],truck(),d['depot'],480,d['travel']);self.assertEqual(r['km'],7);self.assertEqual(r['stops'][0]['arrival'],490)
        d['travel']['durations'][0][1]=None;self.assertFalse(schedule([o],truck(),d['depot'],480,d['travel'])['feasible'])
        d['orders'][0]['lon']+=.1
        with self.assertRaises(ValueError):validate(d)
    def test_matrix_conversion_and_no_null_fallback(self):
        d=sample();d['orders']=d['orders'][:1]
        with patch('roads.request_json',return_value={'code':'Ok','distances':[[0,1200],[None,0]],'durations':[[0,120],[None,0]],'sources':[]}):
            result=fetch_matrix(d)
        self.assertNotIn('travel',d);self.assertEqual(result['travel']['distances'][0][1],1.2);self.assertEqual(result['travel']['durations'][0][1],2)
        self.assertIsNone(result['travel']['distances'][1][0]);validate(result)
    def test_invalid_policy_and_geometry(self):
        for policy in ({'unknown':1},{'per_box_minutes':-1},{'setup_minutes':float('nan')}):
            d=sample();d['service_policy']=policy
            with self.assertRaises(ValueError):validate(d)
        d=json.loads((ROOT/'data/hangzhou-road-demo.json').read_text(encoding="utf-8"));validate(d)
        g=next(iter(d['travel']['geometries'].values()));g['geometry']['coordinates']=[[1,'bad'],[2,3]]
        with self.assertRaises(ValueError):validate(d)
    def test_independent_loading_replay_detects_invalid_sequence(self):
        route=[order('A',[box('A')]),order('B',[box('B')])];v=truck(width=50);p=pack(route,v)
        self.assertTrue(p['feasible']);self.assertEqual(verify(p['layout'],v,route,p['loading']),[])
        self.assertTrue(verify(p['layout'],v,route,list(reversed(p['loading']))))
    def test_road_cache_is_solvable_and_sources_are_public(self):
        d=json.loads((ROOT/'data/hangzhou-road-demo.json').read_text(encoding="utf-8"));validate(d);r=solve(d)
        self.assertEqual(r['metrics']['assigned'],10);self.assertFalse(d['travel']['truck_restrictions_verified'])
        self.assertTrue(all(o['source_url'].startswith('https://www.openstreetmap.org/') for o in d['orders']))
        self.assertTrue(all(s['service_end']<=s['due'] for route in r['routes'] for s in route['stops']))
if __name__=='__main__':unittest.main()

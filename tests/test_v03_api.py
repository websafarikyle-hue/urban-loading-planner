import json
import shutil
import subprocess
import threading
import unittest
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from server import Handler, ROOT

@unittest.skipUnless(shutil.which('node'), 'v0.3 API requires Node.js')
class V03ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        cls.url='http://127.0.0.1:'+str(cls.server.server_port)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def test_new_frontend_and_catalog(self):
        with urllib.request.urlopen(self.url+'/') as r:
            self.assertTrue(r.url.endswith('/v03/'));self.assertIn('方太',r.read().decode())
        for name in ('app.js','engine.js','worker.js','catalog.js','style.css'):
            with urllib.request.urlopen(self.url+'/v03/'+name) as r:self.assertEqual(r.status,200)
        with urllib.request.urlopen(self.url+'/api/v03/catalog') as r:
            c=json.load(r);self.assertEqual(len(c['stores']),20);self.assertEqual(len(c['travel']['points']),22)
    def test_api_matches_shared_engine(self):
        code="const E=require('./frontend/v03/engine.js'),C=require('./data/hangzhou-fotile-store-catalog.json');let d=E.simulate(C);d.orders=d.orders.slice(0,2);console.log(JSON.stringify(d));"
        data=json.loads(subprocess.check_output(['node','-e',code],cwd=ROOT,text=True, encoding="utf-8"))
        raw=json.dumps({'data':data,'mode':'compare'}).encode()
        req=urllib.request.Request(self.url+'/api/v03/solve',data=raw,headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req) as r:result=json.load(r)
        expected=json.loads(subprocess.check_output(['node','scripts/solve_v03.cjs'],input=raw.decode(),text=True,cwd=ROOT, encoding="utf-8"))['result']
        self.assertEqual(result['optimized']['metrics'],expected['optimized']['metrics'])
        self.assertEqual(result['optimized']['metrics']['assigned'],2)
    def test_invalid_v03_inputs_return_400(self):
        req=urllib.request.Request(self.url+'/api/v03/solve',data=b'{"data":{"orders":[]}}')
        with self.assertRaises(urllib.error.HTTPError) as ctx:urllib.request.urlopen(req)
        self.assertEqual(ctx.exception.code,400)

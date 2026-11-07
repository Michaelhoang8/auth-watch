import json, re, tempfile, threading, unittest
from contextlib import closing
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.request import urlopen, Request
from urllib.error import HTTPError
from portfolio.db import initialize, connect
from portfolio.server import handler_for

class StandaloneTests(unittest.TestCase):
 def test_home_assets_schema_and_absent_collections(self):
  with tempfile.TemporaryDirectory() as folder:
   database=str(Path(folder)/'app.db');initialize(database);initialize(database)
   with closing(connect(database)) as db:
    actual=sorted(row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'"))
    self.assertEqual(actual,[])
   server=ThreadingHTTPServer(('127.0.0.1',0),handler_for(database,api_key='standalone-test-key'))
   thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
   base=f'http://127.0.0.1:{server.server_port}'
   try:
    with urlopen(base) as response:html=response.read().decode()
    self.assertIn('<title>'+'Auth Watch'+'</title>',html)
    self.assertNotIn('data-mode=',html)
    self.assertNotIn('data-page=',html)
    for asset in re.findall(r'(?:src|href)="(/[^" ]+\.(?:js|css|json))"',html):
     with self.subTest(asset=asset),urlopen(base+asset) as response:self.assertEqual(response.status,200)
    for route in ['/data','/ml','/security','/devops']:
     with self.subTest(route=route),self.assertRaises(HTTPError) as caught:urlopen(base+route)
     self.assertEqual(caught.exception.code,404);caught.exception.close()
    fixture=json.loads((Path(__file__).resolve().parents[1]/'examples/request.json').read_text(encoding='utf-8'))
    headers={'Content-Type':'application/json','X-Portfolio-Client':'browser','X-API-Key':'standalone-test-key'}
    with urlopen(Request(base+fixture['path'],data=json.dumps(fixture['body']).encode(),headers=headers,method='POST')) as response:
     self.assertIn(response.status,(200,201));self.assertIsInstance(json.loads(response.read()),dict)
    for route in ['/api/data/profile','/api/data/clean','/api/data/sales','/api/ml/train','/api/ml/search','/api/ml/evaluate','/api/security/logs','/api/security/headers','/api/security/secrets','/api/devops/manifest','/api/devops/pipeline','/api/devops/reliability','/api/tickets','/api/products','/api/experiments','/api/v1/notes']:
     if route==fixture['path']:continue
     with self.subTest(unrelated_api=route),self.assertRaises(HTTPError) as caught:
      urlopen(Request(base+route,data=b'{}',headers=headers,method='POST'))
     self.assertEqual(caught.exception.code,404);caught.exception.close()
   finally:server.shutdown();server.server_close();thread.join()

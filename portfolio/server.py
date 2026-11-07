"""Local-only HTTP adapter; no third-party runtime dependencies."""
import argparse
import json
import os
import re
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from .db import connect, initialize
from . import capabilities, security_apps
from .validation import ValidationError, NotFoundError, ConflictError
from .json_input import decode, read_exact

STATIC = Path(__file__).parent / 'static'

def record_id(value):
    # SQLite row IDs are signed 64-bit integers; reject impossible IDs before binding.
    digits=value.lstrip('0')
    if not digits or len(digits)>19 or (len(digits)==19 and digits>'9223372036854775807'):
        raise NotFoundError('Record not found')
    return int(digits)


def handler_for(database, api_key=None):
    api_key = os.environ.get('PORTFOLIO_API_KEY','') if api_key is None else api_key
    class Handler(BaseHTTPRequestHandler):
        body_timeout=15

        def setup(self):
            super().setup()
            self.connection.settimeout(15)

        def parse_request(self):
            if not super().parse_request():
                return False
            hosts=self.headers.get_all('Host',[])
            match=re.fullmatch(r'(?:localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?',hosts[0].strip(),re.I) if len(hosts)==1 else None
            if not match or match.group(1) is not None and not 1<=int(match.group(1))<=65535:
                self.close_connection=True
                self.reply(400, {'error':'Use one loopback Host header: localhost, 127.0.0.1, or [::1]'})
                return False
            return True

        def is_rest(self):
            return False

        def do_PATCH(self):
            if self.is_rest():
                self.reply(404, {'error':'Not found'})
            else:
                self.reply(404, {'error':'Not found'})

        do_PUT = do_PATCH
        do_DELETE = do_PATCH
        do_OPTIONS = do_PATCH

        def reply(self, status, body, content_type='application/json; charset=utf-8'):
            raw = json.dumps(body).encode() if content_type.startswith('application/json') else body
            try:
                self.send_response(status)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(raw)))
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
                self.end_headers()
                if self.command != 'HEAD':
                    self.wfile.write(raw)
            except (BrokenPipeError, ConnectionResetError):
                self.close_connection = True

        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            if self.is_rest():
                self.reply(404, {'error':'Not found'})
                return
            path = self.path.split('?', 1)[0]
            downloads={}
            if path in downloads:
                export,filename=downloads[path]
                db = connect(database)
                chunks = export(db)
                try:
                    first = next(chunks)
                    self.send_response(200)
                    self.send_header('Content-Type','text/csv; charset=utf-8')
                    self.send_header('Content-Disposition',f'attachment; filename="{filename}"')
                    self.send_header('Cache-Control','no-store')
                    self.send_header('X-Content-Type-Options','nosniff')
                    self.send_header('Connection','close')
                    self.close_connection = True
                    self.end_headers()
                    if self.command == 'HEAD':
                        return
                    self.wfile.write(first.encode('utf-8'))
                    for chunk in chunks:
                        self.wfile.write(chunk.encode('utf-8'))
                except (BrokenPipeError, ConnectionResetError):
                    pass  # The download was cancelled; close its read cursor below.
                finally:
                    chunks.close()
                    db.close()
                return
            files = {'/': ('index.html', 'text/html; charset=utf-8'), '/identities.css': ('identities.css', 'text/css; charset=utf-8'), '/text_file.js': ('text_file.js', 'text/javascript; charset=utf-8'), '/security.css': ('security.css', 'text/css; charset=utf-8'), '/capabilities.js': ('capabilities.js', 'text/javascript; charset=utf-8'), '/observatory.css': ('observatory.css', 'text/css; charset=utf-8'), '/identities.js': ('identities.js', 'text/javascript; charset=utf-8'), '/security.js': ('security.js', 'text/javascript; charset=utf-8'), '/data.css': ('data.css', 'text/css; charset=utf-8'), '/observatory.js': ('observatory.js', 'text/javascript; charset=utf-8')}
            if path not in files:
                self.reply(404, {'error': 'Not found'})
                return
            name, mime = files[path]
            raw=(STATIC / name).read_bytes()
            self.reply(200, json.loads(raw) if name=='openapi.json' else raw, mime)

        def do_POST(self):
            if self.is_rest():
                self.reply(404, {'error':'Not found'})
                return
            # Custom header + JSON prevent browser cross-origin form submissions.
            if self.headers.get('X-Portfolio-Client') != 'browser' or self.headers.get_content_type() != 'application/json':
                self.reply(403, {'error': 'JSON requests require X-Portfolio-Client: browser'})
                return
            db = connect(database)
            try:
                if self.headers.get('Transfer-Encoding') or len(self.headers.get_all('Content-Length', [])) != 1:
                    raise ValidationError('Provide one Content-Length; transfer encoding is not supported')
                raw_length = self.headers.get('Content-Length', '')
                if not re.fullmatch(r'[0-9]{1,8}', raw_length):
                    raise ValidationError('A valid Content-Length is required')
                length = int(raw_length)
                limit = 6_100_000 if self.path.startswith(('/api/data/','/api/security/','/api/ml/','/api/devops/','/api/extensions/')) else 16384
                if not 0 < length <= limit:
                    raise ValidationError(f'Request must contain 1–{limit} bytes')
                data = decode(read_exact(self.rfile,length,self.connection,self.body_timeout))
                if not isinstance(data, dict):
                    raise ValidationError('Expected a JSON object')
                if self.path=='/api/security/logs':
                    self.reply(200,capabilities.enrich(self.path,data,security_apps.auth_logs(data)));return
                raise NotFoundError('Route not found')
            except TimeoutError:
                self.reply(408, {'error': 'Request body timed out'})
            except NotFoundError as error:
                self.reply(404, {'error': str(error)})
            except ConflictError as error:
                self.reply(409, {'error': str(error)})
            except sqlite3.IntegrityError:
                self.reply(409, {'error': 'Record conflicts with existing data; SKUs must be unique'})
            except (ValueError, UnicodeError) as error:
                self.reply(400, {'error': str(error)})
            except Exception:
                self.log_error('Unexpected server error')
                self.reply(500, {'error': 'Unexpected server error'})
            finally:
                db.close()
    return Handler

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--database', default='data/auth-watch.db')
    args = parser.parse_args()
    initialize(args.database)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler_for(args.database))
    print(f'Auth Watch: http://127.0.0.1:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()

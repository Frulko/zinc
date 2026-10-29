"""A stand-in for Last.fm (POST /2.0/) and ListenBrainz (POST /1/submit-listens) for tests/t1/ipod_scrobble.sh: it never talks to
the real services. Each request is checked and written as one JSON line to <dir>/requests.jsonl. While <dir>/offline exists both
answer as unavailable (Last.fm error 16 with HTTP 503, ListenBrainz 503). Usage: stub.py <dir> <port file>; the secret is SECRET."""
import hashlib, http.server, json, os, sys, urllib.parse

SECRET, KEY, TOKEN, LB_TOKEN = 'sekrit', 'apikey', 'tok123', 'lbtoken'
d = sys.argv[1]


def log(entry):
    with open(os.path.join(d, 'requests.jsonl'), 'a') as f:
        f.write(json.dumps(entry) + '\n')


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def reply(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get('Content-Length', '0'))).decode()
        offline = os.path.exists(os.path.join(d, 'offline'))
        if self.path.startswith('/2.0'):
            p = dict(urllib.parse.parse_qsl(raw, keep_blank_values=True))
            base = ''.join(k + p[k] for k in sorted(p) if k not in ('format', 'callback', 'api_sig'))
            good = hashlib.md5((base + SECRET).encode()).hexdigest() == p.get('api_sig')
            log({'service': 'lastfm', 'method': p.get('method'), 'signed': good, 'offline': offline, 'params': p})
            if offline:
                return self.reply(503, {'error': 16, 'message': 'The service is temporarily unavailable'})
            if not good or p.get('api_key') != KEY:
                return self.reply(403, {'error': 13, 'message': 'Invalid method signature supplied'})
            m = p.get('method')
            if m == 'auth.getToken':
                return self.reply(200, {'token': TOKEN})
            if m == 'auth.getSession':
                return self.reply(200, {'session': {'name': 'ann', 'key': 'sk-ann', 'subscriber': 0}}) if p.get('token') == TOKEN else self.reply(403, {'error': 14, 'message': 'Unauthorized Token'})
            if p.get('sk') != 'sk-ann':
                return self.reply(403, {'error': 9, 'message': 'Invalid session key'})
            if m == 'track.updateNowPlaying':
                return self.reply(200, {'nowplaying': {}})
            if m == 'track.scrobble':
                n = sum(1 for k in p if k.startswith('timestamp['))
                return self.reply(200, {'scrobbles': {'@attr': {'accepted': n, 'ignored': 0}}})
            return self.reply(400, {'error': 3, 'message': 'Invalid method'})
        if self.path == '/1/submit-listens':
            auth = self.headers.get('Authorization', '')
            try:
                body = json.loads(raw)
            except ValueError:
                body = None
            log({'service': 'listenbrainz', 'auth': auth, 'offline': offline, 'body': body})
            if offline:
                return self.reply(503, {'code': 503, 'error': 'unavailable'})
            if auth != 'Token ' + LB_TOKEN:
                return self.reply(401, {'code': 401, 'error': 'Invalid authorization'})
            ok = isinstance(body, dict) and body.get('listen_type') in ('single', 'import', 'playing_now') and all(
                'track_metadata' in x and ('listened_at' in x) == (body['listen_type'] != 'playing_now') for x in body.get('payload', []))
            return self.reply(200 if ok else 400, {'status': 'ok'} if ok else {'code': 400, 'error': 'bad payload'})
        self.reply(404, {'error': 'no route'})


s = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H)
with open(sys.argv[2], 'w') as f:
    f.write(str(s.server_address[1]))
s.serve_forever()

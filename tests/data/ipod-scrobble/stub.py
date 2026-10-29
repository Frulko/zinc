"""A stand-in for Last.fm (POST /2.0/) and ListenBrainz (POST /1/submit-listens) for tests/t1/ipod_scrobble.sh: it never talks to
the real services. Each request is checked and written as one JSON line to <dir>/requests.jsonl. While <dir>/offline exists both
answer as unavailable (Last.fm error 16 with HTTP 503, ListenBrainz 503). Usage: stub.py <dir> <port file>; the secret is SECRET.

For tests/t1/ipod_history.sh it also serves the reading side, from a generated history (written to <dir>/history-data.json for the
checks): Last.fm GET user.getrecenttracks (paged, from/to honoured, a now-playing row first, error 29 once at the 4th call, a new
scrobble arriving at the 6th), getlovedtracks, gettoptracks, gettopartists; ListenBrainz GET /1/user/ann/listen-count and /listens
(max_ts, count; X-RateLimit headers). GET /reset starts the history calls over; GET /fail?n=N&after=A makes getrecenttracks
answer HTTP 503 (error 16) N times, after A more good answers.

For tests/t1/ipod_genius.sh: Last.fm GET artist.getsimilar from SIMILAR (an artist it does not list has no neighbours; UNKNOWN_ARTIST
answers error 6, as Last.fm does for a name it does not know)."""
import hashlib, http.server, json, os, random, sys, time, urllib.parse

SECRET, KEY, TOKEN, LB_TOKEN = 'sekrit', 'apikey', 'tok123', 'lbtoken'
d = sys.argv[1]


def log(entry):
    with open(os.path.join(d, 'requests.jsonl'), 'a') as f:
        f.write(json.dumps(entry) + '\n')


# ---- the history served (artist, title, album, track MBID); tests/data/ipod-history/check.py knows which iPod track each one is
CATALOG = [
    ('Beyonce', 'Halo', 'I Am... Sasha Fierce', ''),
    ('Daft Punk feat. Pharrell Williams', 'Get Lucky (feat. Pharrell Williams)', 'Random Access Memories', ''),
    ('The Beatles', 'Here Comes The Sun - Remastered 2009', 'Abbey Road (Remastered)', ''),
    ('Sigur Ros', 'Hoppipolla', 'Takk...', ''),
    ('Queen', 'Bohemian Rhapsody - Live Aid', 'Live Aid', ''),
    ('Simon and Garfunkel', 'The Boxer', 'Bridge Over Troubled Water', ''),
    ('Carpenters', 'Yesterday Once Mor', 'Now & Then', ''),
    ('Scala & Kolacny Brothers', 'Creep', 'On the Rocks', ''),
    ('Radiohead', 'Karma Police', 'OK Computer', ''),
    ('Radiohed', 'Paranoid Android', 'OK Computer', 'mbid-pa'),
    ('Missing Band', 'Not On iPod', 'Nowhere', ''),
    ('Missing Band', 'Also Missing', 'Nowhere', ''),
    ('Muse', 'Starlit', 'Black Holes', ''),
]
WEIGHTS = [30, 20, 15, 12, 10, 8, 6, 5, 5, 4, 4, 3, 1]
LOVED = [0, 3, 10]


def generate():
    rnd = random.Random(7)
    deck = [i for i, w in enumerate(WEIGHTS) for _ in range(w)]
    lf, ts = [], 1600000000
    for i in range(2500):
        if i % len(deck) == 0:
            rnd.shuffle(deck)
        ts += 7200 if i % 10 == 0 else 240   # sessions of 10 listens, 2 hours apart
        a, t, al, mb = CATALOG[deck[i % len(deck)]]
        lf.append({'ts': ts, 'artist': a, 'title': t, 'album': al, 'mbid': mb})
    lb = [{'ts': x['ts'], 'artist': x['artist'], 'title': x['title'], 'album': x['album']} for x in lf[:300]]   # also on Last.fm
    ts = 1550000000
    for i in range(1200):
        ts += 7200 if i % 20 == 0 else 300
        a, t, al, _ = CATALOG[4] if i % 3 else CATALOG[1]
        lb.append({'ts': ts, 'artist': a, 'title': t, 'album': al})
    return lf, lb


LF, LB = generate()
with open(os.path.join(d, 'history-data.json'), 'w') as f:
    json.dump({'lastfm': LF, 'listenbrainz': LB, 'catalog': CATALOG, 'loved': LOVED}, f)
state = {'recent': 0, 'added': [], 'fail': 0, 'after': 0}
SIMILAR = {'Alpha One': [('Lonely Star', '0.9'), ('Someone Else', '0.5')], 'Lonely Star': [('Alpha One', '0.9')]}
UNKNOWN_ARTIST = 'Charlie Four'


def lf_track(x, extended):
    t = {'name': x['title'], 'mbid': x['mbid'], 'album': {'#text': x['album'], 'mbid': ''}, 'date': {'uts': str(x['ts']), '#text': ''},
         'artist': {'name': x['artist'], 'mbid': ''} if extended else {'#text': x['artist'], 'mbid': ''}}
    if extended:
        t['loved'] = '1' if any(CATALOG[i][1] == x['title'] for i in LOVED) else '0'
    return t


def paged(items, limit, page):
    pages = max(1, (len(items) + limit - 1) // limit)
    return items[(page - 1) * limit:page * limit], pages


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

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        p = dict(urllib.parse.parse_qsl(u.query, keep_blank_values=True))
        if u.path == '/reset':
            state['recent'] = 0
            state['added'] = []
            state['fail'] = state['after'] = 0
            return self.reply(200, {})
        if u.path == '/fail':
            state['fail'], state['after'] = int(p.get('n', '0')), int(p.get('after', '0'))
            return self.reply(200, {})
        if u.path.startswith('/2.0') and 'api_sig' in p:   # the signed reads (the sign-in, user.getInfo): as POSTs, but refused as POSTs (below)
            return self.lastfm_signed(p, False, get=True)
        if u.path.startswith('/2.0'):
            m = p.get('method', '')
            log({'service': 'lastfm-read', 'method': m, 'params': p})
            if p.get('api_key') != KEY or p.get('format') != 'json':
                return self.reply(403, {'error': 10, 'message': 'Invalid API key'})
            if m == 'artist.getsimilar':
                a = p.get('artist', '')
                if a == UNKNOWN_ARTIST:
                    return self.reply(200, {'error': 6, 'message': 'The artist you supplied could not be found'})
                rows = [{'name': n, 'match': x, 'mbid': '', 'url': ''} for n, x in SIMILAR.get(a, [])]
                return self.reply(200, {'similarartists': {'artist': rows, '@attr': {'artist': a}}})
            if p.get('user') != 'ann':
                return self.reply(404, {'error': 6, 'message': 'User not found'})
            limit, page = int(p.get('limit', '50')), int(p.get('page', '1'))
            if m == 'user.getrecenttracks':
                state['recent'] += 1
                if state['after'] > 0:
                    state['after'] -= 1
                elif state['fail'] > 0:
                    state['fail'] -= 1
                    return self.reply(503, {'error': 16, 'message': 'Service temporarily unavailable'})
                if state['recent'] == 4:
                    return self.reply(200, {'error': 29, 'message': 'Rate Limit Exceeded'})
                if state['recent'] == 6:
                    state['added'].append({'ts': int(time.time()) + 1, 'artist': 'Radiohead', 'title': 'Karma Police', 'album': 'OK Computer', 'mbid': ''})
                lo, hi = int(p.get('from', '0')), int(p.get('to', '9999999999'))
                rows = [x for x in sorted(LF + state['added'], key=lambda x: -x['ts']) if lo <= x['ts'] <= hi]
                part, pages = paged(rows, min(limit, 200), page)
                tracks = [lf_track(x, p.get('extended') == '1') for x in part]
                if page == 1:
                    tracks.insert(0, {'name': 'Now', 'artist': {'name': 'Playing', '#text': 'Playing'}, 'album': {'#text': ''}, '@attr': {'nowplaying': 'true'}})
                return self.reply(200, {'recenttracks': {'track': tracks, '@attr': {'user': 'ann', 'page': str(page), 'perPage': str(limit), 'totalPages': str(pages), 'total': str(len(rows))}}})
            if m == 'user.getlovedtracks':
                ts = 1650000000
                tracks = [{'name': CATALOG[i][1], 'mbid': CATALOG[i][3], 'artist': {'name': CATALOG[i][0], 'mbid': ''}, 'date': {'uts': str(ts + i)}} for i in LOVED]
                return self.reply(200, {'lovedtracks': {'track': tracks, '@attr': {'page': '1', 'totalPages': '1'}}})
            if m in ('user.gettoptracks', 'user.gettopartists'):
                counts = {}
                for x in LF:
                    k = (x['artist'], x['title']) if m == 'user.gettoptracks' else x['artist']
                    counts[k] = counts.get(k, 0) + 1
                ranked = sorted(counts.items(), key=lambda kv: -kv[1])[:limit]
                if m == 'user.gettoptracks':
                    return self.reply(200, {'toptracks': {'track': [{'name': k[1], 'playcount': str(n), 'artist': {'name': k[0]}, '@attr': {'rank': str(i + 1)}} for i, (k, n) in enumerate(ranked)]}})
                return self.reply(200, {'topartists': {'artist': [{'name': k, 'playcount': str(n), '@attr': {'rank': str(i + 1)}} for i, (k, n) in enumerate(ranked)]}})
            return self.reply(400, {'error': 3, 'message': 'Invalid method'})
        if u.path == '/1/validate-token':
            ok = self.headers.get('Authorization', '') == 'Token ' + LB_TOKEN
            return self.reply(200, {'code': 200, 'valid': True, 'user_name': 'ann', 'message': 'Token valid.'} if ok else {'code': 200, 'valid': False, 'message': 'Token invalid.'})
        if u.path.startswith('/1/user/'):
            log({'service': 'listenbrainz-read', 'path': u.path, 'params': p})
            if u.path == '/1/user/ann/listen-count':
                return self.reply(200, {'payload': {'count': len(LB)}})
            if u.path == '/1/user/ann/listens':
                hi, count = int(p.get('max_ts', '9999999999')), min(int(p.get('count', '25')), 1000)
                rows = [x for x in sorted(LB, key=lambda x: -x['ts']) if x['ts'] < hi][:count]
                body = json.dumps({'payload': {'count': len(rows), 'user_id': 'ann', 'listens': [
                    {'listened_at': x['ts'], 'track_metadata': {'artist_name': x['artist'], 'track_name': x['title'], 'release_name': x['album'],
                                                               'additional_info': {'duration_ms': 200000}}} for x in rows]}}).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                # the first page of a run spends the window: the client waits Reset-In seconds
                self.send_header('X-RateLimit-Remaining', '0' if hi > 1700000000 else '10')
                self.send_header('X-RateLimit-Reset-In', '1')
                self.end_headers()
                self.wfile.write(body)
                return
            return self.reply(404, {'code': 404, 'error': 'Cannot find user'})
        self.reply(404, {'error': 'no route'})

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get('Content-Length', '0'))).decode()
        offline = os.path.exists(os.path.join(d, 'offline'))
        if self.path.startswith('/2.0'):
            return self.lastfm_signed(dict(urllib.parse.parse_qsl(raw, keep_blank_values=True)), offline)
        self.listenbrainz_post(raw, offline)

    def lastfm_signed(self, p, offline, get=False):
            base = ''.join(k + p[k] for k in sorted(p) if k not in ('format', 'callback', 'api_sig'))
            good = hashlib.md5((base + SECRET).encode()).hexdigest() == p.get('api_sig')
            log({'service': 'lastfm', 'method': p.get('method'), 'signed': good, 'offline': offline, 'get': get, 'params': p})
            if offline:
                return self.reply(503, {'error': 16, 'message': 'The service is temporarily unavailable'})
            if not good or p.get('api_key') != KEY:
                return self.reply(403, {'error': 13, 'message': 'Invalid method signature supplied'})
            m = p.get('method')
            if m == 'auth.getSession' and not get and p.get('token') == TOKEN:   # as Last.fm does: an approved token is refused to a POST
                return self.reply(403, {'error': 4, 'message': 'Unauthorized Token - This token has not been issued'})
            if m == 'auth.getToken':
                return self.reply(200, {'token': TOKEN})
            if m == 'auth.getSession':
                return self.reply(200, {'session': {'name': 'ann', 'key': 'sk-ann', 'subscriber': 0}}) if p.get('token') == TOKEN else self.reply(403, {'error': 14, 'message': 'Unauthorized Token'})
            if p.get('sk') != 'sk-ann':
                return self.reply(403, {'error': 9, 'message': 'Invalid session key'})
            if m == 'user.getInfo':
                return self.reply(200, {'user': {'name': 'ann', 'playcount': '2500'}})
            if m == 'track.updateNowPlaying':
                return self.reply(200, {'nowplaying': {}})
            if m == 'track.scrobble':
                n = sum(1 for k in p if k.startswith('timestamp['))
                return self.reply(200, {'scrobbles': {'@attr': {'accepted': n, 'ignored': 0}}})
            return self.reply(400, {'error': 3, 'message': 'Invalid method'})

    def listenbrainz_post(self, raw, offline):
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

"""A stand-in for jukebox (music-lib-manager, apps/server/src/app.ts and subsonic.ts) for tests/t1/ipod_jukebox.sh: only the routes
the iPod app reads, with jukebox's shapes. Never the real server. Usage: stub.py <dir> <port file>; <dir> holds the audio the test
made (highway.wav, long.wav, tunnel.m4a, encore.m4a) and cover.png. Every request is one JSON line of <dir>/requests.jsonl.

/api/v1 (bearer TOKEN): health (open), tracks/count, facets, tracks (artist, album, q; cursor paging), tracks/:id, playlists,
playlists/:id/tracks, transcode (a job; when it ends the FLAC track holds an AAC rendition), jobs/:id (running, then done),
stream/:id (rendition=, format= converted while sent: no Range; Range answered 206 with Content-Range), artwork/:name.
A file <dir>/cut-<track id> holding an offset: the first ranged request of that track at or past the offset is cut halfway
(the file is removed).
POST /api/v1/devices and PUT /api/v1/devices/:id/tracks take what a satellite reports (tests/t1/ipod_satellite.sh).
/navi is a Subsonic-only server (its /api/v1/health is a 404) over the same library: /navi/rest/{ping, getArtists, getArtist,
getAlbum, getPlaylists, getPlaylist, search3, download, stream, getCoverArt}.view, user ann, password sesame (p=enc:)."""
import base64, http.server, json, os, sys, urllib.parse

TOKEN = 'jbtoken'
d = sys.argv[1]


def T(id, name, artist, album, nr, fmt, file, **kw):
    t = dict(id=id, sourceId='s1', path=f'{artist}/{album}/{name}.{fmt}', kind='music', name=name, artist=artist, albumArtist=artist,
             album=album, genre='', composer='', year=0, trackNumber=nr, trackCount=0, discNumber=0, duration=0, bitRate=0,
             sampleRate=0, format=fmt, size=0, rating=0, loved=False, enabled=True, comments='', grouping='', bpm=0, compilation=False,
             playCount=0, skipCount=0, dateAdded=0, lastPlayed=0, rev=1, devices=[], tags=[], artwork=None,
             renditions=[dict(id=f'r-{id}-{fmt}', format=fmt, preferred=1, lossless=fmt in ('flac', 'wav'))])
    t.update(kw)
    t['file'] = file
    return t


TRACKS = [
    T('t1', 'Highway', 'Neon', 'Night Drive', 1, 'wav', 'highway.wav', genre='Synthwave', composer='J. Neon', year=2019, trackCount=2,
      discNumber=1, rating=4, bpm=118, comments='from jukebox', grouping='Drive', duration=2, artwork='/api/v1/artwork/c0ffee.png'),
    T('t2', 'Tunnel', 'Neon', 'Night Drive', 2, 'flac', None, genre='Synthwave', year=2019, trackCount=2, discNumber=1, duration=2,
      artwork='/api/v1/artwork/c0ffee.png'),
    T('t3', 'Long Song', 'Other Band', 'Big', 1, 'wav', 'long.wav', genre='Rock', year=2001, duration=10),
    T('t4', 'Encore', 'Other Band', 'Big', 2, 'flac', None, genre='Rock', year=2001, duration=2),
]
BY_ID = {t['id']: t for t in TRACKS}
PLAYLISTS = [dict(id='pl-1', name='Road Trip', smart=None, rules=None, createdAt=0, rev=1, tracks=['t3', 't1'])]
JOBS = {}


def public(t):
    return {k: v for k, v in t.items() if k != 'file'}


def log(entry):
    with open(os.path.join(d, 'requests.jsonl'), 'a') as f:
        f.write(json.dumps(entry) + '\n')


def sub_song(t):
    return dict(id=t['id'], title=t['name'], album=t['album'], artist=t['albumArtist'], track=t['trackNumber'] or None, year=t['year'] or None,
                genre=t['genre'] or None, coverArt=t['id'] if t['artwork'] else None, suffix=t['format'], duration=t['duration'],
                discNumber=t['discNumber'] or None, userRating=t['rating'] or None, isDir=False, type='music')


def b64(s):
    return base64.urlsafe_b64encode(s.encode()).decode().rstrip('=')


def unb64(s):
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4)).decode()


class H(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *a):
        pass

    def send(self, status, body, ctype='application/json', extra=None):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def fail(self, status, code, message):
        self.send(status, {'error': {'code': code, 'message': message}})

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return json.loads(self.rfile.read(n) or b'{}')

    def do_POST(self):
        self.do_GET()

    def do_PUT(self):
        self.do_GET()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        path = u.path
        entry = {'method': self.command, 'path': path, 'query': q, 'range': self.headers.get('Range')}
        if path.startswith('/navi/'):
            log(entry)
            return self.subsonic(path[len('/navi'):], q)
        if not path.startswith('/api/v1/'):
            return self.fail(404, 'not_found', 'unknown route')
        p = path[len('/api/v1'):]
        if p == '/health':
            log(entry)
            return self.send(200, {'ok': True, 'revision': 1})
        auth = self.headers.get('Authorization') or ''
        if auth != 'Bearer ' + TOKEN and q.get('token') != TOKEN:
            log(entry)
            return self.fail(401, 'unauthorized', 'a bearer token is required')
        if self.command in ('POST', 'PUT'):
            entry['body'] = self.body()
            entry['auth'] = auth
        log(entry)
        if p == '/devices' and self.command == 'POST':   # a satellite registers its device (app.ts api.post('/devices'))
            b = entry['body']
            if not b.get('id') or not b.get('name') or not b.get('kind'):
                return self.fail(400, 'bad_body', 'expected { id, name, kind }')
            return self.send(201, dict(b, connected=1))
        if p.startswith('/devices/') and p.endswith('/tracks') and self.command == 'PUT':   # what is on it, matched as jukebox does
            items = entry['body'].get('items')
            if not isinstance(items, list):
                return self.fail(400, 'bad_body', 'expected { items: [] }')
            matched = sum(1 for it in items if any(t['artist'].lower() == (it.get('artist') or '').lower() and t['name'].lower() == (it.get('name') or '').lower()
                                                   and abs(t['duration'] - (it.get('duration') or 0)) <= 3 for t in TRACKS))
            return self.send(200, {'received': len(items), 'matched': matched, 'orphans': len(items) - matched})
        if p == '/tracks/count':
            return self.send(200, {'count': len(TRACKS)})
        if p == '/facets':
            def facet(key, rows):
                out = {}
                for t in rows:
                    out[t[key]] = out.get(t[key], 0) + 1
                return [{'value': k, 'count': v} for k, v in sorted(out.items())]
            rows = [t for t in TRACKS if not q.get('artist') or t['albumArtist'] == q['artist']]
            return self.send(200, {'genres': facet('genre', TRACKS), 'artists': facet('albumArtist', TRACKS), 'albums': facet('album', rows),
                                   'formats': [], 'tags': [], 'folders': []})
        if p == '/tracks':
            rows = [t for t in TRACKS if (not q.get('artist') or t['albumArtist'] == q['artist']) and (not q.get('album') or t['album'] == q['album'])
                    and (not q.get('q') or q['q'].lower() in (t['name'] + ' ' + t['artist'] + ' ' + t['album']).lower())]
            return self.page(rows, q)
        if p.startswith('/tracks/'):
            t = BY_ID.get(p[len('/tracks/'):])
            return self.send(200, public(t)) if t else self.fail(404, 'not_found', 'unknown track')
        if p == '/playlists':
            return self.send(200, {'items': [dict({k: v for k, v in x.items() if k != 'tracks'}, trackCount=len(x['tracks'])) for x in PLAYLISTS]})
        if p.startswith('/playlists/') and p.endswith('/tracks'):
            pl = [x for x in PLAYLISTS if x['id'] == p.split('/')[2]]
            return self.page([BY_ID[i] for i in pl[0]['tracks']], q) if pl else self.fail(404, 'not_found', 'unknown playlist')
        if p == '/transcode':
            b = entry['body']
            job = dict(id=f'job-{len(JOBS) + 1}', kind='transcode', state='queued', label=None, polls=0, ids=b['ids'], format=b['format'],
                       progress=dict(done=0, total=len(b['ids']), bytes=0), error=None, createdAt=0, startedAt=None, finishedAt=None)
            JOBS[job['id']] = job
            return self.send(202, {k: v for k, v in job.items() if k not in ('polls', 'ids', 'format')})
        if p.startswith('/jobs/'):
            job = JOBS.get(p[len('/jobs/'):])
            if not job:
                return self.fail(404, 'not_found', 'unknown job')
            job['polls'] += 1
            if job['polls'] == 1:
                job['state'] = 'running'
            elif job['state'] != 'done':
                job['state'] = 'done'
                job['progress']['done'] = job['progress']['total']
                for i in job['ids']:   # jukebox keeps the conversion as a second rendition of the track
                    t = BY_ID[i]
                    t['renditions'].append(dict(id=f'r-{i}-aac', format='aac', preferred=0, lossless=False))
            return self.send(200, {k: v for k, v in job.items() if k not in ('polls', 'ids', 'format')})
        if p.startswith('/stream/'):
            t = BY_ID.get(p[len('/stream/'):])
            if not t:
                return self.fail(404, 'not_found', 'unknown track')
            return self.stream(t, q.get('rendition'), q.get('format'))
        if p.startswith('/artwork/'):
            return self.send(200, open(os.path.join(d, 'cover.png'), 'rb').read(), 'image/png')
        return self.fail(404, 'not_found', 'unknown route')

    def page(self, rows, q):
        limit = int(q.get('limit') or 200)
        at = int(q.get('cursor') or 0)
        nxt = str(at + limit) if at + limit < len(rows) else None
        return self.send(200, {'items': [public(t) for t in rows[at:at + limit]], 'next': nxt, 'revision': 1})

    def file_of(self, t, rendition, fmt):
        if rendition:
            if rendition == f'r-{t["id"]}-aac' and any(r['id'] == rendition for r in t['renditions']):
                return t['id'] == 't2' and 'tunnel.m4a' or 'encore.m4a', True
            if rendition == f'r-{t["id"]}-{t["format"]}' and t['file']:
                return t['file'], True
            return None, False
        if fmt and fmt != t['format']:
            return ('tunnel.m4a' if t['id'] == 't2' else 'encore.m4a'), False   # converted while sent: no length known, no Range
        return t['file'], True

    def stream(self, t, rendition, fmt):
        name, ranged = self.file_of(t, rendition, fmt)
        if not name:
            return self.fail(404, 'not_found', f'this track has no {rendition} rendition')
        data = open(os.path.join(d, name), 'rb').read()
        rng = self.headers.get('Range')
        if not ranged or not rng:
            return self.send(200, data, 'audio/mp4' if name.endswith('.m4a') else 'audio/wav')
        a, _, b = rng[len('bytes='):].partition('-')
        a = int(a)
        b = min(int(b) if b else len(data) - 1, len(data) - 1)
        if a >= len(data):
            return self.send(416, b'', 'audio/wav', {'Content-Range': f'bytes */{len(data)}'})
        chunk = data[a:b + 1]
        cut = os.path.join(d, 'cut-' + t['id'])
        if os.path.exists(cut) and a >= int(open(cut).read()):
            os.remove(cut)
            self.send_response(206)
            self.send_header('Content-Type', 'audio/wav')
            self.send_header('Content-Length', str(len(chunk)))
            self.send_header('Content-Range', f'bytes {a}-{b}/{len(data)}')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(chunk[:len(chunk) // 2])
            self.wfile.flush()
            self.close_connection = True
            return
        self.send(206, chunk, 'audio/wav', {'Content-Range': f'bytes {a}-{b}/{len(data)}', 'Accept-Ranges': 'bytes'})

    # ---- Subsonic, as jukebox's subsonic.ts answers

    def subsonic(self, p, q):
        if p == '/api/v1/health':
            return self.send(404, b'not found\n', 'text/plain')
        if not p.startswith('/rest/'):
            return self.send(404, b'not found\n', 'text/plain')
        view = p[len('/rest/'):]
        ok = lambda body: self.send(200, {'subsonic-response': dict(status='ok', version='1.16.1', type='jukebox', **body)})
        pw = q.get('p', '')
        if q.get('u') != 'ann' or (bytes.fromhex(pw[4:]).decode() if pw.startswith('enc:') else pw) != 'sesame':
            return self.send(200, {'subsonic-response': dict(status='failed', version='1.16.1', error=dict(code=40, message='wrong username or password'))})
        if view == 'ping.view':
            return ok({})
        if view == 'getArtists.view':
            names = sorted({t['albumArtist'] for t in TRACKS})
            return ok({'artists': {'index': [{'name': n[0], 'artist': [{'id': 'ar-' + b64(n), 'name': n,
                       'albumCount': len({t['album'] for t in TRACKS if t['albumArtist'] == n})}]} for n in names]}})
        if view == 'getArtist.view':
            n = unb64(q['id'][3:])
            albums = sorted({t['album'] for t in TRACKS if t['albumArtist'] == n})
            return ok({'artist': {'id': q['id'], 'name': n, 'album': [{'id': 'al-' + b64(n + '\0' + a), 'name': a, 'artist': n} for a in albums]}})
        if view == 'getAlbum.view':
            n, a = unb64(q['id'][3:]).split('\0')
            return ok({'album': {'id': q['id'], 'name': a, 'song': [sub_song(t) for t in TRACKS if t['albumArtist'] == n and t['album'] == a]}})
        if view == 'getPlaylists.view':
            return ok({'playlists': {'playlist': [{'id': x['id'], 'name': x['name'], 'songCount': len(x['tracks'])} for x in PLAYLISTS]}})
        if view == 'getPlaylist.view':
            x = [x for x in PLAYLISTS if x['id'] == q['id']][0]
            return ok({'playlist': {'id': x['id'], 'name': x['name'], 'entry': [sub_song(BY_ID[i]) for i in x['tracks']]}})
        if view == 'search3.view':
            s = q.get('query', '').lower()
            return ok({'searchResult3': {'song': [sub_song(t) for t in TRACKS if s and s in t['name'].lower()]}})
        if view == 'download.view':   # original bytes only, as jukebox does
            return self.stream(BY_ID[q['id']], None, None)
        if view == 'stream.view':
            return self.stream(BY_ID[q['id']], None, q.get('format'))
        if view == 'getCoverArt.view':
            return self.send(200, open(os.path.join(d, 'cover.png'), 'rb').read(), 'image/png')
        return self.send(200, {'subsonic-response': dict(status='failed', version='1.16.1', error=dict(code=0, message='unknown view'))})


s = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H)
with open(sys.argv[2] + '.tmp', 'w') as f:
    f.write(str(s.server_address[1]))
os.rename(sys.argv[2] + '.tmp', sys.argv[2])
s.serve_forever()

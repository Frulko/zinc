"""A stand-in for the online services of examples/ipod's Discover, Repair and Lyrics (tests/t1/ipod_discover.sh, ipod_repair.sh,
ipod_lyrics.sh): it never talks to the real ones. Each request is written as one JSON line to <dir>/requests.jsonl (path, query and
User-Agent). Usage: stub.py <dir> <port file>.
  /2.0/            Last.fm GET: artist.gettopalbums, artist.gettoptracks (Cassius), artist.getcorrection (any case of "daft punk")
  /ws/2/release    MusicBrainz release search (Moon Safari by Air) and /ws/2/release-group/<id>?inc=genres
  /release/<id>/front-500   the Cover Art Archive: a redirect to /img/<id>.png, a 64x64 PNG
  /api/get         LRCLIB: synced lyrics of "Sing Along" by Lyric Band, plain ones of "Plain Song", 404 otherwise"""
import http.server, json, os, struct, sys, urllib.parse, zlib

d = sys.argv[1]
KEY = 'apikey'
LRC = '[00:00.00] First line of the song\n[00:00.80] Second line comes now\n[00:01.40] Third and last line\n'


def log(entry):
    with open(os.path.join(d, 'requests.jsonl'), 'a') as f:
        f.write(json.dumps(entry) + '\n')


def png():
    rows = b''.join(b'\0' + bytes([200, 60 + y * 2, 40]) * 64 for y in range(64))
    def chunk(t, b): return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 64, 64, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype='application/json', extra=None):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def reply(self, code, obj):
        self.send(code, json.dumps(obj).encode())

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        p = dict(urllib.parse.parse_qsl(u.query, keep_blank_values=True))
        log({'path': u.path, 'query': p, 'agent': self.headers.get('User-Agent', '')})
        if u.path.startswith('/2.0'):
            if p.get('api_key') != KEY:
                return self.reply(403, {'error': 10, 'message': 'Invalid API key'})
            m, a = p.get('method', ''), p.get('artist', '')
            if m == 'artist.gettopalbums':
                rows = [{'name': n, 'playcount': c} for n, c in (('Feeling for You', 900), ('1999', 800), ('Au Reve', 500))] if a == 'Cassius' else []
                return self.reply(200, {'topalbums': {'album': rows, '@attr': {'artist': a}}})
            if m == 'artist.gettoptracks':
                rows = [{'name': n, 'playcount': c} for n, c in (('Cassius 1999', 700), ('The Sound of Violence', 600))] if a == 'Cassius' else []
                return self.reply(200, {'toptracks': {'track': rows, '@attr': {'artist': a}}})
            if m == 'artist.getcorrection':
                name = 'Daft Punk' if a.lower() == 'daft punk' else a
                return self.reply(200, {'corrections': {'correction': {'artist': {'name': name}}}})
            return self.reply(400, {'error': 3, 'message': 'Invalid Method'})
        if u.path == '/ws/2/release':
            q = p.get('query', '')
            rel = [{'id': 'mbid-moon', 'score': 100, 'title': 'Moon Safari', 'date': '1998-01-16', 'release-group': {'id': 'rg-moon'},
                    'artist-credit': [{'name': 'Air'}]}] if 'Moon Safari' in q else []
            return self.reply(200, {'releases': rel, 'count': len(rel)})
        if u.path == '/ws/2/release-group/rg-moon':
            return self.reply(200, {'id': 'rg-moon', 'genres': [{'name': 'downtempo', 'count': 2}, {'name': 'electronic', 'count': 5}]})
        if u.path.startswith('/release/') and u.path.endswith('/front-500'):
            rid = u.path.split('/')[2]
            if rid != 'mbid-moon':
                return self.send(404, b'')
            return self.send(307, b'', 'text/plain', {'Location': '/img/%s.png' % rid})
        if u.path.startswith('/img/'):
            return self.send(200, png(), 'image/png')
        if u.path == '/api/get':
            t = p.get('track_name', '')
            if t == 'Sing Along' and p.get('artist_name') == 'Lyric Band':
                return self.reply(200, {'id': 1, 'trackName': t, 'syncedLyrics': LRC, 'plainLyrics': 'First line of the song\nSecond line comes now\nThird and last line\n'})
            if t == 'Plain Song':
                return self.reply(200, {'id': 2, 'trackName': t, 'syncedLyrics': None, 'plainLyrics': 'Only plain words\nNo times here\n'})
            return self.reply(404, {'code': 404, 'name': 'TrackNotFound', 'message': 'Failed to find specified track'})
        return self.reply(404, {})


s = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H)
with open(sys.argv[2], 'w') as f:
    f.write(str(s.server_address[1]))
s.serve_forever()

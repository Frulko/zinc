"""A stand-in for AudioMuse-AI 3.6.4's REST API for tests/t1/ipod_deep.sh: it never talks to a real AudioMuse. The JSON shapes are
those of its source (app.py /api/status, /api/cancel, /api/last_task; app_analysis.py /api/analysis/start; app_sync.py /api/sync;
app_path.py /api/find_path; /api/similar_tracks as recorded in docs/reports/audiomuse-setup.md). Bearer token TOKEN, else 401 with
its error body. The library it "analysed" is <dir>/library.json (written by tests/data/ipod-deep/main.ts: item ids, names,
mood_vector, other_features, tempo, energy). Each request is one JSON line of <dir>/requests.jsonl. Usage: stub.py <dir> <port file>.
  analysis   task-1 runs three albums, one per status call, then SUCCESS; task-2 runs until POST /api/cancel/task-2, then REVOKED
  sync       pages of PAGE songs (has_more, next_page), so the client has to page; fields=index gives {id, fp}
  similar    the n nearest by Euclidean distance over the mood and feature scores"""
import http.server, json, math, os, sys, urllib.parse

TOKEN, PAGE = 'muse-token', 4
d = sys.argv[1]
tasks = {}   # task id -> [state, step]


def log(entry):
    with open(os.path.join(d, 'requests.jsonl'), 'a') as f:
        f.write(json.dumps(entry) + '\n')


def library():
    with open(os.path.join(d, 'library.json')) as f:
        return json.load(f)


def vec(t):
    v = {}
    for text in (t['mood_vector'], t['other_features']):
        for part in text.split(','):
            k, _, x = part.rpartition(':')
            v[k] = float(x)
    return v


def dist(a, b):
    keys = set(a) | set(b)
    return math.sqrt(sum((a.get(k, 0) - b.get(k, 0)) ** 2 for k in keys))


def row(t, extra=None):
    r = {'item_id': t['id'], 'title': t['title'], 'author': t['artist'], 'album': t['album'], 'album_artist': 'unknown'}
    r.update(extra or {})
    return r


def error(code, message):
    return code, {'error_code': 'X%d' % code, 'error_message': message, 'error': message}


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_any(self, method):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        n = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(n).decode() if n else ''
        auth = self.headers.get('Authorization', '')
        log({'method': method, 'path': u.path, 'query': q, 'body': body, 'auth': auth})
        if auth != 'Bearer ' + TOKEN:
            return self.reply(*error(401, 'Authentication required.'))
        self.reply(*self.route(method, u.path, q))

    def do_GET(self):
        self.handle_any('GET')

    def do_POST(self):
        self.handle_any('POST')

    def route(self, method, path, q):
        lib = library()
        if path == '/api/last_task':
            return 200, {'task_id': 'task-0', 'task_type': 'main_analysis', 'status': 'SUCCESS', 'progress': 100, 'details': {}}
        if path == '/api/analysis/start' and method == 'POST':
            tid = 'task-%d' % (len(tasks) + 1)
            tasks[tid] = ['RUNNING', 0]
            return 202, {'status': 'NEW', 'task_id': tid, 'task_type': 'main_analysis'}
        if path.startswith('/api/status/'):
            tid = path.rsplit('/', 1)[1]
            if tid not in tasks:
                return error(404, 'Task ID not found.')
            t = tasks[tid]
            if t[0] == 'RUNNING' and tid == 'task-1':
                t[1] += 1
                if t[1] >= 3:
                    t[0] = 'SUCCESS'
            msg = 'Task revoked.' if t[0] == 'REVOKED' else 'Albums %d/3' % t[1]
            return 200, {'task_id': tid, 'state': t[0], 'status_message': msg, 'progress': 100 if t[0] != 'RUNNING' else t[1] * 33,
                         'details': {'albums_completed': t[1], 'tracks_analyzed': t[1] * 2, 'failed_albums': 0, 'log': []},
                         'task_type_from_db': 'main_analysis', 'running_time_seconds': 1.5}
        if path.startswith('/api/cancel/') and method == 'POST':
            tid = path.rsplit('/', 1)[1]
            if tid in tasks:
                tasks[tid][0] = 'REVOKED'
            return 200, {'message': 'Task %s cancellation requested. 1 cancellation actions attempted.' % tid, 'task_id': tid, 'cancelled_jobs_count': 1}
        if path == '/api/sync':
            page, limit = int(q.get('page', 1)), min(int(q.get('limit', 500)), PAGE)
            tracks = sorted(lib, key=lambda t: t['id'])
            chunk = tracks[(page - 1) * limit:page * limit]
            more = page * limit < len(tracks)
            out = {'total_tracks': len(tracks), 'provider_type': 'navidrome', 'has_more': more, 'next_page': page + 1 if more else None}
            if q.get('fields') == 'index':
                out['tracks'] = [{'id': t['id'], 'fp': '%016x' % i} for i, t in enumerate(chunk)]
            else:
                out['tracks'] = [{'id': t['id'], 'title': t['title'], 'artist': t['artist'], 'album_artist': 'unknown', 'album': t['album'],
                                  'year': None, 'tempo': t['tempo'], 'key': 'A', 'scale': 'minor', 'mood_vector': t['mood_vector'],
                                  'energy': t['energy'], 'other_features': t['other_features'], 'rating': None, 'umap_x': None,
                                  'umap_y': None, 'fp': 'f'} for t in chunk]
            return 200, out
        if path == '/api/similar_tracks':
            seed = [t for t in lib if t['id'] == q.get('item_id')]
            if not seed:
                return error(404, 'Track not found.')
            v = vec(seed[0])
            near = sorted((dist(v, vec(t)), t['id'], t) for t in lib if t['id'] != seed[0]['id'])
            return 200, [row(t, {'distance': round(x, 4), 'mood_vector': t['mood_vector'], 'other_features': t['other_features']})
                         for x, _, t in near[:int(q.get('n', 10))]]
        if path == '/api/find_path':
            a, b = q.get('start_song_id'), q.get('end_song_id')
            by = {t['id']: t for t in lib}
            if a not in by or b not in by:
                return error(404, 'Song not found.')
            # the songs between: those closer to both ends than the ends are to each other, nearest to the start first
            va, vb = vec(by[a]), vec(by[b])
            mid = sorted((dist(va, vec(t)), t['id']) for t in lib if t['id'] not in (a, b) and dist(vb, vec(t)) < dist(va, vb) and dist(va, vec(t)) < dist(va, vb))
            ids = [a] + [i for _, i in mid][:int(q.get('max_steps', 25)) - 2] + [b]
            return 200, {'path': [row(by[i]) for i in ids], 'total_distance': round(dist(va, vb), 4)}
        return error(404, 'Not found.')


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
with open(sys.argv[2] + '.part', 'w') as f:
    f.write(str(srv.server_address[1]))
os.rename(sys.argv[2] + '.part', sys.argv[2])
srv.serve_forever()

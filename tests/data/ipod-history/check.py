"""tests/t1/ipod_history.sh's fixtures and checks. `check.py setup <dir>`: the fake iPod's cache folder (library.json, history.jsonl)
and a ListenBrainz export zip, from the history the stub generated (<dir>/history-data.json). `check.py check <dir> <out.json>`:
what tests/data/ipod-history/main.ts printed against what that history must give."""
import json, os, sys, zipfile

d = sys.argv[2]
data = json.load(open(os.path.join(d, 'history-data.json')))
LF, LB, CAT = data['lastfm'], data['listenbrainz'], data['catalog']
GUID = '000A27001234ABCD'
LIB = [  # the fixture iPod: what each Last.fm spelling must find (accents, feat., remaster, live, & / and, a fuzzy one, an MBID)
    ('t1', 'Beyoncé', 'Halo', 'I Am... Sasha Fierce', ''),
    ('t2', 'Daft Punk', 'Get Lucky', 'Random Access Memories', ''),
    ('t3', 'The Beatles', 'Here Comes the Sun', 'Abbey Road', ''),
    ('t4', 'Sigur Rós', 'Hoppípolla', 'Takk...', ''),
    ('t5', 'Queen', 'Bohemian Rhapsody', 'A Night at the Opera', ''),
    ('t6', 'Simon & Garfunkel', 'The Boxer', 'Bridge over Troubled Water', ''),
    ('t7', 'Carpenters', 'Yesterday Once More', 'Now & Then', ''),
    ('t8', 'Radiohead', 'Creep', 'Pablo Honey', ''),
    ('t9', 'Radiohead', 'Karma Police', 'OK Computer', ''),
    ('t10', 'Björk', 'Jóga', 'Homogenic', ''),
    ('t11', 'Radiohead', 'Paranoid Android', 'OK Computer', 'mbid-pa'),
    ('t12', 'Muse', 'Starlight', 'Black Holes and Revelations', ''),
    ('t13', 'Muse', 'Starlite', 'Black Holes and Revelations', ''),   # two near spellings: "Starlit" must stay unmatched
]
WANT = {  # catalog index -> (track id, method)
    0: ('t1', 'exact'), 1: ('t2', 'exact'), 2: ('t3', 'exact'), 3: ('t4', 'exact'), 4: ('t5', 'exact'), 5: ('t6', 'exact'),
    6: ('t7', 'fuzzy'), 7: ('', 'none'), 8: ('t9', 'exact'), 9: ('t11', 'mbid'), 10: ('', 'none'), 11: ('', 'none'), 12: ('', 'none'),
}
KARMA = next(x for x in LF if x['title'] == 'Karma Police')   # the iPod's own listen of it, 30 s later: the same listen
ZIP_N = 40


def iso(ts):
    import datetime
    return datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S+00:00')


def setup():
    c = os.path.join(d, 'cache', GUID)
    os.makedirs(c, exist_ok=True)
    tracks = [{'id': i, 'artist': a, 'albumArtist': '', 'title': t, 'album': al, **({'mbid': mb} if mb else {})} for i, a, t, al, mb in LIB]
    json.dump({'marker': 'm1', 'tracks': tracks, 'playlists': [], 'specs': []}, open(os.path.join(c, 'library.json'), 'w'))
    line = lambda lid, tid, a, t, al, ts, heard, counted: json.dumps({'listen': lid, 'trackId': tid, 'artist': a, 'title': t, 'album': al, 'durationMs': 200000,
                                                                     'heardMs': heard, 'startedAt': iso(ts), 'source': 'mac', 'counted': counted, 'skipped': not counted})
    with open(os.path.join(c, 'history.jsonl'), 'w') as f:
        f.write(line('a1', 't10', 'Björk', 'Jóga', 'Homogenic', 1610000000, 10000, False) + '\n')
        f.write(line('a2', 't8', 'Radiohead', 'Creep', 'Pablo Honey', 1610000300, 5000, False) + '\n')
        f.write(line('a1', 't10', 'Björk', 'Jóga', 'Homogenic', 1610000000, 150000, True) + '\n')   # taken up again: it counted
        f.write(line('a3', 't9', 'Radiohead', 'Karma Police', 'OK Computer', KARMA['ts'] + 30, 200000, True) + '\n')
        f.write('{"listen": "cut')   # being written: read next time
    with zipfile.ZipFile(os.path.join(d, 'export.zip'), 'w') as z:
        z.writestr('user.json', json.dumps({'user_id': 1, 'username': 'ann'}))
        rows = []
        for i in range(ZIP_N):
            ts = 1520000000 + i * 600
            rows.append(json.dumps({'listened_at': ts if i % 2 else iso(ts), 'recording_msid': 'x',
                                    'track_metadata': {'artist_name': 'Björk', 'track_name': 'Jóga', 'release_name': 'Homogenic', 'additional_info': {}}}))
        z.writestr('listens/2018/1.jsonl', '\n'.join(rows[:25]) + '\n')
        z.writestr('listens/2018/2.jsonl', '\n'.join(rows[25:]) + '\n')
        z.writestr('feedback.jsonl', json.dumps({'recording_mbid': 'mbid-pa', 'score': 1, 'created': 1650000100}) + '\n' +
                   json.dumps({'recording_mbid': 'mbid-none', 'score': -1, 'created': 1650000200}) + '\n')


def check(out):
    o = json.load(open(out))
    errs = []
    def eq(name, got, want):
        if got != want:
            errs.append('%s: got %r, want %r' % (name, got, want))
    eq('local listens first', o['localFirst'], 2)   # Jóga (counted on its second line), Karma Police; Creep skipped is not a listen
    if not o['cut'].startswith('Stopped at page 3 of '):
        errs.append('the cut import: %r' % o['cut'])
    eq('unfinished after the cut', o['unfinished'], True)
    eq('unfinished after the resume', o['unfinishedAfter'], False)
    if not o['resumePages'] or not o['resumePages'][0].startswith('4/'):
        errs.append('the resume did not go on from page 4: %r' % o['resumePages'])
    notes = o['resumeNotes']   # the job's steps: where it resumes, the rate limit retried, one line per page
    if not notes or not notes[0].startswith('resuming from page 3,') or not any('Rate Limit Exceeded: trying again in' in n for n in notes) \
            or sum(1 for n in notes if n.startswith('page ')) != len(o['resumePages']):
        errs.append('the resume\'s steps: %r' % notes[:6])
    eq('incremental', o['incremental'], '1 new listen (1 page)')
    eq('nothing new', o['again'], '0 new listens (1 page)')
    eq('ListenBrainz', o['listenbrainz'], '%d new listens (2 pages)' % (len(LB) - 300))
    eq('zip', o['zip'], '%d new listens from export.zip' % ZIP_N)
    eq('zip again', o['zipAgain'], '0 new listens from export.zip')
    eq('wrong user', o['wrongUser'], 'Last.fm: User not found')
    # the listens: Last.fm's 2500 + the one added (its Karma Police is the iPod's), ListenBrainz's own, the zip's, the iPod's 2
    total = len(LF) + 1 - 1 + (len(LB) - 300) + ZIP_N + 2
    key = lambda a, t: next(i for i, c in enumerate(CAT) if c[0] == a and c[1] == t)
    by_id = {}
    for x in LF + LB[300:] + [KARMA_ADDED]:
        by_id.setdefault(WANT[key(x['artist'], x['title'])][0], []).append(x['ts'])
    by_id['t10'] = by_id.get('t10', []) + [1520000000 + i * 600 for i in range(ZIP_N)] + [1610000000]
    matched = sum(len(v) for k, v in by_id.items() if k != '')
    unmatched_keys = sorted(set((x['artist'], x['title']) for x in LF if WANT[key(x['artist'], x['title'])][0] == ''))
    eq('counts', o['counts'], [total, matched, len(set((x['artist'], x['title']) for x in LF + LB)) + 1, len(unmatched_keys) + 0, len(by_id.get('', []))])
    for i, c in enumerate(CAT):
        eq('match of %s | %s' % (c[0], c[1]), o['matches'][c[0] + '|' + c[1]], '%s|%s' % WANT[i])
    eq('match of Björk | Jóga', o['matches']['Björk|Jóga'], 't10|exact')
    win = [x for x in LF if 1600000000 <= x['ts'] < 1605000000]
    counts = {}
    for x in win:
        counts[(x['artist'], x['title'])] = counts.get((x['artist'], x['title']), 0) + 1
    want = sorted(counts.items(), key=lambda kv: (-kv[1], -max(y['ts'] for y in win if (y['artist'], y['title']) == kv[0])))[:3]
    eq('top tracks', o['topTracks'], ['%s|%s|%d|0' % (k[0], k[1], n) for k, n in want])
    eq('sessions', o['sessions'], 250)
    eq('first session', o['firstSession'], [LF[0]['ts'], 10])
    pp = o['podPlays']
    for tid in ('t5', 't7', 't10', 't11'):
        eq('plays of %s' % tid, pp.get(tid, [0, 0, 0])[0], len(by_id.get(tid, [])))
    eq('Creep skipped on the iPod', pp.get('t8'), [0, 1, 1610000300])
    eq('last played', o['lastPlayed'], max(x['ts'] for x in LF if x['title'] == 'Yesterday Once Mor'))
    eq('top unmatched artist', o['unmatchedArtists'][0].split('|')[0], 'Missing Band')
    eq('loved', o['loved'], 4)   # Halo, Hoppipolla, Not On iPod from Last.fm, Paranoid Android from the zip's feedback
    top = sorted(counts_all(LF).items(), key=lambda kv: -kv[1])
    eq('Last.fm top track', o['topOverall'][0], '%s|%s|%d|0' % (top[0][0][0], top[0][0][1], top[0][1]))
    if errs:
        print('\n'.join(errs[:20]))
        sys.exit(1)


def counts_all(rows):
    c = {}
    for x in rows:
        c[(x['artist'], x['title'])] = c.get((x['artist'], x['title']), 0) + 1
    return c


KARMA_ADDED = {'artist': 'Radiohead', 'title': 'Karma Police', 'ts': 0}   # the scrobble the stub adds during the import
if sys.argv[1] == 'setup':
    setup()
else:
    check(sys.argv[3])

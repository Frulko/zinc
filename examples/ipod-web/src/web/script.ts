// The page's script (plain JavaScript, no library): the token, the header from /api/status, the songs table (search, sort, pages
// of PAGE_ROWS), the albums and playlists, the player. manage.ts adds the uploads, the deletes, the eject and the specs.
// Data goes into the page with textContent only. The JavaScript is a TS template: no backticks, no dollar-brace, no backslash.
import { MANAGE } from './manage';

const CORE = `
var PAGE_ROWS = 200;
var S = { token: '', status: null, tracks: [], playlists: [], byId: {}, view: 'songs', query: '', sortKey: '', sortDir: 1,
  page: 0, filter: null, list: [], selected: {}, queue: [], current: '', libKey: '' };
function $(id) { return document.getElementById(id); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
try { S.token = localStorage.getItem('ipod-web-token') || ''; } catch (e) {}

function withToken(url) { return S.token ? url + (url.indexOf('?') < 0 ? '?' : '&') + 'token=' + encodeURIComponent(S.token) : url; }
function authHeaders() { return S.token ? { Authorization: 'Bearer ' + S.token } : {}; }
function NeedToken() {}
/** fetch an /api route as JSON; a 401 shows the token form and throws. */
function api(path, init) {
  init = init || {};
  init.headers = Object.assign(authHeaders(), init.headers || {});
  return fetch(path, init).then(function (r) {
    if (r.status === 401) { askToken(S.token ? 'This token is not the daemon’s.' : ''); throw new NeedToken(); }
    return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; });
  });
}
function askToken(why) {
  $('token-form').hidden = false; $('app').hidden = true; $('token-error').textContent = why || '';
  setConn('warn', 'Token needed'); $('token').focus();
}
$('token-form').addEventListener('submit', function (ev) {
  ev.preventDefault();
  S.token = $('token').value.trim();
  try { localStorage.setItem('ipod-web-token', S.token); } catch (e) {}
  $('token-form').hidden = true; $('app').hidden = false; S.libKey = ''; refresh();
});

function setConn(kind, text) { var c = $('conn'); c.className = 'conn ' + kind; c.querySelector('b').textContent = text; }
function bytes(n) { return n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' KB'; }
function time(ms) { var s = Math.round(ms / 1000); var r = s % 60; return Math.floor(s / 60) + ':' + (r < 10 ? '0' : '') + r; }
function format(t) { var d = t.path.lastIndexOf('.'); return d < 0 ? '' : t.path.slice(d + 1).toUpperCase(); }

function showStatus(st) {
  S.status = st;
  var open = st.open !== '';
  $('pod-name').textContent = open ? (st.name || 'iPod') : 'No iPod';
  $('pod-model').textContent = open ? [st.model, st.capacityGb ? st.capacityGb + ' GB' : ''].filter(Boolean).join(' · ') : '';
  $('summary').textContent = open ? 'Serving ' + st.open : (st.error || 'Plug in an iPod: it shows here within a few seconds.');
  var total = st.totalBytes || 0;
  $('storage').hidden = !open || total <= 0;
  if (total > 0) {
    var used = total - st.freeBytes;
    $('storage-used').style.width = Math.round(used * 100 / total) + '%';
    $('storage-text').textContent = bytes(used) + ' used · ' + bytes(st.freeBytes) + ' free';
  }
  var counts = $('counts'); counts.textContent = '';
  if (open) [[st.songs, 'songs'], [st.albums, 'albums'], [st.artists, 'artists'], [st.playlists, 'playlists']].forEach(function (c) {
    var s = el('span'); s.appendChild(el('b', '', String(c[0]))); s.appendChild(document.createTextNode(' ' + c[1])); counts.appendChild(s);
  });
  var b = $('changes');
  b.textContent = st.allowChanges ? (st.readOnly ? 'Changes allowed, iPod read only' : 'Changes allowed') : 'Read only';
  b.className = 'badge' + (st.allowChanges ? ' on' : '');
  setConn(open ? 'ok' : 'warn', open ? 'Connected' : 'No iPod');
  manageState(st);
}

/** Asks the status; reads the library again when the iPod or its song count changed. */
function refresh() {
  return api('/api/status').then(function (st) {
    showStatus(st);
    var key = st.open + '|' + st.songs + '|' + st.playlists;
    if (key === S.libKey) return;
    S.libKey = key;
    if (st.open === '') { setLibrary([], []); return; }
    return Promise.all([api('/api/tracks'), api('/api/playlists')]).then(function (r) { setLibrary(r[0].tracks, r[1].playlists); });
  }).catch(function (e) { if (!(e instanceof NeedToken)) setConn('bad', 'Daemon unreachable'); });
}

function setLibrary(tracks, playlists) {
  S.tracks = tracks; S.playlists = playlists; S.byId = {};
  tracks.forEach(function (t) { S.byId[t.id] = t; t.format = format(t); t.hay = (t.title + ' ' + t.artist + ' ' + t.album + ' ' + t.genre).toLowerCase(); });
  Object.keys(S.selected).forEach(function (id) { if (!S.byId[id]) delete S.selected[id]; });
  if (S.filter && S.filter.kind === 'playlist' && !playlists.some(function (p) { return p.id === S.filter.id; })) S.filter = null;
  render();
}

// The songs: the filter (album or playlist), the search, the sort, then one page of rows.
function visible() {
  var list = S.tracks;
  var f = S.filter;
  if (f && f.kind === 'album') list = list.filter(function (t) { return (t.album || 'Unknown Album') === f.album && (t.albumArtist || t.artist) === f.artist; });
  if (f && f.kind === 'playlist') {
    var p = S.playlists.filter(function (x) { return x.id === f.id; })[0];
    list = p ? p.trackIds.map(function (id) { return S.byId[id]; }).filter(Boolean) : [];
  }
  var q = S.query.trim().toLowerCase();
  if (q) list = list.filter(function (t) { return t.hay.indexOf(q) >= 0; });
  if (S.sortKey) {
    var k = S.sortKey, d = S.sortDir;
    list = list.slice().sort(function (a, b) {
      var x = a[k], y = b[k];
      return d * (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { sensitivity: 'base' }));
    });
  }
  return list;
}

function render() {
  ['songs', 'albums', 'playlists'].forEach(function (v) { $('view-' + v).hidden = v !== S.view; $('tab-' + v).classList.toggle('on', v === S.view); });
  $('filter').hidden = !S.filter;
  if (S.filter) $('filter-text').textContent = S.filter.label;
  if (S.view === 'songs') renderSongs(); else if (S.view === 'albums') renderAlbums(); else renderPlaylists();
}

function renderSongs() {
  S.list = visible();
  var pages = Math.max(1, Math.ceil(S.list.length / PAGE_ROWS));
  if (S.page >= pages) S.page = pages - 1;
  var from = S.page * PAGE_ROWS, rows = S.list.slice(from, from + PAGE_ROWS);
  var body = $('song-rows'); body.textContent = '';
  var manage = S.status && S.status.allowChanges;
  rows.forEach(function (t) {
    var tr = el('tr'); tr.dataset.id = t.id;
    if (t.id === S.current) tr.className = 'playing';
    var sel = el('td', 'sel'), box = el('input'); box.type = 'checkbox'; box.checked = !!S.selected[t.id]; box.hidden = !manage;
    box.setAttribute('aria-label', 'Select ' + t.title); sel.appendChild(box); tr.appendChild(sel);
    [[t.title, ''], [t.artist, ''], [t.album, 'wide'], [time(t.durationMs), 'num'], [t.format, 'wide'], [bytes(t.size), 'wide num'],
      [String(t.playCount), 'wide num']].forEach(function (c) { var td = el('td', c[1], c[0]); td.title = c[0]; tr.appendChild(td); });
    var act = el('td', 'act'), a = el('a', '', '⤓'); a.href = withToken('/api/file/' + encodeURIComponent(t.id));
    a.setAttribute('download', (t.artist ? t.artist + ' - ' : '') + t.title + '.' + t.format.toLowerCase());
    a.title = 'Download'; act.appendChild(a); tr.appendChild(act);
    body.appendChild(tr);
  });
  if (rows.length === 0) { var tr = el('tr'), td = el('td', 'empty', S.tracks.length ? 'No song matches.' : 'No songs.'); td.colSpan = 9; tr.appendChild(td); body.appendChild(tr); }
  $('song-count').textContent = S.list.length + (S.list.length === 1 ? ' song' : ' songs');
  $('pager').hidden = pages <= 1;
  $('page-text').textContent = (from + 1) + '–' + (from + rows.length) + ' of ' + S.list.length;
  $('page-prev').disabled = S.page === 0; $('page-next').disabled = S.page >= pages - 1;
  $('select-all').hidden = !manage;
  $('select-all').checked = rows.length > 0 && rows.every(function (t) { return S.selected[t.id]; });
  document.querySelectorAll('#songs th[data-key]').forEach(function (th) {
    if (th.dataset.key === S.sortKey) th.setAttribute('aria-sort', S.sortDir > 0 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
  });
  selectionChanged();
}

function albums() {
  var map = {}, out = [];
  S.tracks.forEach(function (t) {
    var name = t.album || 'Unknown Album', artist = t.albumArtist || t.artist || 'Unknown Artist', key = artist + '|' + name;
    var a = map[key];
    if (!a) { a = map[key] = { album: name, artist: artist, songs: 0, cover: '' }; out.push(a); }
    a.songs++;
    if (t.artwork && !a.cover) a.cover = t.id;
  });
  return out.sort(function (a, b) { return a.album.localeCompare(b.album, undefined, { sensitivity: 'base' }); });
}

function renderAlbums() {
  var box = $('albums'); box.textContent = '';
  var q = S.query.trim().toLowerCase();
  albums().forEach(function (a) {
    if (q && (a.album + ' ' + a.artist).toLowerCase().indexOf(q) < 0) return;
    var b = el('button', 'album'); b.type = 'button';
    if (a.cover) { var img = el('img'); img.loading = 'lazy'; img.alt = ''; img.width = 150; img.height = 150; img.src = withToken('/api/cover/' + encodeURIComponent(a.cover)); b.appendChild(img); }
    else b.appendChild(el('div', 'art', '♪'));
    b.appendChild(el('b', '', a.album)); b.appendChild(el('span', '', a.artist + ' · ' + a.songs + (a.songs === 1 ? ' song' : ' songs')));
    b.addEventListener('click', function () {
      // the album's own artist field: filter by album artist when the tracks have one, else by artist
      S.filter = { kind: 'album', album: a.album, artist: a.artist === 'Unknown Artist' ? '' : a.artist, label: a.album + ' · ' + a.artist };
      S.view = 'songs'; S.page = 0; S.sortKey = ''; render();
    });
    box.appendChild(b);
  });
  if (!box.firstChild) box.appendChild(el('p', 'empty', 'No albums.'));
}

function renderPlaylists() {
  var ul = $('playlists'); ul.textContent = '';
  S.playlists.forEach(function (p) {
    var li = el('li'); li.appendChild(el('span', '', p.master ? p.name + ' (all songs)' : p.name));
    li.appendChild(el('span', 'muted', p.trackIds.length + (p.trackIds.length === 1 ? ' song' : ' songs')));
    li.addEventListener('click', function () { S.filter = { kind: 'playlist', id: p.id, label: 'Playlist: ' + p.name }; S.view = 'songs'; S.page = 0; S.sortKey = ''; render(); });
    ul.appendChild(li);
  });
  if (!ul.firstChild) ul.appendChild(el('li', 'empty', 'No playlists.'));
}

document.querySelectorAll('.tab').forEach(function (b) { b.addEventListener('click', function () { S.view = b.dataset.view; render(); }); });
$('filter-clear').addEventListener('click', function () { S.filter = null; S.page = 0; render(); });
var typing = 0;
$('search').addEventListener('input', function () {
  clearTimeout(typing);
  typing = setTimeout(function () { S.query = $('search').value; S.page = 0; render(); }, 120);
});
document.querySelectorAll('#songs th[data-key]').forEach(function (th) {
  th.addEventListener('click', function () {
    var k = th.dataset.key;
    S.sortDir = S.sortKey === k ? -S.sortDir : 1; S.sortKey = k; S.page = 0; renderSongs();
  });
});
$('page-prev').addEventListener('click', function () { S.page--; renderSongs(); window.scrollTo(0, 0); });
$('page-next').addEventListener('click', function () { S.page++; renderSongs(); window.scrollTo(0, 0); });
$('song-rows').addEventListener('click', function (ev) {
  var tr = ev.target.closest('tr'); if (!tr || !tr.dataset.id) return;
  if (ev.target.tagName === 'A') return;
  if (ev.target.type === 'checkbox') { if (ev.target.checked) S.selected[tr.dataset.id] = true; else delete S.selected[tr.dataset.id]; selectionChanged(); return; }
  S.queue = S.list.map(function (t) { return t.id; });
  play(tr.dataset.id);
});
$('select-all').addEventListener('change', function () {
  var on = $('select-all').checked;
  document.querySelectorAll('#song-rows tr[data-id]').forEach(function (tr) { if (on) S.selected[tr.dataset.id] = true; else delete S.selected[tr.dataset.id]; });
  renderSongs();
});

// The player: the iPod's file as it is (the daemon answers byte ranges, so seeking works).
var audio = $('audio');
function play(id) {
  var t = S.byId[id]; if (!t) return;
  S.current = id;
  audio.src = withToken('/api/file/' + encodeURIComponent(id));
  audio.play().catch(function () {});
  $('now-title').textContent = t.title; $('now-artist').textContent = [t.artist, t.album].filter(Boolean).join(' · ');
  document.title = t.title + ' · iPod';
  document.querySelectorAll('#song-rows tr').forEach(function (tr) { tr.classList.toggle('playing', tr.dataset.id === id); });
}
function step(d) {
  if (!S.queue.length) S.queue = S.list.map(function (t) { return t.id; });
  var i = S.queue.indexOf(S.current) + d;
  if (i >= 0 && i < S.queue.length) play(S.queue[i]);
}
$('prev').addEventListener('click', function () { if (audio.currentTime > 3) audio.currentTime = 0; else step(-1); });
$('next').addEventListener('click', function () { step(1); });
$('play').addEventListener('click', function () { if (!audio.src) step(1); else if (audio.paused) audio.play(); else audio.pause(); });
audio.addEventListener('play', function () { $('play').textContent = '⏸'; });
audio.addEventListener('pause', function () { $('play').textContent = '▶'; });
audio.addEventListener('ended', function () { step(1); });
`;

/** The whole script; `pollS`: how often the page asks /api/status. */
export function script(pollS: i32): string {
  return CORE + MANAGE + `
refresh();
setInterval(refresh, ${pollS * 1000});
`;
}

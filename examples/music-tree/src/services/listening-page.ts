// ============================================================================
// services/listening-page.ts — What is listened to, as charts for a browser
// ============================================================================
// Served from the tablet on demand, for an hour at most, on the local network, behind a one-time code: a listening history is private.
// The page is made here, without scripts or anything fetched elsewhere: it works without internet.

import { Reply, Request, Headers, serveAsync, stop } from 'zinc:net';
import { Database, Row } from 'zinc:sqlite';
import { randomBytes } from 'zinc:sys';
import { URLSearchParams, toHex } from 'zinc:web';
import { isWebOS, openPort } from 'zinc:webos';
import { ListeningLog } from './listening-log';

export const LISTENING_PORT: i32 = 8767;
const VALID_SECONDS = 60 * 60;
const WRONG_CODES_ALLOWED = 5;
const MODES: Map<string, string> = new Map<string, string>([
  ['spotify-connect', 'Spotify Connect'], ['spotify-sonos', 'Spotify par les Sonos'], ['airplay', 'AirPlay'], ['radio', 'Radio'],
  ['queue', "File d'attente"], ['line-in', 'Entrée ligne'], ['tv', 'Télévision'], ['stream', 'Flux'],
]);
const POWERS: Map<string, string> = new Map<string, string>([
  ['wireless', 'Stationnaire (Touchstone)'], ['ac', 'Stationnaire (secteur)'], ['usb', 'Stationnaire (USB)'], ['none', 'Sur batterie'],
]);
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function esc(text: string): string {
  return text.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;');
}

function hours(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest > 0 ? ' ' + (rest < 10 ? '0' : '') + rest : ''}`;
}

/** Labelled bars, longest first. */
function bars(rows: Row[], label: (row: Row) => string, note: (row: Row) => string = (row: Row): string => hours(row.number('s'))): string {
  if (rows.length === 0) return '<p class="muted">Rien pour cette période.</p>';
  let top = 0;
  for (const row of rows) top = Math.max(top, row.number('s'));
  let html = '<ul class="bars">';
  for (const row of rows) {
    const width = top > 0 ? Math.max(1, Math.round(row.number('s') / top * 100)) : 0;
    html += `<li><div class="line"><span class="name">${esc(label(row))}</span><span class="num">${esc(note(row))}</span></div>` +
      `<div class="track"><div class="fill" style="width:${width}%"></div></div></li>`;
  }
  return html + '</ul>';
}

function card(title: string, body: string, wide: boolean = false): string {
  return `<section class="card${wide ? ' wide' : ''}"><h2>${esc(title)}</h2>${body}</section>`;
}

const EXPORT_TEXTS = ['day', 'artist', 'title', 'album', 'mode', 'bridge_mode', 'rooms', 'power'];
const EXPORT_NUMBERS = ['started_at', 'ended_at', 'hour', 'weekday', 'heard', 'duration', 'volume', 'battery', 'screen_on'];

/** The listens of the last `days` days (0: everything), oldest first, as a JSON document. Dates in seconds since 1970; heard and duration in seconds. */
export function listeningExport(db: Database, days: i32, now: number = Date.now() / 1000): string {
  const from = days > 0 ? Math.floor(now - days * 86400) : 0;
  const plays = db.prepare('SELECT * FROM plays WHERE started_at >= ? ORDER BY started_at').all([from]).map((row: Row): string => {
    const fields: string[] = [];
    for (const name of EXPORT_NUMBERS) fields.push(`"${name}":${Math.round(row.number(name))}`);
    for (const name of EXPORT_TEXTS) fields.push(`"${name}":${JSON.stringify(row.text(name))}`);
    return `{${fields.join(',')}}`;
  });
  return `{"exported_at":${Math.floor(now)},"days":${days},"count":${plays.length},"plays":[${plays.join(',\n')}]}\n`;
}

/** The page for the last `days` days (0: everything). */
export function listeningReport(db: Database, days: i32, code: string, now: number = Date.now() / 1000): string {
  const from = days > 0 ? Math.floor(now - days * 86400) : 0;
  const all = (sql: string): Row[] => db.prepare(sql).all([from]);
  const WHERE = 'WHERE started_at >= ?';

  const total = db.prepare(`SELECT coalesce(sum(heard), 0) AS s, sum(heard >= 30) AS n, sum(heard < 30) AS skipped,
    count(DISTINCT CASE WHEN artist <> '' THEN lower(artist) END) AS artists, count(DISTINCT day) AS days,
    sum(duration > 30 AND heard >= min(duration / 2, 240)) AS counted FROM plays ${WHERE}`).get([from]) as Row;
  const heard = total.number('s');
  const activeDays = total.number('days');

  const link = (value: i32, label: string): string =>
    `<a href="/?code=${esc(code)}&amp;days=${value}"${value === days ? ' aria-current="page"' : ''}>${label}</a>`;
  const links = link(7, '7 jours') + link(30, '30 jours') + link(365, '1 an') + link(0, 'Tout') +
    `<a class="export" href="/ecoutes.json?code=${esc(code)}&amp;days=${days}" download="mes-ecoutes.json">Exporter en JSON</a>`;

  const figure = (value: string, label: string): string => `<div class="figure"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
  const figures = figure(hours(heard), 'écoutés') + figure(`${total.number('n')}`, 'écoutes') +
    figure(`${total.number('artists')}`, 'artistes') + figure(hours(activeDays > 0 ? heard / activeDays : 0), 'par jour actif') +
    figure(`${total.number('skipped')}`, 'passées (< 30 s)') + figure(`${total.number('counted')}`, 'comptent pour Last.fm');

  // the days, oldest first
  const dayRows = db.prepare(`SELECT day, sum(heard) AS s FROM (SELECT day, heard FROM plays ${WHERE} ORDER BY started_at DESC) GROUP BY day ORDER BY day DESC LIMIT 60`).all([from]).reverse();
  let dayTop = 0;
  for (const row of dayRows) dayTop = Math.max(dayTop, row.number('s'));
  let daysHtml = '<p class="muted">Rien pour cette période.</p>';
  if (dayRows.length > 0) {
    daysHtml = '<div class="days">' + dayRows.map((row: Row): string => {
      const text = `${row.text('day')} : ${hours(row.number('s'))}`;
      return `<div class="day" title="${esc(text)}" role="img" aria-label="${esc(text)}"><div style="height:${Math.max(2, Math.round(row.number('s') / dayTop * 100))}%"></div></div>`;
    }).join('') + `</div><div class="line muted"><span>${esc(dayRows[0].text('day'))}</span><span>${esc(dayRows[dayRows.length - 1].text('day'))}</span></div>`;
  }

  // the week by hour, Monday first
  const cells: number[] = [];
  for (let index = 0; index < 7 * 24; index++) cells.push(0);
  let cellTop = 0;
  for (const row of all(`SELECT weekday, hour, sum(heard) AS s FROM plays ${WHERE} GROUP BY weekday, hour`)) {
    const index = ((row.number('weekday') + 6) % 7) * 24 + row.number('hour');
    cells[index] = row.number('s');
    cellTop = Math.max(cellTop, row.number('s'));
  }
  let grid = '<div class="week"><span></span>';
  for (let hour = 0; hour < 24; hour++) grid += `<span class="tick">${hour % 6 === 0 ? hour.toString() : ''}</span>`;
  for (let weekday = 0; weekday < 7; weekday++) {
    grid += `<span class="tick">${WEEKDAYS[weekday]}</span>`;
    for (let hour = 0; hour < 24; hour++) {
      const seconds = cells[weekday * 24 + hour];
      const alpha = seconds > 0 && cellTop > 0 ? (0.15 + 0.85 * seconds / cellTop).toFixed(2) : '0';
      const text = `${WEEKDAYS[weekday]} ${hour} h : ${hours(seconds)}`;
      grid += `<i title="${esc(text)}" aria-label="${esc(text)}" style="--a:${alpha}"></i>`;
    }
  }
  grid += '</div>';

  const top = (column: string): Row[] => all(`SELECT ${column} AS label, sum(heard) AS s, count(*) AS n FROM plays ${WHERE} AND ${column} <> '' GROUP BY lower(${column}) ORDER BY s DESC LIMIT 10`);
  const listens = (row: Row): string => `${hours(row.number('s'))} · ${row.number('n')}×`;
  const songs = all(`SELECT title, artist, sum(heard) AS s, count(*) AS n FROM plays ${WHERE} AND title <> '' GROUP BY lower(title), lower(artist) ORDER BY s DESC LIMIT 10`);
  const modes = all(`SELECT mode, bridge_mode, sum(heard) AS s FROM plays ${WHERE} GROUP BY mode, bridge_mode ORDER BY s DESC`);
  const modeName = (row: Row): string => {
    const name = MODES.get(row.text('mode')) ?? row.text('mode');
    return row.text('bridge_mode') !== '' ? `${name} (${row.text('bridge_mode')})` : name;
  };
  const powers = all(`SELECT power, sum(heard) AS s FROM plays ${WHERE} GROUP BY power ORDER BY s DESC`);
  const screens = all(`SELECT screen_on, sum(heard) AS s FROM plays ${WHERE} GROUP BY screen_on ORDER BY s DESC`);
  const rooms = all(`SELECT rooms, sum(heard) AS s FROM plays ${WHERE} GROUP BY rooms ORDER BY s DESC LIMIT 8`);

  let log = '';
  for (const row of db.prepare(`SELECT * FROM plays ${WHERE} ORDER BY started_at DESC LIMIT 100`).all([from])) {
    const hourText = `${row.number('hour')} h`;
    const song = row.text('title') !== '' ? row.text('title') : '(sans titre)';
    const length = row.number('duration') > 0 ? ` / ${hours(row.number('duration'))}` : '';
    log += `<tr><td class="nowrap">${esc(row.text('day').slice(5))} · ${hourText}</td><td><b>${esc(song)}</b><br><span class="muted">${esc(row.text('artist'))}</span></td>` +
      `<td>${esc(MODES.get(row.text('mode')) ?? row.text('mode'))}</td><td>${esc(row.text('rooms'))}</td>` +
      `<td class="nowrap">${esc(hours(row.number('heard')))}${esc(length)}</td><td>${esc(POWERS.get(row.text('power')) ?? '—')}</td></tr>`;
  }

  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mes écoutes</title><style>
:root{--bg:#f6f5f2;--card:#fff;--text:#1c1b19;--muted:#6f6c66;--line:#e5e2db;--accent:#c2274e}
@media (prefers-color-scheme:dark){:root{--bg:#121212;--card:#1d1d1d;--text:#f2f0ec;--muted:#a09c95;--line:#303030;--accent:#ff5c7f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.45 system-ui,-apple-system,sans-serif}
main{max-width:1080px;margin:auto;padding:24px 16px 48px}h1{font-size:30px;margin:0 0 12px;letter-spacing:-.01em}
h2{font-size:15px;margin:0 0 14px}nav{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px}
nav a{padding:8px 14px;border-radius:99px;color:var(--text);text-decoration:none;background:var(--card);border:1px solid var(--line);font-size:14px}
.export{margin-left:auto}nav a[aria-current]{background:var(--text);color:var(--bg);border-color:var(--text)}
.figures{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(145px,100%),1fr));gap:12px;margin-bottom:12px}
.figure,.card{background:var(--card);border:1px solid var(--line);border-radius:14px}.figure{padding:14px 16px}
.figure b{display:block;font-size:24px;font-variant-numeric:tabular-nums}.figure span,.muted{color:var(--muted);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:12px}.card{padding:18px;min-width:0}.wide{grid-column:1/-1}
.bars{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.line{display:flex;justify-content:space-between;gap:12px;font-size:14px}
.name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.num{color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.track{height:6px;margin-top:4px;border-radius:3px;background:var(--line)}.fill{height:100%;border-radius:3px;background:var(--accent)}
.days{display:flex;align-items:flex-end;gap:2px;height:140px;margin-bottom:6px}.day{flex:1;height:100%;display:flex;align-items:flex-end;min-width:0}
.day div{width:100%;border-radius:3px 3px 0 0;background:var(--accent)}
.week{display:grid;grid-template-columns:30px repeat(24,minmax(0,1fr));gap:2px}.tick{font-size:11px;color:var(--muted);line-height:1.4}
.week i{aspect-ratio:1;border-radius:3px;background:var(--line);position:relative;overflow:hidden}
.week i::after{content:"";position:absolute;inset:0;background:var(--accent);opacity:var(--a)}
.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:8px 10px 8px 0;text-align:left;vertical-align:top;border-top:1px solid var(--line)}
th{font-size:12px;color:var(--muted);font-weight:500;border-top:0}.nowrap{white-space:nowrap}
</style><main><h1>Mes écoutes</h1><nav aria-label="Période">${links}</nav><div class="figures">${figures}</div><div class="grid">
${card('Chaque jour', daysHtml, true)}
${card('Tes habitudes, par jour et par heure', grid, true)}
${card('Artistes', bars(top('artist'), (row: Row): string => row.text('label'), listens))}
${card('Morceaux', bars(songs, (row: Row): string => `${row.text('title')} · ${row.text('artist')}`, listens))}
${card('Albums', bars(top('album'), (row: Row): string => row.text('label'), listens))}
${card('Mode de lecture', bars(modes, modeName))}
${card('Pièces', bars(rooms, (row: Row): string => row.text('rooms')))}
${card('Alimentation de la tablette', bars(powers, (row: Row): string => POWERS.get(row.text('power')) ?? 'Inconnue'))}
${card('Écran de la tablette', bars(screens, (row: Row): string => row.number('screen_on') === 1 ? 'Allumé' : 'Éteint'))}
${card('Journal des écoutes', log === '' ? '<p class="muted">Rien pour cette période.</p>' : `<div class="scroll"><table><tr><th>Quand</th><th>Quoi</th><th>Mode</th><th>Où</th><th>Écouté</th><th>Tablette</th></tr>${log}</table></div>`, true)}
</div></main></html>`;
}

export class ListeningPage {
  code: string = '';
  url: string = '';
  port: i32 = 0;
  message: string = '';
  private readonly log: ListeningLog;
  private expires: number = 0;
  private wrongCodes: i32 = 0;

  constructor(log: ListeningLog) {
    this.log = log;
  }

  isOpen(): boolean {
    return this.port !== 0;
  }

  /** `host` is this machine's address on the network the phone is on. */
  open(host: string, port: i32 = LISTENING_PORT): void {
    this.close();
    this.message = '';
    if (this.log.db === null) {
      this.message = 'Base des écoutes indisponible';
      return;
    }
    if (isWebOS() && !openPort(port)) {
      this.message = 'Port fermé : zinc-helper absent';
      return;
    }
    this.code = toHex(randomBytes(4));
    this.expires = Date.now() / 1000 + VALID_SECONDS;
    this.wrongCodes = 0;
    try {
      this.port = serveAsync(port, async (request: Request): Promise<Reply> => this.answer(request), { hostname: host, maxBodyBytes: 1024 });
      this.url = `http://${host}:${this.port}/?code=${this.code}`;
    } catch (error) {
      this.message = `Port ${port} indisponible`;
    }
  }

  close(): void {
    if (this.port !== 0) stop(this.port);
    this.port = 0;
    this.code = '';
    this.url = '';
  }

  /** Called every second. */
  closeIfExpired(): void {
    if (this.isOpen() && Date.now() / 1000 >= this.expires) this.close();
  }

  private answer(request: Request): Reply {
    const headers = new Headers();
    headers.set('Cache-Control', 'no-store');
    const reply = (status: i32, body: string): Reply => ({ status, headers, contentType: 'text/html; charset=utf-8', body });
    const mark = request.path.indexOf('?');
    const path = mark < 0 ? request.path : request.path.slice(0, mark);
    if (path !== '/' && path !== '/ecoutes.json') return reply(404, 'Introuvable');   // a browser asks for its favicon
    const query = new URLSearchParams(mark < 0 ? '' : request.path.slice(mark + 1));
    if ((query.get('code') ?? '') !== this.code || this.code === '') {
      this.wrongCodes++;
      if (this.wrongCodes >= WRONG_CODES_ALLOWED) setTimeout(() => { this.close(); this.message = 'Trop de codes faux'; }, 300);
      return reply(403, 'Scannez à nouveau le QR code de la tablette.');
    }
    const days = parseInt(query.get('days') ?? '30');
    const period = (Number.isFinite(days) && days >= 0 ? days : 30) as i32;
    try {
      if (path === '/ecoutes.json') {
        headers.set('Content-Disposition', 'attachment; filename="mes-ecoutes.json"');
        return { status: 200, headers, contentType: 'application/json; charset=utf-8', body: listeningExport(this.log.db as Database, period) };
      }
      return reply(200, listeningReport(this.log.db as Database, period, this.code));
    } catch (error) {
      console.error(`music: listening page: ${error.message}`);
      return reply(500, 'Lecture des écoutes impossible.');
    }
  }
}

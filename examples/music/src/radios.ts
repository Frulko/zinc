// Radios: the owner's list (radios.json beside the program) and the radio-browser.info directory (free, no key), which Sonos plays as
// MP3 or AAC streams over HTTP.
import { exists, readText, writeText } from 'zinc:fs';

export class Station {
  name: string = '';
  url: string = '';
  /** The logo's URL ('' when none). */
  art: string = '';
  /** Genres or a short line ('jazz, soul'). */
  tags: string = '';
}

const FILE = 'radios.json';
const DIRECTORY = 'https://de1.api.radio-browser.info/json/stations/search';

function station(name: string, url: string, tags: string, art: string = ''): Station {
  const s = new Station(); s.name = name; s.url = url; s.tags = tags; s.art = art; return s;
}
/** The first list, before the owner changes it: French radios, streams and logos checked on 2026-10-15. */
function defaults(): Station[] {
  return [
    station('FIP', 'http://icecast.radiofrance.fr/fip-midfi.mp3', 'éclectique', 'https://upload.wikimedia.org/wikipedia/fr/thumb/d/d5/FIP_logo_2005.svg/330px-FIP_logo_2005.svg.png'),
    station('France Inter', 'http://icecast.radiofrance.fr/franceinter-midfi.mp3', 'généraliste', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/France_Inter_logo_2021.svg/330px-France_Inter_logo_2021.svg.png'),
    station('franceinfo', 'http://icecast.radiofrance.fr/franceinfo-midfi.mp3', 'info', 'https://charte.radiofrance.fr/images/franceinfo/franceinfo2.png'),
    station('France Culture', 'http://icecast.radiofrance.fr/franceculture-midfi.mp3', 'culture', 'https://upload.wikimedia.org/wikipedia/fr/thumb/c/c9/France_Culture_-_2008.svg/330px-France_Culture_-_2008.svg.png'),
    station('France Musique', 'http://icecast.radiofrance.fr/francemusique-midfi.mp3', 'classique, jazz', 'https://upload.wikimedia.org/wikipedia/fr/thumb/2/22/France_Musique_-_2008.svg/330px-France_Musique_-_2008.svg.png'),
    station('TSF Jazz', 'http://tsfjazz.ice.infomaniak.ch/tsfjazz-high.mp3', 'jazz', 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/TSFJazz-2017.jpg/330px-TSFJazz-2017.jpg'),
    station('Radio Nova', 'http://novazz.ice.infomaniak.ch/novazz-128.mp3', 'groove, hip-hop', 'https://www.nova.fr/wp-content/uploads/sites/2/2021/02/cropped-favicon.png?fit=180%2c180&quality=75'),
    station('Radio Meuh', 'http://radiomeuh.ice.infomaniak.ch/radiomeuh-128.mp3', 'électro, funk', 'https://www.radiomeuh.com/android-icon-192x192.png'),
    station('Mouv\'', 'http://icecast.radiofrance.fr/mouv-midfi.mp3', 'hip-hop', 'https://upload.wikimedia.org/wikipedia/fr/thumb/d/d3/Le_Mouv%27_logo_2008.svg/330px-Le_Mouv%27_logo_2008.svg.png'),
  ];
}

export function loadMine(): Station[] {
  if (!exists(FILE)) return defaults();
  try {
    const j = JSON.parse(readText(FILE));
    const out: Station[] = [];
    for (let i = 0; i < j.length; i++) out.push(station('' + j[i].name, '' + j[i].url, '' + j[i].tags, '' + j[i].art));
    return out;
  } catch (e) { return defaults(); }
}
export function saveMine(list: Station[]): void {
  const rows: string[] = [];
  for (const s of list) rows.push(JSON.stringify({ name: s.name, url: s.url, tags: s.tags, art: s.art }));
  try { writeText(FILE, '[\n' + rows.join(',\n') + '\n]\n'); } catch (e) { console.error(`music: cannot write ${FILE}: ${e.message}`); }
}
export function indexOf(list: Station[], url: string): i32 {
  for (let i = 0; i < list.length; i++) if (list[i].url === url) return i;
  return -1;
}

/** Stations of the directory: the most voted of a country, or the ones whose name matches. Streams Sonos cannot play are left out. */
export async function directory(query: string, country: string = 'FR'): Promise<Station[]> {
  const q = query !== '' ? `name=${encodeURIComponent(query)}` : `countrycode=${country}`;
  const r = await fetch(`${DIRECTORY}?${q}&order=votes&reverse=true&limit=60&hidebroken=true`, { timeoutMs: 12000, headers: [['User-Agent', 'ZincMusic/1.0']] });
  if (r.status !== 200) throw new Error(`radio-browser: ${r.status}`);
  const j = JSON.parse(await r.text());
  const out: Station[] = [];
  for (let i = 0; i < j.length; i++) {
    const codecRaw: string = '' + j[i].codec, resolved: string = '' + j[i].url_resolved, plain: string = '' + j[i].url;
    const codec = codecRaw.toUpperCase(), url = resolved !== '' ? resolved : plain;
    if ((codec !== 'MP3' && codec !== 'AAC' && codec !== 'AAC+') || url.endsWith('.m3u8') || indexOf(out, url) >= 0) continue;
    const tagsRaw: string = '' + j[i].tags, name: string = '' + j[i].name;
    out.push(station(name.trim(), url, tagsRaw.split(',').slice(0, 3).join(', '), '' + j[i].favicon));
  }
  return out;
}

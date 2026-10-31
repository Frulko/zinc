// The GIF picker's search: Discord's own routes, as the web client asks them (Tenor behind them): the trending GIFs when the picker opens,
// then a search when the typing pauses. One request a query: the answers are kept for the session.
import * as guard from '../safety/index';
import { LOCALE } from '../constants';

export class Gif { id = ''; title = ''; url = ''; gif = ''; preview = ''; width: i32 = 0; height: i32 = 0; }

const found: Map<string, Promise<Gif[]>> = new Map<string, Promise<Gif[]>>();
const str = (v: any): string => typeof v === 'string' ? v : '';

/** The GIFs of a query ('' the trending ones): asked once, the answer (or the request in flight) kept for the session; a failure is asked again. */
export function gifs(query: string): Promise<Gif[]> {
  const q = query.trim().toLowerCase();
  const known = found.get(q);
  if (known !== undefined) return known;
  const p = ask(q);
  found.set(q, p);
  p.catch((e: Error): Gif[] => { found.delete(q); return []; });
  return p;
}

async function ask(q: string): Promise<Gif[]> {
  const r: any = q === ''
    ? await guard.api('gifs', 'GET', `/gifs/trending-gifs?media_format=mp4&provider=tenor&locale=${LOCALE}`, undefined)
    : await guard.api('gifs', 'GET', `/gifs/search?q=${encodeURIComponent(q)}&media_format=mp4&provider=tenor&locale=${LOCALE}`, undefined);
  const out: Gif[] = [];
  if (Array.isArray(r)) for (const v of r) {
    const g = new Gif();
    g.id = str(v.id); g.title = str(v.title); g.url = str(v.url); g.gif = str(v.gif_src); g.preview = str(v.preview);
    g.width = typeof v.width === 'number' ? v.width : 0; g.height = typeof v.height === 'number' ? v.height : 0;
    if (g.url !== '' && g.preview !== '') out.push(g);
  }
  return out;
}

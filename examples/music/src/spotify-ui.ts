// The Spotify page (owner 2026-10-19: "a fast and good one, like the official app, that old devices can use"): the library (playlists,
// albums, liked songs, recent plays), a search while one types (a best result, songs, then artists, albums and playlists, or one kind at
// a time), and a page for an artist, an album and a playlist, with a back button. A song plays inside its album or playlist; its menu
// plays it next, adds it to the queue, plays its radio or opens its artist or album. Fast on a slow tablet: every answer is kept (going
// back costs nothing), a search waits for the typing to pause, lists draw only the rows they show, small covers are the 64 px ones.
import { rrect, drawText, fontAscent, textWidth } from 'zinc:gfx';
import { Spotify, Item, Found } from 'zinc:spotify';
import { ui, F, TEXT, TEXT2, TEXT3, GREEN, CARD, CARD2, FILL, Scroll, onTap, beginScroll, endScroll, label, centered, wrap, glyph, cover,
  iconButton, pill, segmented, spinner, separator, clock, isPressed, transport } from './ui';

/** What main.ts does for the page: play on the chosen speakers, queue, start a radio, say something. */
export class SpotifyHost {
  play: (it: Item) => void = (it: Item) => {};
  queue: (it: Item, next: boolean) => void = (it: Item, next: boolean) => {};
  radio: (it: Item) => void = (it: Item) => {};
  toast: (s: string) => void = (s: string) => {};
}

class View {
  kind: string = 'library';   // library, search, artist, album, playlist
  item: Item = new Item();    // the artist, album or playlist shown
  scroll: Scroll = new Scroll();
}

const LIB = ['Playlists', 'Albums', 'Titres likés', 'Récents'];
const KINDS = ['Tout', 'Titres', 'Artistes', 'Albums', 'Playlists'], KIND_OF = ['', 'track', 'artist', 'album', 'playlist'];
// pages of 20 (owner, 2026-10-15: 50 at once made the tablet lag and ran it out of memory)
const PAGE: i32 = 20, ROW = 64, SEARCH_WAIT_MS = 350;

export class SpotifyPage {
  sp: Spotify;
  host: SpotifyHost;
  stack: View[] = [new View()];
  libTab: i32 = 0;
  kindTab: i32 = 0;
  // every answer, by what was asked: an Item[] list, a Found, or an error; 'loading' while it comes
  private lists = new Map<string, Item[]>();
  private founds = new Map<string, Found>();
  private state = new Map<string, string>();   // key -> 'loading', 'ok', 'more' (a next page exists) or an error
  private q = '';
  private asked = '';
  private typedAt = 0;
  private menuFor: Item | null = null;
  private menuY = 0;

  constructor(sp: Spotify, host: SpotifyHost) { this.sp = sp; this.host = host; }

  // ---------------------------------------------------------------- data
  /** The list behind a key, loaded once (the first page): lib/<tab>, find/<kind>/<q>, artist/<id>, albums/<id>, songs/<name>, album/<id>,
   *  playlist/<id>. */
  private list(key: string): Item[] {
    const l = this.lists.get(key);
    if (l !== undefined) return l as Item[];
    if (this.state.get(key) === undefined) this.load(key, 0);
    return [];
  }
  private async load(key: string, offset: i32): Promise<void> {
    this.state.set(key, 'loading');
    try {
      const page = await this.fetch(key, offset);
      let all: Item[] = [];
      const had = this.lists.get(key);
      if (offset > 0 && had !== undefined) all = had as Item[];
      for (const it of page) all.push(it);
      this.lists.set(key, all);
      const step: i32 = key.startsWith('find/') || key.startsWith('albums/') || key.startsWith('songs/') ? 10 : PAGE;
      this.state.set(key, page.length >= step && !key.startsWith('lib/3') && !key.startsWith('album/') ? 'more' : 'ok');
    } catch (e) { this.state.set(key, '' + e.message); }
    ui.dirty = true;
  }
  private async fetch(key: string, offset: i32): Promise<Item[]> {
    const p = key.split('/'), rest = key.slice(p[0].length + 1);
    if (p[0] === 'lib') {
      if (p[1] === '0') return await this.sp.playlists(offset, PAGE);
      if (p[1] === '1') return await this.sp.albums(offset, PAGE);
      if (p[1] === '2') return await this.sp.likedTracks(offset, PAGE);
      return await this.sp.recent();
    }
    if (p[0] === 'find') return await this.sp.findMore(key.slice(p[0].length + p[1].length + 2), p[1], offset);
    if (p[0] === 'artist') return [await this.sp.artist(rest)];
    if (p[0] === 'albums') return await this.sp.artistAlbums(rest, offset);
    if (p[0] === 'songs') return await this.sp.artistTracks(rest, offset);
    if (p[0] === 'album') return await this.sp.album(rest);
    return await this.sp.playlist(rest, offset);
  }
  /** The next page of a list, when its end comes into view. */
  private more(key: string): void { if (this.state.get(key) === 'more') this.load(key, this.lists.get(key) !== undefined ? (this.lists.get(key) as Item[]).length as i32 : 0); }
  private found(q: string): Found | null {
    const f = this.founds.get(q);
    if (f !== undefined) return f as Found;
    const key = 'all/' + q;
    if (this.state.get(key) === undefined) this.search1(q, key);
    return null;
  }
  private async search1(q: string, key: string): Promise<void> {
    this.state.set(key, 'loading');
    try { this.founds.set(q, await this.sp.find(q)); this.state.set(key, 'ok'); } catch (e) { this.state.set(key, '' + e.message); }
    ui.dirty = true;
  }
  /** The library's first pages, one after the other, ahead of the first visit (main.ts calls it once the first frames are drawn). */
  async preload(): Promise<void> {
    for (let t = 0; t < 4; t++) if (this.state.get('lib/' + t) === undefined) await this.load('lib/' + t, 0);
  }
  /** Everything forgotten: another account, or the same one logged in again. */
  reset(): void { this.lists.clear(); this.founds.clear(); this.state.clear(); this.asked = ''; this.home(); }
  /** The covers of the library, for the idle prefetch of main.ts. */
  covers(): string[] {
    const out: string[] = [];
    for (let t = 0; t < 4; t++) { const l = this.lists.get('lib/' + t); if (l !== undefined) for (const it of l as Item[]) out.push(t < 2 ? it.art : it.thumb); }
    return out;
  }
  /** The words of the search field: the search starts once the typing pauses. */
  setQuery(q: string): void { if (q !== this.q) { this.q = q; this.typedAt = performance.now(); } }
  /** Each frame: a paused typing starts its search. */
  tick(): void {
    const q = this.q.trim();
    if (q !== '' && q !== this.asked && performance.now() - this.typedAt >= SEARCH_WAIT_MS) { this.asked = q; this.found(q); ui.dirty = true; }
    if (q !== this.asked && q !== '') ui.animating = true;   // a frame comes when the wait is over
  }
  searching(): boolean { return this.top().kind === 'search'; }

  // ---------------------------------------------------------------- navigation
  private top(): View { return this.stack[this.stack.length - 1]; }
  open(kind: string, it: Item): void {
    const v = new View(); v.kind = kind; v.item = it;
    this.stack.push(v); this.menuFor = null; ui.dirty = true;
  }
  back(): void { if (this.stack.length > 1) { this.stack.pop(); this.menuFor = null; ui.dirty = true; } }
  home(): void { this.stack = [this.stack[0]]; this.menuFor = null; }
  /** An item touched: a song plays, the others open. */
  private touch(it: Item): void {
    if (it.kind === 'track' || it.kind === 'episode') this.host.play(it);
    else if (it.kind === 'artist' || it.kind === 'album' || it.kind === 'playlist') this.open(it.kind, it);
    else this.host.play(it);
  }
  private idOf(it: Item): string { return it.uri.split(':').pop() as string; }

  // ---------------------------------------------------------------- drawing
  /** The page in x..x+w, top..bottom; `typing`: the keyboard is up (main.ts draws it). The search field is main.ts's (query). */
  draw(x: number, top: number, w: number, bottom: number, startSearch: () => void): void {
    const v = this.top();
    if (v.kind === 'library') this.library(x, top, w, bottom, v, startSearch);
    else if (v.kind === 'search') this.search(x, top, w, bottom, v);
    else if (v.kind === 'artist') this.artist(x, top, w, bottom, v);
    else this.collection(x, top, w, bottom, v);
    if (this.menuFor !== null) this.menu(x, top, w, bottom);
  }
  /** The title of the page and its back button, in the header (main.ts draws them at the top). */
  title(): string {
    const v = this.top();
    if (v.kind === 'library') return 'Spotify';
    if (v.kind === 'search') return 'Rechercher';
    if (v.item.name !== '') return v.item.name;
    const l = this.lists.get(`${v.kind}/${this.idOf(v.item)}`);   // opened from a song's menu: the name comes with the page
    return l !== undefined && (l as Item[]).length > 0 ? (l as Item[])[0].name : '';
  }
  canGoBack(): boolean { return this.stack.length > 1; }

  private status(key: string, x: number, y: number, w: number): boolean {   // true when the list may be drawn
    const st = this.state.get(key);
    if (st === undefined || st === 'loading') { spinner(x + w / 2, y + 60, 16); return false; }
    if (st !== 'ok' && st !== 'more') { wrap(F.label, x, y + 40, st, TEXT2, w, 3, 28); return false; }
    return true;
  }
  private library(x: number, top: number, w: number, bottom: number, v: View, startSearch: () => void): void {
    segmented('sp/lib', x, top, LIB, this.libTab, (i: i32) => { this.libTab = i; v.scroll.y = 0; }, 120);
    pill('sp/search', x + w - 150, top, 'Rechercher', TEXT, FILL, startSearch, 'search');
    const key = 'lib/' + this.libTab, items = this.list(key), y0 = top + 60;
    if (!this.status(key, x, y0, w)) return;
    if (this.libTab <= 1) this.grid(items, 'sp/lib' + this.libTab, x, y0, w, bottom, v.scroll, key);
    else {
      const head = this.libTab === 2 ? 'Lire tous les titres likés' : '';
      this.rows(items, 'sp/rows', x, y0, w, bottom, v.scroll, key, head, false);
    }
  }
  private search(x: number, top: number, w: number, bottom: number, v: View): void {
    const q = this.q.trim();
    segmented('sp/kind', x, top, KINDS, this.kindTab, (i: i32) => { this.kindTab = i; v.scroll.y = 0; }, 110);
    const y0 = top + 60;
    if (q === '') { centered(F.label, x + w / 2, y0 + 60, 'Titres, artistes, albums, playlists', TEXT3); return; }
    if (this.asked !== q) { spinner(x + w / 2, y0 + 60, 16); return; }
    if (this.kindTab > 0) {
      const key = `find/${KIND_OF[this.kindTab]}/${q}`, items = this.list(key);
      if (!this.status(key, x, y0, w)) return;
      if (this.kindTab === 1) this.rows(items, 'sp/f', x, y0, w, bottom, v.scroll, key, '', true);
      else this.grid(items, 'sp/f', x, y0, w, bottom, v.scroll, key);
      return;
    }
    const f = this.found(q);
    if (!this.status('all/' + q, x, y0, w) || f === null) return;
    const r = f as Found;
    beginScroll(v.scroll, x - 36, y0, w + 72, bottom - y0);
    let y = y0 + 4 - v.scroll.y;
    // the best result (an artist named like the words, else the first song) beside the first songs
    const want = q.toLowerCase();
    let best: Item | null = null;
    for (const a of r.artists) if (a.name.toLowerCase() === want || (best === null && a.name.toLowerCase().startsWith(want))) best = a;
    if (best === null && r.tracks.length > 0) best = r.tracks[0];
    if (best === null && r.albums.length > 0) best = r.albums[0];
    const bw = 290, bh = 4 * ROW;
    if (best !== null) {
      const b = best as Item, id = 'sp/best';
      drawText(F.head, x, y, 'Meilleur résultat', TEXT, 255, 0);
      rrect(x, y + 36, bw, bh - 36, 14, isPressed(id) ? CARD2 : CARD, 255);
      cover(b.art, b.name, x + 20, y + 56, 104, b.kind === 'artist' ? 52 : 8);
      label(F.title, x + 20, y + 176, b.name, TEXT, bw - 40);
      label(F.small, x + 20, y + 212, (b.kind === 'artist' ? 'Artiste' : b.kind === 'track' ? 'Titre' : 'Album') + (b.kind !== 'artist' && b.subtitle !== '' ? ' · ' + b.subtitle : ''), TEXT2, bw - 40);
      onTap(id, x, y + 36, bw, bh - 36, () => this.touch(b));
      this.playButton('sp/best/play', x + bw - 64, y + 56, b);
    }
    const tx = best !== null ? x + bw + 24 : x, tw = x + w - tx;
    drawText(F.head, tx, y, 'Titres', TEXT, 255, 0);
    for (let i = 0; i < Math.min(4, r.tracks.length); i++) this.row(r.tracks[i], 'sp/ft/' + i, tx, y + 36 + i * (ROW - 6), tw, false, i, ROW - 6);
    y += bh + 28;
    y = this.shelf('Artistes', r.artists, 'sp/fa', x, y, w, 2, bottom);
    y = this.shelf('Albums', r.albums, 'sp/fal', x, y, w, 3, bottom);
    y = this.shelf('Playlists', r.playlists, 'sp/fp', x, y, w, 4, bottom);
    v.scroll.content = y + v.scroll.y - y0 + 24;
    endScroll();
  }
  /** A row of up to five covers with a title; "Tout afficher" picks that kind. */
  private shelf(title: string, items: Item[], id: string, x: number, y: number, w: number, kindTab: i32, bottom: number): number {
    if (items.length === 0) return y;
    const n: i32 = 5, gap = 18, s = (w - gap * (n - 1)) / n, h = s + 58;
    if (y > bottom || y + h + 40 < 0) return y + 40 + h;
    drawText(F.head, x, y, title, TEXT, 255, 0);
    const more = 'Tout afficher', mw = textWidth(F.smallB, more, 0);
    drawText(F.smallB, x + w - mw, y + 6, more, TEXT2, 255, 0);
    onTap(id + '/all', x + w - mw - 10, y - 4, mw + 20, 36, () => { this.kindTab = kindTab; this.top().scroll.y = 0; ui.dirty = true; });
    for (let i = 0; i < Math.min(n, items.length); i++) this.tile(items[i], `${id}/${i}`, x + i * (s + gap), y + 40, s);
    return y + 40 + h;
  }
  private artist(x: number, top: number, w: number, bottom: number, v: View): void {
    const id = this.idOf(v.item), heads = this.list('artist/' + id);
    const a = heads.length > 0 ? heads[0] : v.item;
    beginScroll(v.scroll, x - 36, top, w + 72, bottom - top);
    let y = top + 4 - v.scroll.y;
    cover(a.art, a.name, x, y, 150, 75);
    label(F.hero, x + 176, y + 34, a.name, TEXT, w - 176);
    drawText(F.small, x + 176, y + 78, 'Artiste', TEXT2, 255, 0);
    const pw = pill('sp/a/play', x + 176, y + 106, 'Lire', 0x000000, GREEN, () => this.host.play(a), 'audio-lines');
    pill('sp/a/radio', x + 176 + pw + 12, y + 106, 'Radio de l\'artiste', TEXT, FILL, () => this.host.radio(a), 'radio');
    y += 180;
    const songs = this.list('songs/' + a.name);
    drawText(F.head, x, y, 'Titres', TEXT, 255, 0);
    y += 36;
    if (this.status('songs/' + a.name, x, y - 30, w)) for (let i = 0; i < Math.min(5, songs.length); i++) { this.row(songs[i], 'sp/as/' + i, x, y, w, false, i, ROW); y += ROW; }
    else y += 120;
    y += 24;
    const key = 'albums/' + id, albums = this.list(key);
    drawText(F.head, x, y, 'Albums et singles', TEXT, 255, 0);
    y += 40;
    if (this.status(key, x, y - 30, w)) {
      const n: i32 = 4, gap = 24, s = (w - gap * (n - 1)) / n;
      for (let i = 0; i < albums.length; i++) {
        const ty = y + Math.floor(i / n) * (s + 62);
        if (ty < bottom && ty + s + 62 > top) this.tile(albums[i], 'sp/aa/' + i, x + (i % n) * (s + gap), ty, s);
      }
      y += Math.ceil(albums.length / n) * (s + 62);
      if (this.state.get(key) === 'more') { spinner(x + w / 2, y + 20, 12); if (y < bottom + 200) this.more(key); y += 50; }
    }
    v.scroll.content = y + v.scroll.y - top + 24;
    endScroll();
  }
  /** An album's or a playlist's page: its head, then its songs. */
  private collection(x: number, top: number, w: number, bottom: number, v: View): void {
    const key = `${v.kind}/${this.idOf(v.item)}`, all = this.list(key);
    const head = all.length > 0 ? all[0] : v.item, songs: Item[] = all.length > 1 ? all.slice(1) : [];
    beginScroll(v.scroll, x - 36, top, w + 72, bottom - top);
    let y = top + 4 - v.scroll.y;
    cover(head.art, head.name, x, y, 170, 10);
    drawText(F.tinyB, x + 196, y + 20, v.kind === 'album' ? 'ALBUM' : 'PLAYLIST', TEXT2, 255, 0);
    wrap(F.hero, x + 196, y + 40, head.name, TEXT, w - 196, 2, 40);
    const by = head.subtitle + (head.year !== '' ? ' · ' + head.year : '') + (songs.length > 0 ? ' · ' + songs.length + (this.state.get(key) === 'more' ? '+' : '') + ' titres' : '');
    label(F.small, x + 196, y + 124, by, TEXT2, w - 196);
    if (v.kind === 'album' && head.artistId !== '') {
      onTap('sp/c/artist', x + 196, y + 118, Math.min(w - 196, textWidth(F.small, head.subtitle, 0) + 10), 28, () => {
        const ar = new Item(); ar.kind = 'artist'; ar.uri = 'spotify:artist:' + head.artistId; ar.name = head.subtitle; this.open('artist', ar);
      });
    }
    pill('sp/c/play', x + 196, y + 150, 'Lire', 0x000000, GREEN, () => this.host.play(head), 'audio-lines');
    y += 196;
    if (!this.status(key, x, y, w)) { endScroll(); return; }
    if (songs.length === 0 && v.kind === 'playlist') {   // a playlist of someone else: Spotify gives its tracks to the speakers only
      wrap(F.label, x, y + 20, 'Spotify ne montre pas le contenu des playlists des autres aux apps comme celle-ci : « Lire » la joue en entier sur les enceintes.', TEXT2, w, 3, 28);
    }
    for (let i = 0; i < songs.length; i++) {
      const ry = y + i * ROW;
      if (ry < bottom && ry + ROW > top) this.row(songs[i], `sp/c/${i}`, x, ry, w, v.kind === 'album', i, ROW);
    }
    y += songs.length * ROW;
    if (this.state.get(key) === 'more') { spinner(x + w / 2, y + 20, 12); if (y < bottom + 300) this.more(key); y += 50; }
    v.scroll.content = y + v.scroll.y - top + 24;
    endScroll();
  }

  // ---------------------------------------------------------------- pieces
  private grid(items: Item[], id: string, x: number, y0: number, w: number, bottom: number, sc: Scroll, key: string): void {
    const n: i32 = 4, gap = 24, s = (w - gap * (n - 1)) / n, h = s + 62;
    beginScroll(sc, x - 36, y0, w + 72, bottom - y0);
    for (let i = 0; i < items.length; i++) {
      const ty = y0 + 4 + Math.floor(i / n) * h - sc.y;
      if (ty < bottom && ty + h > y0) this.tile(items[i], `${id}/${i}`, x + (i % n) * (s + gap), ty, s);
    }
    let content = Math.ceil(items.length / n) * h + 24;
    if (this.state.get(key) === 'more') { spinner(x + w / 2, y0 + content - sc.y, 12); if (sc.y + sc.view > content - 600) this.more(key); content += 50; }
    if (items.length === 0) centered(F.label, x + w / 2, y0 + 60, 'Rien ici pour le moment', TEXT2);
    sc.content = content;
    endScroll();
  }
  private tile(it: Item, id: string, x: number, y: number, s: number): void {
    if (isPressed(id)) rrect(x - 6, y - 6, s + 12, s + 12, 18, 0xffffff, 30);
    const round = it.kind === 'artist';
    cover(it.art, it.name, x, y, s, round ? s / 2 : 12);
    if (round) centered(F.smallB, x + s / 2, y + s + 10, it.name.length > 22 ? it.name.slice(0, 21) + '…' : it.name, TEXT);
    else { label(F.smallB, x, y + s + 10, it.name, TEXT, s); if (it.subtitle !== '') label(F.tiny, x, y + s + 32, it.subtitle + (it.year !== '' ? ' · ' + it.year : ''), TEXT2, s); }
    onTap(id, x, y, s, s + 50, () => this.touch(it));
    if (!round && s >= 90) this.playButton(id + '/play', x + s - 52, y + s - 52, it);
  }
  /** The green round button on a cover: plays it without opening it. */
  private playButton(id: string, x: number, y: number, it: Item): void {
    rrect(x, y, 44, 44, 22, GREEN, isPressed(id) ? 190 : 255);
    transport('play', x + 24, y + 22, 18, 0x000000);
    onTap(id, x - 4, y - 4, 52, 52, () => this.host.play(it));
  }
  private rows(items: Item[], id: string, x: number, y0: number, w: number, bottom: number, sc: Scroll, key: string, head: string, kinds: boolean): void {
    beginScroll(sc, x - 36, y0, w + 72, bottom - y0);
    const extra = head !== '' ? 1 : 0;
    if (head !== '') {
      const y = y0 - sc.y, hid = id + '/head';
      if (isPressed(hid)) rrect(x - 10, y, w + 20, ROW, 10, CARD2, 255);
      rrect(x, y + 8, 48, 48, 8, GREEN, 255);
      glyph('heart', x + 12, y + 20, 24, 0x000000);
      drawText(F.bodyB, x + 64, y + 22, head, TEXT, 255, 0);
      const liked = new Item(); liked.kind = 'liked'; liked.name = 'Titres likés';
      onTap(hid, x, y, w, ROW, () => this.host.play(liked));
    }
    for (let i = 0; i < items.length; i++) {
      const y = y0 + (i + extra) * ROW - sc.y;
      if (y < bottom && y + ROW > y0) this.row(items[i], `${id}/${i}`, x, y, w, false, i, ROW);
    }
    let content = (items.length + extra) * ROW + 24;
    if (this.state.get(key) === 'more') { spinner(x + w / 2, y0 + content - sc.y, 12); if (sc.y + sc.view > content - 600) this.more(key); content += 50; }
    sc.content = content;
    endScroll();
  }
  /** One song (or an item of a search): its cover or number, its name and artists, its length, its menu. */
  private row(it: Item, id: string, x: number, y: number, w: number, numbered: boolean, i: i32, h: number): void {
    if (isPressed(id)) rrect(x - 10, y, w + 20, h, 10, CARD2, 255);
    const cy = y + (h - 46) / 2;
    if (numbered) centered(F.label, x + 23, cy + 12, '' + (i + 1), TEXT2);
    else cover(it.thumb !== '' ? it.thumb : it.art, it.name, x, cy, 46, it.kind === 'artist' ? 23 : 6);
    const tw = w - 64 - 110;
    label(F.label, x + 62, cy + 2, it.name, TEXT, tw);
    label(F.small, x + 62, cy + 26, it.subtitle, TEXT2, tw);
    if (it.durationMs > 0) drawText(F.small, x + w - 96, cy + 14, clock(it.durationMs / 1000), TEXT2, 255, 0);
    onTap(id, x, y, w - 50, h, () => this.touch(it));
    iconButton(id + '/menu', 'ellipsis', x + w - 20, y + h / 2, 22, TEXT2, () => { this.menuFor = it; this.menuY = y + h; ui.dirty = true; });
  }
  /** A song's actions, under its row; a touch elsewhere closes it. */
  private menu(x: number, top: number, w: number, bottom: number): void {
    const it = this.menuFor as Item;
    const acts: string[] = ['Lire', 'Lire ensuite', 'Ajouter à la file', 'Radio du titre'];
    if (it.artistId !== '') acts.push('Aller à l\'artiste');
    if (it.context.startsWith('spotify:album:')) acts.push('Aller à l\'album');
    const mw = 280, rh = 48, mh = acts.length * rh + 12;
    const mx = x + w - mw, my = this.menuY + mh > bottom ? Math.max(top, this.menuY - mh - 64) : this.menuY;
    rrect(x - 36, top - 200, w + 72, bottom - top + 200, 0, 0x000000, 120);
    onTap('sp/menu/veil', x - 36, top - 200, w + 72, bottom - top + 200, () => { this.menuFor = null; ui.dirty = true; });
    rrect(mx, my, mw, mh, 14, CARD2, 255);
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i], id = 'sp/menu/' + i, ay = my + 6 + i * rh;
      if (isPressed(id)) rrect(mx + 6, ay, mw - 12, rh, 10, FILL, 255);
      drawText(F.label, mx + 20, ay + (rh - fontAscent(F.label)) / 2 - 1, a, TEXT, 255, 0);
      onTap(id, mx, ay, mw, rh, () => {
        this.menuFor = null;
        if (a === 'Lire') this.host.play(it);
        else if (a === 'Lire ensuite') this.host.queue(it, true);
        else if (a === 'Ajouter à la file') this.host.queue(it, false);
        else if (a === 'Radio du titre') this.host.radio(it);
        else if (a === 'Aller à l\'artiste') { const ar = new Item(); ar.kind = 'artist'; ar.uri = 'spotify:artist:' + it.artistId; ar.name = it.subtitle.split(', ')[0]; this.open('artist', ar); }
        else { const al = new Item(); al.kind = 'album'; al.uri = it.context; al.name = ''; this.open('album', al); }
        ui.dirty = true;
      });
    }
  }
}

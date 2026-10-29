// The right-click menu of a song, a selection of songs, an album, an artist or a playlist, as Spotify's: Play, Play next, Add to queue,
// Add to playlist (a normal playlist of the iPod), Get Info (editor.ts), for one song "Genius from this song" (25, 50 or 100 songs, drafts.ts), and "Smart
// playlist like this" on the artist, album artist, album or genre the songs share (smart.ts). It is the system's own menu (zinc:system/menu popup: an NSMenu on macOS), opened where the pointer is.
import * as ui from 'zinc:ui';
import * as menu from 'zinc:system/menu';
import * as ipod from 'zinc:ipod';
import { library } from './state';
import { PodLibrary } from './services/ipod';
import { playList, playNext, addToQueue } from './services/player';
import { geniusFrom, GENIUS_SIZES } from './drafts';
import { smartLike } from './smart';
import { addToPlaylist } from './actions';
import { openInfo } from './editor';
import { playlists } from './state';

const LIKE_FIELDS: string[] = ['artist', 'albumArtist', 'album', 'genre'];
const LIKE_NAMES: string[] = ['Artist', 'Album Artist', 'Album', 'Genre'];
function valueOf(t: ipod.Track, field: string): string { return field === 'artist' ? t.artist : field === 'albumArtist' ? t.albumArtist : field === 'album' ? t.album : t.genre; }
/** The value of `field` every song shares, '' when they differ or it is empty. */
function shared(tracks: ipod.Track[], field: string): string {
  const v = valueOf(tracks[0], field);
  for (const t of tracks) if (valueOf(t, field) !== v) return '';
  return v;
}

/** A menu of choices at the pointer (`ids` and their `labels`): resolves with the id picked, '' when dismissed. */
export async function choose(e: ui.PointerEvent, ids: string[], labels: string[]): Promise<string> {
  const items: menu.Item[] = [];
  for (let i = 0; i < ids.length; i++) items.push(menu.item(ids[i], labels[i]));
  return await menu.popup(items, e.gx, e.gy);
}

/** Opens the menu at the pointer: Play starts `list` at `start`, Play next and Add to queue take `tracks` (`name`: what "Next from" says). */
export async function openTrackMenu(e: ui.PointerEvent, list: ipod.Track[], start: i32, tracks: ipod.Track[], name: string): Promise<void> {
  const lib = library();
  if (lib === null || tracks.length === 0) return;
  const items = [menu.item('play', 'Play'), menu.separator(), menu.item('play-next', 'Play next'), menu.item('add-to-queue', 'Add to queue'),
    menu.separator(), menu.item('info', 'Get Info')];
  if (tracks.length === 1 && tracks[0].mediaType === 'audio') {
    const sizes: menu.Item[] = [];
    for (const n of GENIUS_SIZES) sizes.push(menu.item(`genius-${n}`, `${n} songs`));
    items.push(menu.separator(), menu.submenu('Genius from this song', sizes));
  }
  const normal: menu.Item[] = [];
  for (const p of playlists()) if (!p.smart && !p.podcasts) normal.push(menu.item(`add-to:${p.id}`, p.name));
  if (normal.length > 0) items.push(menu.submenu('Add to playlist', normal));
  const like: menu.Item[] = [];
  for (let i = 0; i < LIKE_FIELDS.length; i++) {
    const v = shared(tracks, LIKE_FIELDS[i]);
    if (v !== '' && (LIKE_FIELDS[i] !== 'albumArtist' || v !== shared(tracks, 'artist'))) like.push(menu.item(`like:${LIKE_FIELDS[i]}:${v}`, `${LIKE_NAMES[i]} is “${v}”`));
  }
  if (like.length > 0) items.push(menu.separator(), menu.submenu('Smart playlist like this…', like));
  const picked = await menu.popup(items, e.gx, e.gy);
  if (picked.startsWith('like:')) { const rest = picked.slice(5), k = rest.indexOf(':'); smartLike(rest.slice(0, k), rest.slice(k + 1)); }
  else if (picked.startsWith('add-to:')) addToPlaylist(picked.slice(7), tracks);
  else if (picked.startsWith('genius-')) geniusFrom(tracks[0], Number(picked.slice(7)) as i32);
  else if (picked === 'info') openInfo(list, tracks);
  else if (picked === 'play') playList(lib as PodLibrary, list, start, name);
  else if (picked === 'play-next') playNext(lib as PodLibrary, tracks, name);
  else if (picked === 'add-to-queue') addToQueue(lib as PodLibrary, tracks, name);
}

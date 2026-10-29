// The right-click menu of a song, a selection of songs, an album or a playlist, as Spotify's: Play, Play next, Add to queue, and for
// one song "Genius from this song" (25, 50 or 100 songs, drafts.ts). It is the system's own menu (zinc:system/menu popup: an NSMenu on macOS), opened where the pointer is.
import * as ui from 'zinc:ui';
import * as menu from 'zinc:system/menu';
import * as ipod from 'zinc:ipod';
import { library } from './state';
import { PodLibrary } from './services/ipod';
import { playList, playNext, addToQueue } from './services/player';
import { geniusFrom, GENIUS_SIZES } from './drafts';

/** Opens the menu at the pointer: Play starts `list` at `start`, Play next and Add to queue take `tracks` (`name`: what "Next from" says). */
export async function openTrackMenu(e: ui.PointerEvent, list: ipod.Track[], start: i32, tracks: ipod.Track[], name: string): Promise<void> {
  const lib = library();
  if (lib === null || tracks.length === 0) return;
  const items = [menu.item('play', 'Play'), menu.separator(), menu.item('play-next', 'Play next'), menu.item('add-to-queue', 'Add to queue')];
  if (tracks.length === 1 && tracks[0].mediaType === 'audio') {
    const sizes: menu.Item[] = [];
    for (const n of GENIUS_SIZES) sizes.push(menu.item(`genius-${n}`, `${n} songs`));
    items.push(menu.separator(), menu.submenu('Genius from this song', sizes));
  }
  const picked = await menu.popup(items, e.gx, e.gy);
  if (picked.startsWith('genius-')) geniusFrom(tracks[0], Number(picked.slice(7)) as i32);
  else if (picked === 'play') playList(lib as PodLibrary, list, start, name);
  else if (picked === 'play-next') playNext(lib as PodLibrary, tracks, name);
  else if (picked === 'add-to-queue') addToQueue(lib as PodLibrary, tracks, name);
}

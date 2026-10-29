// What plays, for the system's media controls (zinc:system/media): Control Center's Now Playing shows the song, its cover and where it is,
// and the keyboard's media keys, Control Center's buttons and AirPods drive the player, here or on a Sonos group alike (player.ts).
// The position is sent when it jumps (a new song, a seek, play or pause), not at every tick: the system counts it on by itself.
import { createEffect } from 'zinc:ui/solid';
import * as ipod from 'zinc:ipod';
import { mediaSession, MediaMetadata, MediaSessionActionDetails } from 'zinc:system/media';
import { current, isPlaying, position, length, toggle, next, previous, seek } from './player';
import { coverPng } from './ipod';

let shown: ipod.Track | null = null;
let sentPos = 0, sentAt = 0, sentLen = 0, sentPlaying = false;

async function showTrack(t: ipod.Track): Promise<void> {
  const meta = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album });
  mediaSession.metadata = meta;
  if (!t.artwork) return;
  let file = '';
  try { file = await coverPng(t.id); } catch (e) { file = ''; }   // no cover: Now Playing shows the song without one
  if (file !== '' && shown === t) mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album, artwork: [{ src: file }] });
}

export function install(): void {
  const act = (f: () => void) => (d: MediaSessionActionDetails): void => f();
  mediaSession.setActionHandler('play', act(() => { if (!isPlaying()) toggle(); }));
  mediaSession.setActionHandler('pause', act(() => { if (isPlaying()) toggle(); }));
  mediaSession.setActionHandler('nexttrack', act(next));
  mediaSession.setActionHandler('previoustrack', act(previous));
  mediaSession.setActionHandler('seekto', (d: MediaSessionActionDetails) => seek(d.seekTime ?? 0));
  createEffect(() => {
    const t = current(), playing = isPlaying(), pos = position(), len = length();
    const changed = t !== shown;
    if (changed) {
      shown = t;
      if (t === null) { mediaSession.metadata = null; return; }
      showTrack(t as ipod.Track);
    }
    if (t === null) return;
    const now = Date.now() / 1000, expected = sentPos + (sentPlaying ? now - sentAt : 0);
    if (changed || playing !== sentPlaying || len !== sentLen || Math.abs(pos - expected) > 1.5) {   // a jump: tell the system, which moves it on from here
      if (len > 0) mediaSession.setPositionState({ duration: len, position: Math.min(pos, len), playbackRate: 1 });
      mediaSession.playbackState = playing ? 'playing' : 'paused';
      sentPos = pos; sentAt = now; sentLen = len; sentPlaying = playing;
    }
  });
}

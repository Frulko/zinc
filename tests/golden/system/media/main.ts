import * as system from 'zinc:system';
import { mediaSession, MediaMetadata, MediaSessionActionDetails, isSupported, dump } from 'zinc:system/media';
console.log('supported', isSupported());
mediaSession.metadata = new MediaMetadata({ title: 'So What', artist: 'Miles Davis', album: 'Kind of Blue', artwork: [{ src: 'file:///tmp/cover.png' }] });
mediaSession.setPositionState({ duration: 562, position: 12, playbackRate: 1 });
mediaSession.playbackState = 'paused';
const on = (d: MediaSessionActionDetails): void => console.log('action', d.action, d.seekTime ?? -1);
mediaSession.setActionHandler('play', on);
mediaSession.setActionHandler('pause', on);
mediaSession.setActionHandler('nexttrack', on);
mediaSession.setActionHandler('seekto', on);
mediaSession.setActionHandler('stop', on);
mediaSession.setActionHandler('stop', null);
console.log(dump());
try { mediaSession.setActionHandler('rewind', on); } catch (e) { console.log((e as Error).message); }
try { mediaSession.playbackState = 'loud'; } catch (e) { console.log((e as Error).message); }
setTimeout(() => { mediaSession.metadata = null; console.log(dump()); system.quit(0); }, 100);

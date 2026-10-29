// zinc:system/media: what plays, for the system's media controls (macOS: Control Center's Now Playing, the keyboard's media keys, AirPods
// and headset buttons). The shape of the web's Media Session API (navigator.mediaSession): a metadata object, a playback state, the
// position, and one handler per action. Where the target has no media controls (zinc:platform MEDIASESSION false) the calls do nothing.
import { call, on } from 'zinc:system';
import { MEDIASESSION } from 'zinc:platform';

/** An image of the media; `src` is a file path (a `file://` URL is accepted). */
export interface MediaImage { src: string; sizes?: string; type?: string; }
export interface MediaMetadataInit { title?: string; artist?: string; album?: string; artwork?: MediaImage[]; }
export class MediaMetadata {
  title: string;
  artist: string;
  album: string;
  artwork: MediaImage[];
  constructor(init: MediaMetadataInit) {
    this.title = init.title ?? '';
    this.artist = init.artist ?? '';
    this.album = init.album ?? '';
    this.artwork = init.artwork ?? [];
  }
}
/** Seconds; `playbackRate` 1 is normal speed. */
export interface MediaPositionState { duration?: number; playbackRate?: number; position?: number; }
/** `seekTime` (seconds) comes with 'seekto', `seekOffset` (seconds) with 'seekforward' and 'seekbackward'. */
export interface MediaSessionActionDetails { action: string; seekTime?: number; seekOffset?: number; }
export type MediaSessionActionHandler = (details: MediaSessionActionDetails) => void;

const ACTIONS: string[] = ['play', 'pause', 'stop', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack'];

export class MediaSession {
  private meta: MediaMetadata | null = null;
  private state: string = 'none';
  private handlers: Map<string, MediaSessionActionHandler> = new Map<string, MediaSessionActionHandler>();
  private listening: boolean = false;

  /** What plays; null clears Now Playing. */
  get metadata(): MediaMetadata | null { return this.meta; }
  set metadata(m: MediaMetadata | null) {
    this.meta = m;
    if (!MEDIASESSION) return;
    if (m === null) { call('media.clear', {}); return; }
    const md = m as MediaMetadata;
    let art = '';
    for (const a of md.artwork) if (art === '' && a.src !== '') art = a.src.startsWith('file://') ? a.src.substring(7) : a.src;
    call('media.setMetadata', { title: md.title, artist: md.artist, album: md.album, artwork: art });
  }
  /** 'none' | 'paused' | 'playing'. */
  get playbackState(): string { return this.state; }
  set playbackState(s: string) {
    if (s !== 'none' && s !== 'paused' && s !== 'playing') throw new TypeError(`playbackState must be 'none', 'paused' or 'playing', not '${s}'`);
    this.state = s;
    if (MEDIASESSION) call('media.setPlaybackState', { state: s });
  }
  /** The position at this moment; the system moves it on by itself while the state is 'playing'. No argument clears it. */
  setPositionState(p: MediaPositionState = {}): void {
    const duration = p.duration ?? 0, position = p.position ?? 0, rate = p.playbackRate ?? 1;
    if (duration < 0 || position < 0 || position > duration || rate === 0) throw new RangeError('setPositionState: 0 <= position <= duration and playbackRate != 0');
    if (MEDIASESSION) call('media.setPositionState', { duration: duration, position: position, playbackRate: rate });
  }
  /** Handles a media key or a button of the system's controls; null removes the action (its button is greyed out). */
  setActionHandler(action: string, handler: MediaSessionActionHandler | null): void {
    if (ACTIONS.indexOf(action) < 0) throw new TypeError(`unknown media session action '${action}' (${ACTIONS.join(', ')})`);
    if (handler === null) this.handlers.delete(action); else this.handlers.set(action, handler as MediaSessionActionHandler);
    if (!MEDIASESSION) return;
    if (!this.listening) { this.listening = true; on('media', (a: string[]) => this.dispatch(a)); }
    const names: string[] = [];
    for (const k of this.handlers.keys()) names.push(k);
    call('media.setActions', { actions: names });
  }
  private dispatch(a: string[]): void {
    const h = this.handlers.get(a[0]);
    if (h === undefined) return;
    const d: MediaSessionActionDetails = { action: a[0] };
    if (a[0] === 'seekto' && a.length > 1) d.seekTime = parseFloat(a[1]);
    if ((a[0] === 'seekforward' || a[0] === 'seekbackward') && a.length > 1) d.seekOffset = parseFloat(a[1]);
    (h as MediaSessionActionHandler)(d);
  }
}

/** The program's one session, as navigator.mediaSession. */
export const mediaSession: MediaSession = new MediaSession();
/** Whether the target shows media controls (zinc:platform MEDIASESSION): macOS. */
export function isSupported(): boolean { return MEDIASESSION; }
/** What the system holds now (title, artist, album, artwork set, duration, position, rate, state, actions), as the backend reads it back. */
export function dump(): string { return JSON.stringify(call('media.dump', {})); }

// zinc:system/media (stub): this target has no desktop services. The same API as plugins/system/media.ts, and every call does nothing.
export interface MediaImage { src: string; sizes?: string; type?: string; }
export interface MediaMetadataInit { title?: string; artist?: string; album?: string; artwork?: MediaImage[]; }
export class MediaMetadata {
  title: string; artist: string; album: string; artwork: MediaImage[];
  constructor(init: MediaMetadataInit) { this.title = init.title ?? ''; this.artist = init.artist ?? ''; this.album = init.album ?? ''; this.artwork = init.artwork ?? []; }
}
export interface MediaPositionState { duration?: number; playbackRate?: number; position?: number; }
export interface MediaSessionActionDetails { action: string; seekTime?: number; seekOffset?: number; }
export type MediaSessionActionHandler = (details: MediaSessionActionDetails) => void;
export class MediaSession {
  private meta: MediaMetadata | null = null;
  private state: string = 'none';
  get metadata(): MediaMetadata | null { return this.meta; }
  set metadata(m: MediaMetadata | null) { this.meta = m; }
  get playbackState(): string { return this.state; }
  set playbackState(s: string) { this.state = s; }
  setPositionState(p: MediaPositionState = {}): void {}
  setActionHandler(action: string, handler: MediaSessionActionHandler | null): void {}
}
export const mediaSession: MediaSession = new MediaSession();
export function isSupported(): boolean { return false; }
export function dump(): string { return '{}'; }

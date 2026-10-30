// zinc:screen-capture in the browser (docs/targets/web.md, "Plugins"): the page cannot list the screens and windows; the browser shows its own
// picker when the program calls navigator.mediaDevices.getDisplayMedia(), which zinc:web leaves to the browser. Permission is asked there too.
export type SourceKind = 'screen' | 'window';
export type PermissionStatus = 'granted' | 'denied';
export interface CaptureSource { id: string; kind: SourceKind; name: string; appName: string; width: number; height: number; thumbnail: number }
export interface SourcesOptions { types?: SourceKind[]; thumbnailSize?: { width: number; height: number } }

/** The browser asks at getDisplayMedia(): 'granted' here. */
export function permissionStatus(): PermissionStatus { return 'granted'; }
export function requestPermission(): Promise<PermissionStatus> { return Promise.resolve('granted'); }
/** Rejects: a page cannot list the sources; getDisplayMedia() shows the browser's picker. */
export function getSources(_o: SourcesOptions = {}): Promise<CaptureSource[]> {
  return Promise.reject(new Error('a web page cannot list the screens and windows: navigator.mediaDevices.getDisplayMedia() shows the browser\'s picker'));
}

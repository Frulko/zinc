// zinc:system/share: the system's share sheet, what a phone's apps share a text or a link with (Android's chooser, iOS's
// UIActivityViewController; React Native's Share.share). zinc.json "permissions": ["share"]. The simulator records the call.
import { call, supports } from 'zinc:system';

export class ShareContent {
  /** The text, the message of React Native's Share. */
  text: string = '';
  url: string = '';
  /** The subject (an e-mail's) or the chooser's title on Android. */
  title: string = '';
}

export function isSupported(): boolean { return supports('share'); }

/** Shows the share sheet: true when it was shown (the user may still cancel it). */
export async function share(c: ShareContent): Promise<boolean> {
  const r = call('share.share', { text: c.text, url: c.url, title: c.title }) as { shared: boolean };
  return r.shared;
}

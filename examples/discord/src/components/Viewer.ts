// The picture viewer of the conversation (the kit's ImageViewer): a click on a picture opens it over the pictures of the channel, from the
// picture's own rectangle. The thumbnail shows at once, the whole file is decoded off the UI thread (zinc:imageio) and takes its place.
import * as ui from 'zinc:ui';
import { openImageViewer, ViewerItem } from 'zinc:ui/kit';
import { load } from 'zinc:imageio';
import { pixelScale } from 'zinc:gfx';
import { writeFiles } from 'zinc:system/clipboard';
import * as dialog from 'zinc:system/dialog';
import { readBytes, writeBytes } from 'zinc:fs';
import { store, Message, Attachment } from '../state';
import { cdnFile, attachmentKey, attachmentFailed } from '../services/cdn';
import { sizeText } from '../content';

/** The image node of each picture on screen, by "message id/attachment id" (the rows keep it while they are drawn). */
export class Thumb { ref: { current: i32 }; picture: i32 = -1; constructor(ref: { current: i32 }) { this.ref = ref; } }
export const thumbs: Map<string, Thumb> = new Map<string, Thumb>();
const keyOf = (m: Message, a: Attachment): string => `${m.id}/${a.id}`;

class Entry { m: Message; a: Attachment; constructor(m: Message, a: Attachment) { this.m = m; this.a = a; } }

/** The pictures of the open channel in the order of the conversation (spoilers still hidden and pictures that failed to load left out). */
function pictures(): Entry[] {
  const out: Entry[] = [], list = store.messages.get(store.channelId);
  if (list !== undefined) for (const m of list) for (const a of m.attachments) if (a.image() && !attachmentFailed(a.url) && !(a.spoiler && !store.revealed.has(m.id))) out.push(new Entry(m, a));
  return out;
}

export function openViewer(m: Message, a: Attachment, shown: i32): void {
  const list = pictures();
  let at = 0;
  const items: ViewerItem[] = [];
  list.forEach((e: Entry, i: i32) => {
    if (e.a === a) at = i;
    const x = e.a, w = x.width, h = x.height;
    const item: ViewerItem = { image: e.a === a ? shown : shownOf(e), width: w, height: h, title: x.filename, detail: `${w} x ${h}  ·  ${sizeText(x.size)}  ·  ${e.m.author}` };
    item.sharper = (): Promise<i32> => cdnFile(attachmentKey(x.url), x.url).then((file: string) => load(file, Math.round(Math.min(w, 2400 / pixelScale()) * pixelScale()), 0)).catch((err: Error): i32 => -1);
    item.copy = (): void => { cdnFile(attachmentKey(x.url), x.url).then((file: string) => { writeFiles([file]); }); };
    item.save = (): void => { save(x); };
    items.push(item);
  });
  openImageViewer({ items: items, index: at, origin: (i: i32): number[] | null => { const t = thumbs.get(keyOf(list[i].m, list[i].a)); return t === undefined || t.ref.current < 0 ? null : ui.screenBox(t.ref.current); } });
}

/** The picture the list draws for an entry (-1 when its row is not drawn: the viewer shows it once the whole file is decoded). */
function shownOf(e: Entry): i32 { const t = thumbs.get(keyOf(e.m, e.a)); return t === undefined ? -1 : t.picture; }

async function save(x: Attachment): Promise<void> {
  const o = new dialog.SaveOptions();
  o.defaultPath = x.filename;
  const to = await dialog.save(o);
  if (to === null) return;
  const file = await cdnFile(attachmentKey(x.url), x.url);
  writeBytes(to, readBytes(file));
}

// Files on their way to the mapper, one at a time. A folder sends the media in it. A single file also becomes a clip of the selected layer and plays at once.
import { createSignal } from 'zinc:ui/solid';
import { EMPTY_CLIP } from './model/clips';
import { expandFolders, mediaName } from './services/files';
import { sendFile } from './services/link';
import { placeClipAndPlay, setStatus, store, touch } from './state';

export interface Transfer { name: string; path: string; part: number; state: string; problem: string }
export const WAITING = 'waiting', SENDING = 'sending', DONE = 'done', FAILED = 'failed';

const MEDIA = /\.(mp4|m4v|webm|mov|mkv|avi|png|jpe?g|webp|gif|bmp|svg|mp3|wav|ogg|m4a)$/i;

export const [transfers, setTransfers] = createSignal<Transfer[]>([]);
export const [transferOpen, setTransferOpen] = createSignal(false);
let running = false;

function changed(): void { setTransfers(transfers().slice()); }

export function waitingCount(): i32 {
  return transfers().filter((t: Transfer): boolean => t.state === WAITING || t.state === SENDING).length as i32;
}

async function sendAll(): Promise<void> {
  running = true;
  for (;;) {
    const next = transfers().find((t: Transfer): boolean => t.state === WAITING);
    if (next === undefined) break;
    const transfer = next as Transfer;
    transfer.state = SENDING;
    changed();
    try {
      store.media = await sendFile(`/media/${transfer.name}`, transfer.path, (part: number) => {
        transfer.part = part;
        changed();
      });
      transfer.part = 1;
      transfer.state = DONE;
      touch();
    } catch (e) {
      transfer.state = FAILED;
      transfer.problem = `${e}`;
    }
    changed();
  }
  running = false;
  const all = transfers();
  if (all.length === 1 && all[0].state === DONE && store.selected >= 0) await placeClipAndPlay({ ...EMPTY_CLIP, label: all[0].name, media: all[0].name });
  const failed = all.filter((t: Transfer): boolean => t.state === FAILED).length;
  setStatus(failed > 0 ? `${failed} of ${all.length} files did not arrive` : `${all.length} sent to the mapper`);
}

/** Files or folders of the person; what is on its way goes on, a finished list makes room for the new one. */
export function sendFiles(paths: string[]): void {
  const files = expandFolders(paths).filter((path: string): boolean => MEDIA.test(path));
  if (files.length === 0) {
    setStatus('no media in what you sent');
    return;
  }
  if (!running) {
    setTransfers([]);
    setTransferOpen(true);
  }
  const list = transfers().slice();
  for (const path of files) list.push({ name: mediaName(path), path, part: 0, state: WAITING, problem: '' });
  setTransfers(list);
  if (!running) sendAll();
}

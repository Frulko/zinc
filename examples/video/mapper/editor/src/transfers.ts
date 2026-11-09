// Import into the library without changing the currently playing show.
import { createSignal } from 'zinc:ui/solid';
import { expandFolders, mediaName } from './services/files';
import { sendFile, linkProjectVersion } from './services/link';
import { setStatus, store, touch } from './state';
import { tr, trn } from './i18n';

export interface Transfer { name: string; path: string; part: number; state: string; problem: string; projectVersion: string }
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
      if (transfer.projectVersion !== linkProjectVersion()) throw new Error('Player or project changed; import the media again');
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
  const failed = all.filter((t: Transfer): boolean => t.state === FAILED).length;
  setStatus(failed > 0 ? trn('mapper.transfer.failed', all.length, ['failed', `${failed}`]) : trn('mapper.transfer.sent', all.length));
}

/** Files or folders of the person; what is on its way goes on, a finished list makes room for the new one. */
export function sendFiles(paths: string[]): void {
  const files = expandFolders(paths).filter((path: string): boolean => MEDIA.test(path));
  if (files.length === 0) {
    setStatus(tr('mapper.transfer.noMedia'));
    return;
  }
  if (!running) {
    setTransfers([]);
    setTransferOpen(true);
  }
  const list = transfers().slice();
  for (const path of files) list.push({ name: mediaName(path), path, part: 0, state: WAITING, problem: '', projectVersion: linkProjectVersion() });
  setTransfers(list);
  if (!running) sendAll();
}

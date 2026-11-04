// Finding the mappers of the network, in a native client (a page cannot browse), and getting the editor's address from one: with a code the first
// time, by its key afterwards, wherever its address went.
import * as link from 'zinc:link';
import { createSignal } from 'zinc:ui/solid';
import { platform } from 'zinc:sys';
import { postOpen } from './link';

const SERVICE = 'zinc-mapper';

export const [mappers, setMappers] = createSignal<link.Peer[]>([]);

export function canBrowse(): boolean { return platform() !== 'web'; }

export function findMappers(): void {
  if (!canBrowse()) return;
  link.init({ name: 'Mapper editor' });
  link.browse(SERVICE, (peer: link.Peer, present: boolean) => {
    const others = mappers().filter((known: link.Peer) => known.id !== peer.id);
    setMappers(present ? [...others, peer] : others);
  });
}

export function stopFinding(): void { if (canBrowse()) link.stopBrowsing(); }

function reasonOf(status: i32): string {
  return status === 429 ? 'Asked a moment ago: the code is coming, or try again in a few seconds.' : `The mapper answered ${status}.`;
}

/** Asks the mapper to show a code; what to tell the person, '' when it does. */
export async function askCodeAt(webBase: string): Promise<string> {
  const reply = await postOpen(`${webBase}/pair/ask`, '');
  return reply.status === 200 ? '' : reasonOf(reply.status);
}

/** The editor's address from a mapper this client holds a key for. */
export function openPaired(peer: link.Peer, onAddress: (address: string) => void, onProblem: (message: string) => void): void {
  const channel = link.connect(peer);
  channel.onMessage((message: any) => {
    if (message.t !== 'editor') return;
    channel.close();
    onAddress(`http://${channel.peer.host}:${message.port}/?token=${message.token}`);
  });
  channel.onClose((why: string) => { if (why !== '') onProblem(why); });
}

export async function pairWith(peer: link.Peer, code: string): Promise<link.Peer> { return await link.pair(peer, code); }

/** A page: the code goes to the mapper that served it; the address with its token, or '' and the reason in `onProblem`. */
export async function pairPage(webBase: string, code: string, onProblem: (message: string) => void): Promise<string> {
  const reply = await postOpen(`${webBase}/pair`, code);
  if (reply.status !== 200) {
    onProblem('Wrong code, or no code on the mapper. Three wrong ones close it: ask for a new one.');
    return '';
  }
  return `${webBase}/?token=${JSON.parse(reply.text).token as string}`;
}

// The link to the mapper: its HTTP API, the same from a page it served and from a native client. Commands are coalesced and sent 30 times a second.
import { fetch, Headers, uploadFile } from 'zinc:web/fetch';
import { SEND_INTERVAL_MS } from '../constants';

let base = '';
let token = '';
let onLost: (message: string) => void = (message: string) => {};

const queueKeys: string[] = [];
const queueBodies: string[] = [];

/** address: "http://host:8080/?token=abc". */
export function connect(address: string, onProblem: (message: string) => void): void {
  const at = address.indexOf('?token=');
  token = at >= 0 ? address.slice(at + 7) : '';
  const cut = at >= 0 ? address.slice(0, at) : address;
  base = cut.endsWith('/') ? cut.slice(0, cut.length - 1) : cut;
  onLost = onProblem;
}

function auth(): Headers {
  const headers = new Headers();
  headers.set('x-zinc-token', token);
  return headers;
}

function coalesceKey(address: string, args: string): string {
  const isPoint = address.endsWith('/corner') || address.endsWith('/point');
  if (!isPoint) return address;
  const second = args.indexOf(',', args.indexOf(',') + 1);
  return `${address} ${args.slice(0, second)}`;
}

/** Queues a command; a later one of the same target replaces it. */
export function send(address: string, numbers: number[], words: string[] = []): void {
  const numberList = JSON.stringify(numbers), wordList = JSON.stringify(words);
  const inner = numberList.slice(1, numberList.length - 1);
  const key = coalesceKey(address, inner);
  const parts: string[] = [JSON.stringify(address)];
  if (numbers.length > 0) parts.push(inner);
  if (words.length > 0) parts.push(wordList.slice(1, wordList.length - 1));
  const body = `[${parts.join(',')}]`;
  const at = queueKeys.indexOf(key);
  if (at >= 0) {
    queueKeys.splice(at, 1);
    queueBodies.splice(at, 1);
  }
  queueKeys.push(key);
  queueBodies.push(body);
}

async function postCommands(body: string): Promise<void> {
  try {
    await fetch(`${base}/osc`, { method: 'POST', body, headers: auth() });
  } catch (e) {
    onLost('the mapper does not answer');
  }
}

/** Sends what is queued at its pace. */
export function startSending(): void {
  setInterval(() => {
    if (queueBodies.length === 0) return;
    const body = `[${queueBodies.join(',')}]`;
    queueKeys.length = 0;
    queueBodies.length = 0;
    postCommands(body);
  }, SEND_INTERVAL_MS);
}

export async function getJson(path: string): Promise<any> {
  const reply = await fetch(`${base}${path}`, { headers: auth() });
  if (reply.status === 401) throw new Error('wrong token: open the address shown on the mapper (Tab)');
  if (!reply.ok) throw new Error(`the mapper answered ${reply.status}`);
  return JSON.parse(await reply.text());
}

export async function putJson(path: string, json: string): Promise<void> {
  await fetch(`${base}${path}`, { method: 'PUT', body: json, headers: auth() });
}

export async function deleteJson(path: string): Promise<any> {
  const reply = await fetch(`${base}${path}`, { method: 'DELETE', headers: auth() });
  return JSON.parse(await reply.text());
}

/** Sends a picked or dropped file; the media list after it. Throws what the mapper said. */
export async function sendFile(name: string, path: string, onProgress: (part: number) => void): Promise<any> {
  const reply = await uploadFile(`${base}/media/${name}`, path, [['x-zinc-token', token]], (sent: number, total: number) => { onProgress(total > 0 ? sent / total : 0); });
  if (reply.status !== 200) throw new Error(reply.body);
  return JSON.parse(reply.body);
}

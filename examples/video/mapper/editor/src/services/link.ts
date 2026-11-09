// The link to the mapper: its HTTP API, the same from a page it served and from a native client. Commands are coalesced and sent 30 times a second.
import { fetch, Headers, uploadFile } from 'zinc:web/fetch';
import { SEND_INTERVAL_MS } from '../constants';
import { tr } from '../i18n';

let base = '';
let token = '';
let projectEpoch = '';
export function linkProjectVersion(): string { return `${connectionVersion}:${projectEpoch}`; }
let connectionVersion: i32 = 0;
enum LinkPhase { Disconnected, Ready, Sending }
let phase = LinkPhase.Disconnected;
let onLost: (message: string) => void = (message: string) => {};

const queueKeys: string[] = [];
const queueBodies: string[] = [];

function transition(next: LinkPhase): void {
  if (next === LinkPhase.Sending && phase !== LinkPhase.Ready) throw new Error('Link is not ready');
  phase = next;
}

/** address: "http://host:8080/?token=abc". */
export function connect(address: string, onProblem: (message: string) => void): void {
  connectionVersion++;
  projectEpoch = '';
  transition(LinkPhase.Disconnected);
  queueKeys.length = 0;
  queueBodies.length = 0;
  const at = address.indexOf('?token=');
  token = at >= 0 ? address.slice(at + 7) : '';
  const cut = at >= 0 ? address.slice(0, at) : address;
  const trimmed = cut.endsWith('/') ? cut.slice(0, cut.length - 1) : cut;
  base = trimmed === '' || trimmed.includes('://') ? trimmed : `http://${trimmed}`;   // an address typed by hand, as the mapper shows it
  onLost = onProblem;
  transition(LinkPhase.Ready);
}

function auth(): Headers {
  const headers = new Headers();
  headers.set('x-zinc-token', token);
  headers.set('x-mapper-project', projectEpoch);
  return headers;
}

function projectChanged(): void {
  connectionVersion++;
  transition(LinkPhase.Disconnected);
  queueKeys.length = 0;
  queueBodies.length = 0;
  onLost('The project changed. Reconnect before editing.');
}

function observeProject(result: any): void {
  if (result === null || typeof result.projectEpoch !== 'string' || result.projectEpoch === '') throw new Error('Player did not identify its project. Update the player before editing.');
  if (projectEpoch !== '' && result.projectEpoch !== projectEpoch) {
    projectChanged();
    throw new Error('The project changed. Reconnect before editing.');
  }
  projectEpoch = result.projectEpoch as string;
}

function replyError(status: i32, text: string, version: string): void {
  let message = tr('mapper.link.answered', ['status', `${status}`]);
  let stale = false;
  try {
    const detail: any = JSON.parse(text);
    if (detail !== null && typeof detail.error === 'string') message = detail.error as string;
    stale = detail !== null && detail.code === 'project_changed';
  } catch (error) {}
  if (stale && version === linkProjectVersion()) projectChanged();
  throw new Error(message);
}

function requireCurrent(version: string): void {
  if (version !== linkProjectVersion() || phase === LinkPhase.Disconnected) throw new Error('Player or project changed');
}

/** The uncredentialed phone URL; the phone pairs with the code shown by the mapper. */
export function remoteAddress(): string {
  return base === '' ? '' : `${base}/#remote`;
}

function coalesceKey(address: string, args: string, words: string): string {
  if (address.startsWith('/fleet/')) return `${address} ${words}`;   // each machine has its own
  const isPoint = address.endsWith('/corner') || address.endsWith('/point');
  if (!isPoint) return address;
  const first = args.indexOf(',');
  const end = address.endsWith('/corner') ? first : args.indexOf(',', first + 1);
  return `${address} ${args.slice(0, end)}`;
}

/** Queues a command; a later one of the same target replaces it. */
export function send(address: string, numbers: number[], words: string[] = []): void {
  if (phase === LinkPhase.Disconnected || projectEpoch === '') return;
  const numberList = JSON.stringify(numbers), wordList = JSON.stringify(words);
  const inner = numberList.slice(1, numberList.length - 1);
  const key = coalesceKey(address, inner, wordList);
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

async function postCommands(body: string, version: i32): Promise<void> {
  const project = linkProjectVersion();
  try {
    const reply = await fetch(`${base}/osc`, { method: 'POST', body, headers: auth() });
    if (!reply.ok) replyError(reply.status as i32, await reply.text(), project);
  } catch (e) {
    if (version === connectionVersion) {
      queueKeys.length = 0;
      queueBodies.length = 0;
      transition(LinkPhase.Disconnected);
      onLost(tr('mapper.link.noAnswer'));
    }
  } finally {
    if (version === connectionVersion && phase === LinkPhase.Sending) transition(LinkPhase.Ready);
  }
}

/** Explicit save/open waits for the previous command batch before changing projects. */
export async function flushCommands(): Promise<void> {
  const version = connectionVersion;
  const deadline = Date.now() + 10000;
  while (phase === LinkPhase.Sending) {
    if (Date.now() > deadline) throw new Error('Commands are still pending');
    await new Promise<void>((resolve: () => void) => { setTimeout(resolve, 10); });
  }
  if (version !== connectionVersion || phase === LinkPhase.Disconnected) throw new Error('Player connection changed');
  if (queueBodies.length > 0) {
    const body = `[${queueBodies.join(',')}]`;
    queueKeys.length = 0;
    queueBodies.length = 0;
    transition(LinkPhase.Sending);
    await postCommands(body, version);
  }
  if (version !== connectionVersion || phase === LinkPhase.Disconnected) throw new Error('Commands were not saved');
}

export function isLocalPlayer(): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/.test(base);
}

/** At most one batch is in flight: later point positions cannot arrive before older ones. */
export function startSending(): void {
  setInterval(() => {
    if (phase !== LinkPhase.Ready || queueBodies.length === 0) return;
    const body = `[${queueBodies.join(',')}]`;
    queueKeys.length = 0;
    queueBodies.length = 0;
    transition(LinkPhase.Sending);
    postCommands(body, connectionVersion);
  }, SEND_INTERVAL_MS);
}

export async function getJson(path: string): Promise<any> {
  const version = linkProjectVersion();
  const reply = await fetch(`${base}${path}`, { headers: auth() });
  const text = await reply.text();
  requireCurrent(version);
  if (reply.status === 401) throw new Error(tr('mapper.link.notPaired'));
  if (!reply.ok) replyError(reply.status as i32, text, version);
  const result: any = JSON.parse(text);
  if (path === '/state' || path === '/project') observeProject(result);
  return result;
}

/** The bytes of a reply, with its status; none when it is not 200. */
export async function getBytes(path: string): Promise<{ status: i32; bytes: u8[] }> {
  const version = linkProjectVersion();
  const reply = await fetch(`${base}${path}`, { headers: auth() });
  const bytes = reply.status === 200 ? await reply.bytes() : [];
  requireCurrent(version);
  return { status: reply.status as i32, bytes };
}

/** A POST to a mapper not connected yet: its status, and its answer. */
export async function postOpen(url: string, body: string): Promise<{ status: i32; text: string }> {
  const reply = await fetch(url, { method: 'POST', body });
  return { status: reply.status as i32, text: await reply.text() };
}

export async function putJson(path: string, json: string): Promise<void> {
  const version = linkProjectVersion();
  requireCurrent(version);
  const reply = await fetch(`${base}${path}`, { method: 'PUT', body: json, headers: auth() });
  requireCurrent(version);
  if (!reply.ok) replyError(reply.status as i32, await reply.text(), version);
}

export async function deleteJson(path: string): Promise<any> {
  const version = linkProjectVersion();
  requireCurrent(version);
  const reply = await fetch(`${base}${path}`, { method: 'DELETE', headers: auth() });
  const text = await reply.text();
  requireCurrent(version);
  if (!reply.ok) replyError(reply.status as i32, text, version);
  return JSON.parse(text);
}

export async function postJson(path: string, body: string = ''): Promise<any> {
  const version = linkProjectVersion();
  requireCurrent(version);
  const reply = await fetch(`${base}${path}`, { method: 'POST', body, headers: auth() });
  const text = await reply.text();
  requireCurrent(version);
  if (!reply.ok) replyError(reply.status as i32, text, version);
  const result: any = JSON.parse(text);
  if (path === '/project/open') {
    if (result === null || typeof result.projectEpoch !== 'string' || result.projectEpoch === '') throw new Error('Player did not confirm its new project');
    queueKeys.length = 0;
    queueBodies.length = 0;
    projectEpoch = result.projectEpoch as string;
    connectionVersion++;
    transition(LinkPhase.Ready);
  }
  return result;
}

export async function getText(path: string): Promise<string> {
  const version = linkProjectVersion();
  const reply = await fetch(`${base}${path}`, { headers: auth() });
  const text = await reply.text();
  requireCurrent(version);
  if (!reply.ok) replyError(reply.status as i32, text, version);
  return text;
}

/** Sends a picked or dropped file to a route ("/media/clip.mp4"); what the mapper answers after it. Throws what it said against. */
export async function sendFile(route: string, path: string, onProgress: (part: number) => void): Promise<any> {
  const version = linkProjectVersion();
  requireCurrent(version);
  const reply = await uploadFile(`${base}${route}`, path, [['x-zinc-token', token], ['x-mapper-project', projectEpoch]], (sent: number, total: number) => { onProgress(total > 0 ? sent / total : 0); });
  requireCurrent(version);
  if (reply.status !== 200) replyError(reply.status, reply.body, version);
  return JSON.parse(reply.body);
}

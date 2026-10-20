// The app's state: what was found on the computer, the conversations, what is selected and shown; the actions the
// components call. Nothing here draws.
import { createSignal } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as proc from 'zinc:process';
import { on } from 'zinc:system';
import { Agent, AGENTS, ModelChoice, TurnSettings, MODE_READ } from './services/agents';
import { ConfigFile, HOME, findBinary, versionOf, findConfig, initialFolders } from './services/discovery';
import { Chat } from './services/chat';
import { Item } from './services/transcript';
import { Spill } from './services/stream';

/** An agent, what discovery found of it, and the settings its next turn runs with. */
export class AgentInfo {
  readonly agent: Agent;
  /** Absolute path of the CLI, '' when it is not installed. */
  readonly binary: string;
  readonly config: ConfigFile[];
  readonly version: () => string;
  readonly setVersion: (v: string) => void;
  /** The models the CLI offers, the default first (filled in the background). */
  readonly models: () => ModelChoice[];
  readonly setModels: (v: ModelChoice[]) => void;
  readonly mode: () => i32;
  readonly setMode: (v: i32) => void;
  readonly model: () => ModelChoice;
  readonly setModelChoice: (v: ModelChoice) => void;
  /** '' : the model's default effort. */
  readonly effort: () => string;
  readonly setEffort: (v: string) => void;
  readonly fast: () => boolean;
  readonly setFast: (v: boolean) => void;

  constructor(agent: Agent) {
    this.agent = agent;
    this.binary = findBinary(agent.binary);
    this.config = findConfig(agent.globalConfig, HOME, '~/');
    const v = createSignal(''), m = createSignal<ModelChoice[]>([]), mode = createSignal<i32>(MODE_READ);
    const model = createSignal<ModelChoice>(new ModelChoice('', 'Default', [], false));
    const effort = createSignal(''), fast = createSignal(agent.fastByDefault(HOME));
    this.version = v[0]; this.setVersion = v[1];
    this.models = m[0]; this.setModels = m[1];
    this.mode = mode[0]; this.setMode = mode[1];
    this.model = model[0]; this.setModelChoice = model[1];
    this.effort = effort[0]; this.setEffort = effort[1];
    this.fast = fast[0]; this.setFast = fast[1];
  }

  /** Picks a model; an effort it does not accept falls back to its default. */
  setModel(m: ModelChoice): void {
    this.setModelChoice(m);
    if (m.efforts.indexOf(this.effort()) < 0) this.setEffort('');
  }

  /** What the next turn runs with (fast only where the model has it). */
  settings(): TurnSettings {
    const m = this.model();
    return new TurnSettings(this.mode(), m.id, this.effort(), m.fast && this.fast());
  }
}

export const agents: AgentInfo[] = AGENTS.map((a: Agent) => new AgentInfo(a));

export function infoOf(a: Agent): AgentInfo {
  for (const i of agents) if (i.agent === a) return i;
  return agents[0];
}

/** Where the conversations are kept: one folder each, `meta.json` and the transcript (services/transcript.ts). */
export const DATA_DIR = sys.env('AGENTS_DATA') !== '' ? sys.env('AGENTS_DATA') : HOME + '/.zinc-agents';
const CHATS_DIR = DATA_DIR + '/chats';

// ---- what the window shows ----

export const ACT_CHATS = 0, ACT_FOLDERS = 1, ACT_AGENTS = 2, ACT_SETTINGS = 3;
const activitySig = createSignal<i32>(ACT_CHATS);
export const activity = activitySig[0];
const sideSig = createSignal(true);
export const sideOpen = sideSig[0];
/** The activity bar: a click on the shown activity folds the side panel, as in VS Code. */
export function pickActivity(a: i32): void {
  if (activity() === a && sideOpen()) sideSig[1](false);
  else { activitySig[1](a); sideSig[1](true); }
}
const detailSig = createSignal(true);
export const detailOpen = detailSig[0];
export function toggleDetail(): void { detailSig[1](!detailOpen()); }
/** The tool or agent call the detail panel shows in full, null: the turn's list. */
const pickedSig = createSignal<Item | null>(null);
export const picked = pickedSig[0];
export function pick(it: Item | null): void { pickedSig[1](it); if (it !== null) detailSig[1](true); }

const schemeSig = createSignal(sys.env('ZINC_SCHEME') === '' ? 'auto' : sys.env('ZINC_SCHEME'));
/** 'dark', 'light' or 'auto' (the system's). */
export const schemeChoice = schemeSig[0];
export function setSchemeChoice(s: string): void { schemeSig[1](s); ui.setScheme(s); }

/** Epoch ms, refreshed every 30 s: the relative times of the conversation list follow it. */
const nowSig = createSignal<number>(Date.now());
export const now = nowSig[0];

// ---- folders and conversations ----

const folderList = createSignal<string[]>(initialFolders());
export const folders = folderList[0];
const selectedFolder = createSignal<string>(folders().length > 0 ? folders()[0] : '');
export const folder = selectedFolder[0];
const selectedAgent = createSignal<AgentInfo>(agents[0]);
export const agent = selectedAgent[0];
/** The file shown in place of the chat, null: the chat. */
const viewedFile = createSignal<ConfigFile | null>(null);
export const viewed = viewedFile[0];
/** The spilled text shown in place of the chat (« Show all »), null: none. */
const viewedSpill = createSignal<Spill | null>(null);
export const viewedOutput = viewedSpill[0];

const chatList = createSignal<Chat[]>([]);
/** Every conversation, the most recent first (an empty one is listed while it is the current one). */
export const chats = chatList[0];
const currentSig = createSignal<Chat | null>(null);
export const current = currentSig[0];
/** The conversations open as tabs, in the order they were opened. */
const tabsSig = createSignal<Chat[]>([]);
export const tabs = tabsSig[0];
const MAX_TABS = 6;

function addFolderPath(path: string): void { if (folders().indexOf(path) < 0) folderList[1]([...folders(), path]); }

/** The conversations kept on disk, without their messages (a chat reads those when it is shown). */
function loadChats(): void {
  if (!fs.exists(CHATS_DIR)) return;
  const found: Chat[] = [];
  for (const id of fs.list(CHATS_DIR)) {
    const dir = `${CHATS_DIR}/${id}`;
    try {
      const j = JSON.parse(fs.readText(dir + '/meta.json'));
      let a: Agent | null = null;
      for (const x of AGENTS) if (x.id === '' + j.agent) a = x;
      if (a === null || !fs.exists('' + j.folder)) continue;
      const c = new Chat(id, dir, '' + j.folder, a as Agent);
      c.persisted = true;
      c.setTitle('' + j.title);
      c.session = '' + j.session;
      c.setUpdated(j.updated as number);
      c.setOutcome(j.outcome as i32);
      c.count = c.store.count();
      found.push(c);
      addFolderPath(c.folder);
    } catch (e) { }   // not a conversation (a half-written folder): skipped
  }
  found.sort((x: Chat, y: Chat) => y.updated() - x.updated());
  chatList[1](found);
}

/** Shows `c` (its window is read back from disk) and hides the one shown before (its window is dropped). */
export function openChat(c: Chat | null): void {
  const was = current();
  if (was === c) return;
  if (was !== null) (was as Chat).hide();
  viewedFile[1](null); viewedSpill[1](null); pickedSig[1](null);
  currentSig[1](c);
  if (c === null) return;
  const chat = c as Chat;
  chat.show();
  selectedFolder[1](chat.folder);
  selectedAgent[1](infoOf(chat.agent));
  if (chats().indexOf(chat) < 0) chatList[1]([chat, ...chats()]);
  const t = tabs();
  if (t.indexOf(chat) < 0) tabsSig[1](t.length < MAX_TABS ? [...t, chat] : [...t.slice(1), chat]);
}

export function closeTab(c: Chat): void {
  const t = tabs().filter((x: Chat) => x !== c);
  tabsSig[1](t);
  if (current() === c) openChat(t.length > 0 ? t[t.length - 1] : null);
}

/** A new, empty conversation with `a` in `path` (kept once it has a message). */
export function newChat(path: string, a: AgentInfo): Chat {
  const id = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  const c = new Chat(id, `${CHATS_DIR}/${id}`, path, a.agent);
  openChat(c);
  return c;
}

/** The latest conversation with `a` in `path`, a new one when there is none. */
function chatFor(path: string, a: AgentInfo): Chat {
  for (const c of chats()) if (c.folder === path && c.agent === a.agent) return c;
  return newChat(path, a);
}

export function selectFolder(path: string): void { selectedFolder[1](path); openChat(chatFor(path, agent())); }
export function selectAgent(a: AgentInfo): void {
  selectedAgent[1](a);
  if (folder() !== '') openChat(chatFor(folder(), a));
}
export function viewFile(f: ConfigFile | null): void { viewedSpill[1](null); viewedFile[1](f); }
export function viewOutput(s: Spill | null): void { viewedFile[1](null); viewedSpill[1](s); }

/** Adds a folder typed by the user (`~` is the home directory) and selects it. False when it is not a folder. */
export function addFolder(typed: string): boolean {
  const t = typed.trim();
  const path = t.startsWith('~') ? HOME + t.slice(1) : t;
  if (path === '' || !fs.exists(path) || !fs.stat(path).isDirectory) return false;
  if (folders().indexOf(path) < 0) folderList[1]([path, ...folders()]);
  selectFolder(path);
  return true;
}

/** Sends a prompt to the current conversation; it moves to the top of the list. */
export function send(prompt: string): void {
  const c = current();
  const a = agent();
  if (c === null || a.binary === '') return;
  const chat = c as Chat;
  if (!chat.send(a.binary, prompt, a.settings(), chat.attachments())) return;
  chat.setDraft('');
  chat.setAttachments([]);
  chatList[1]([chat, ...chats().filter((x: Chat) => x !== chat)]);
}

/** Escape and the Stop button: stops the current conversation's turn. */
export function stopCurrent(): boolean {
  const c = current();
  if (c === null || !(c as Chat).busy()) return false;
  (c as Chat).stop();
  return true;
}

/** Conversations with a turn running. */
export function runningCount(): i32 {
  let n = 0;
  for (const c of chats()) if (c.busy()) n++;
  return n;
}

// ---- memory ----

const rssSig = createSignal<number>(0);
/** The app's resident memory, bytes (0 until measured): `ps`, as the system counts it. */
export const rss = rssSig[0];

let measuring = false;
function measure(): void {
  if (measuring) return;   // one ps at a time (a virtual clock runs faster than ps)
  measuring = true;
  proc.run('ps', ['-o', 'rss=', '-p', `${sys.pid()}`], {}).then((r: proc.Result) => {
    measuring = false;
    const kb = parseInt(r.stdout.trim());
    if (kb > 0) rssSig[1](kb * 1024);
  }).catch((e: Error) => { measuring = false; });
}

function nodesUnder(h: i32): i32 {
  let n = 1;
  const k = ui.childCount(h);
  for (let i = 0; i < k; i++) n += nodesUnder(ui.childAt(h, i));
  return n;
}

/** AGENTS_STATS=<file>: a line of what the app holds, every half second (next/tests/t1/agents_memory.sh reads it). */
function writeStats(path: string): void {
  let window = 0, open = 0, chars = 0, items = 0;
  for (const c of chats()) { const h = c.held(); window += h[0]; open += h[1]; chars += h[2]; items += c.count; }
  try {
    fs.appendText(path, `t=${Date.now()} window=${window} open=${open} chars=${chars} nodes=${nodesUnder(ui.rootNode())} objects=${sys.liveObjects()} rss=${rss()} items=${items} running=${runningCount()}\n`);
  } catch (e) { }
}

/** Reads the CLIs' versions and models in the background, the kept conversations, and starts the clocks. */
export function start(): void {
  for (const a of agents) {
    if (a.binary === '') continue;
    versionOf(a.binary).then((v: string) => a.setVersion(v));
    a.agent.loadModels(a.binary).then((models: ModelChoice[]) => {
      a.setModels(models);
      if (models.length > 0) a.setModel(models[0]);
    });
  }
  loadChats();
  if (folder() !== '') openChat(chatFor(folder(), agent()));
  measure();
  setInterval(() => measure(), 2000);
  setInterval(() => nowSig[1](Date.now()), 30000);
  // a file, image or folder dropped anywhere on the window joins the next message of the current conversation
  on('drop', (args: string[]) => {
    const c = current();
    if (args.length === 0 || (args.length > 1 && args[1] === 'text') || c === null) return;   // a text drop is [text, 'text']
    (c as Chat).attach(args[0]);
  });
  const stats = sys.env('AGENTS_STATS');
  if (stats !== '') setInterval(() => writeStats(stats), 500);
}

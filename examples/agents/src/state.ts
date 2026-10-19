// The app's state: what was found on the computer, what is selected, the chats. Components read these signals and
// call the actions below; nothing here draws.
import { createSignal } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import { Agent, AGENTS } from './services/agents';
import { ConfigFile, HOME, findBinary, versionOf, findConfig, initialFolders } from './services/discovery';
import { Chat } from './services/chat';

/** An agent and what discovery found of it. */
export class AgentInfo {
  readonly agent: Agent;
  /** Absolute path of the CLI, '' when it is not installed. */
  readonly binary: string;
  readonly config: ConfigFile[];
  readonly version: () => string;
  readonly setVersion: (v: string) => void;
  constructor(agent: Agent) {
    this.agent = agent;
    this.binary = findBinary(agent.binary);
    this.config = findConfig(agent.globalConfig, HOME, '~/');
    const v = createSignal('');
    this.version = v[0]; this.setVersion = v[1];
  }
}

export const agents: AgentInfo[] = AGENTS.map((a: Agent) => new AgentInfo(a));

const folderList = createSignal<string[]>(initialFolders());
export const folders = folderList[0];
const selectedFolder = createSignal<string>(folders().length > 0 ? folders()[0] : '');
export const folder = selectedFolder[0];
const selectedAgent = createSignal<AgentInfo>(agents[0]);
export const agent = selectedAgent[0];
/** The file shown in place of the chat, null: the chat. */
const viewedFile = createSignal<ConfigFile | null>(null);
export const viewed = viewedFile[0];

const chats = new Map<string, Chat>();

/** The chat of the selected agent in the selected folder, created on first use. */
export function currentChat(): Chat | null {
  const f = folder();
  if (f === '') return null;
  const a = agent().agent;
  const key = a.id + '\n' + f;
  let c = chats.get(key);
  if (c === undefined) { c = new Chat(f, a); chats.set(key, c); }
  return c as Chat;
}

export function selectFolder(path: string): void { selectedFolder[1](path); viewedFile[1](null); }
export function selectAgent(a: AgentInfo): void { selectedAgent[1](a); viewedFile[1](null); }
export function viewFile(f: ConfigFile | null): void { viewedFile[1](f); }

/** Adds a folder typed by the user (`~` is the home directory) and selects it. False when it is not a folder. */
export function addFolder(typed: string): boolean {
  const t = typed.trim();
  const path = t.startsWith('~') ? HOME + t.slice(1) : t;
  if (path === '' || !fs.exists(path) || !fs.stat(path).isDirectory) return false;
  if (folders().indexOf(path) < 0) folderList[1]([path, ...folders()]);
  selectFolder(path);
  return true;
}

/** Sends a prompt to the current chat. */
export function send(prompt: string): void {
  const c = currentChat();
  if (c !== null && agent().binary !== '') (c as Chat).send(agent().binary, prompt);
}

/** Asks each installed CLI its version, in the background. */
export function loadVersions(): void {
  for (const a of agents) {
    if (a.binary === '') continue;
    versionOf(a.binary).then((v: string) => a.setVersion(v));
  }
}

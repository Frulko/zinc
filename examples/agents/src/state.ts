// The app's state: what was found on the computer, what is selected, the chats. Components read these signals and
// call the actions below; nothing here draws.
import { createSignal } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import { Agent, AGENTS, ModelChoice, TurnSettings, MODE_READ } from './services/agents';
import { ConfigFile, HOME, findBinary, versionOf, findConfig, initialFolders } from './services/discovery';
import { Chat } from './services/chat';

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
  const a = agent();
  if (c !== null && a.binary !== '') (c as Chat).send(a.binary, prompt, a.settings());
}

/** Asks each installed CLI its version and its models, in the background. */
export function loadCatalogs(): void {
  for (const a of agents) {
    if (a.binary === '') continue;
    versionOf(a.binary).then((v: string) => a.setVersion(v));
    a.agent.loadModels(a.binary).then((models: ModelChoice[]) => {
      a.setModels(models);
      if (models.length > 0) a.setModel(models[0]);
    });
  }
}

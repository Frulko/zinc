// Focus (Do Not Disturb, Work, Sleep...) on the Mac: the files of the DoNotDisturb daemon, which macOS 12 to 15 keep in
// ~/Library/DoNotDisturb/DB and only apps with Full Disk Access may read. Assertions.json holds the modes turned on now (an assertion per
// activation, by hand or by a schedule's trigger), ModeConfigurations.json every mode with its name. No public API gives this to an app
// outside the sandbox: INFocusStatusCenter says only "focused or not", and only to an app with the Communication Notifications
// entitlement and the person's consent. Read every few seconds; nothing of it is logged or kept.
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';
import { FocusState, keysOf } from './model';

export class FocusMode {
  id: string; name: string;
  constructor(id: string, name: string) { this.id = id; this.name = name; }
}

/** A name for a mode the configurations do not name (a mode deleted since it was turned on). */
function nameOf(id: string): string {
  if (id.indexOf('donotdisturb.mode.default') >= 0) return 'Ne pas déranger';
  const last = id.slice(id.lastIndexOf('.') + 1);
  return last.length > 0 ? last.charAt(0).toUpperCase() + last.slice(1) : id;
}

/** Every mode of ModeConfigurations.json's text: {data: [{modeConfigurations: {<id>: {mode: {name, modeIdentifier}}}}]}. */
export function modesOf(text: string): FocusMode[] {
  const out: FocusMode[] = [];
  if (text.trim() === '') return out;
  const o = JSON.parse(text);
  if (o === null || !Array.isArray(o.data)) return out;
  for (const d of o.data as any[]) {
    const m = d.modeConfigurations;
    if (m === null || m === undefined || typeof m !== 'object') continue;
    for (const id of keysOf(m)) {
      const mode = m[id].mode;
      const name = mode !== undefined && mode !== null && typeof mode.name === 'string' ? mode.name as string : nameOf(id);
      out.push(new FocusMode(id, name));
    }
  }
  return out;
}

/** The mode on now in Assertions.json's text: {data: [{storeAssertionRecords: [{assertionDetails: {assertionDetailsModeIdentifier}}]}]}; '' when none. */
export function activeOf(text: string): string {
  if (text.trim() === '') return '';
  const o = JSON.parse(text);
  if (o === null || !Array.isArray(o.data)) return '';
  for (const d of o.data as any[]) {
    const recs = d.storeAssertionRecords;
    if (!Array.isArray(recs)) continue;
    for (const r of recs as any[]) {
      const det = r.assertionDetails;
      if (det !== undefined && det !== null && typeof det.assertionDetailsModeIdentifier === 'string') return det.assertionDetailsModeIdentifier as string;
    }
  }
  return '';
}

export class Focus {
  dir: string;
  modes: FocusMode[] = [];
  /** Why the state cannot be read ('' when it can): the files need Full Disk Access. */
  problem: string = '';
  constructor() {
    const d = env('RELAY_FOCUS_DIR');
    this.dir = d !== '' ? d : env('HOME') + '/Library/DoNotDisturb/DB';
  }
  private read(name: string): string {
    const p = this.dir + '/' + name;
    try { return fs.exists(p) ? fs.readText(p) : ''; } catch (e) { this.problem = (e as Error).message; return ''; }
  }
  /** The Focus on now (an empty id when none, or when the files cannot be read). */
  now(): FocusState {
    this.problem = '';
    let id = '';
    try {
      const m = modesOf(this.read('ModeConfigurations.json'));
      if (m.length > 0) this.modes = m;
      id = activeOf(this.read('Assertions.json'));
    } catch (e) {
      this.problem = 'unreadable';
      return new FocusState('', '');
    }
    if (id === '') return new FocusState('', '');
    for (const m of this.modes) if (m.id === id) return new FocusState(id, m.name);
    return new FocusState(id, nameOf(id));
  }
}

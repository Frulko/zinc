import { createSignal } from 'zinc:ui/solid';
import * as dialog from 'zinc:system/dialog';
import * as opener from 'zinc:system/opener';
import * as sys from 'zinc:sys';
import { start, send, stop } from './services/backend';
import { Device, RecoveryPlan, Firmware, LogEntry, RecoveryStep, steps, IdentityProfile, Specification } from './models';

export const [devices, setDevices] = createSignal<Device[]>([]);
export const [selectedId, setSelectedId] = createSignal<string>('');
export const [mode, setMode] = createSignal<string>('hardware');
export const [filesystem, setFilesystem] = createSignal<string>('FAT32');
export const [fault, setFault] = createSignal<string>('none');
export const [busy, setBusy] = createSignal<boolean>(true);
export const [ready, setReady] = createSignal<boolean>(false);
export const [sessionPath, setSessionPath] = createSignal<string>('');
export const [artifact, setArtifact] = createSignal<string>('');
export const [notice, setNotice] = createSignal<string>('Ouverture de la session locale…');
export const [failed, setFailed] = createSignal<boolean>(false);
export const [logs, setLogs] = createSignal<LogEntry[]>([]);
export const [workflow, setWorkflow] = createSignal<RecoveryStep[]>(steps());
export const [recoveryPlan, setRecoveryPlan] = createSignal<RecoveryPlan | null>(null);
export const [firmware, setFirmware] = createSignal<Firmware | null>(null);
export function selected(): Device | null { for (const d of devices()) if (d.id === selectedId()) return d; return null; }

function request(command: string, path: string = '', confirmation: string = ''): void {
  if (busy() || !ready()) return;
  setBusy(true); setFailed(false);
  if (command !== 'export') setArtifact('');
  try { send(JSON.stringify({ command: command, mode: mode(), deviceId: selectedId(), filesystem: filesystem(), fault: fault(), path: path, confirmation: confirmation })); }
  catch (e) { setBusy(false); setFailed(true); setNotice('' + e); }
}
export function selectDevice(id: string): void { if (!busy()) { setSelectedId(id); setRecoveryPlan(null); setWorkflow(steps()); } }
export function chooseMode(value: string): void {
  if (busy() || !ready()) return;
  setMode(value); setDevices([]); setSelectedId(''); setRecoveryPlan(null); setWorkflow(steps());
  scan();
}
export function scan(): void { if (busy()) return; setRecoveryPlan(null); setDevices([]); setSelectedId(''); setWorkflow(steps()); request('scan'); }
export function chooseFormat(value: string): void { if (!busy()) { setFilesystem(value); setRecoveryPlan(null); } }
export function makePlan(): void { request('plan'); }
export function backup(): void { request('backup'); }
export function exportLogs(): void { request('export'); }
export function revealSession(): void { if (sessionPath() !== '') opener.openPath(sessionPath()); }
export function revealArtifact(): void { if (artifact() !== '') opener.reveal(artifact()); }
export async function inspectArchive(): Promise<void> {
  if (busy()) return;
  const o = new dialog.OpenOptions(); o.title = 'Inspecter une archive firmware locale';
  o.filters = [new dialog.Filter('Firmware iPod', ['ipsw', 'zip'])];
  const picked = await dialog.open(o);
  if (picked !== null && (picked as string[]).length === 1) { setFirmware(null); setRecoveryPlan(null); request('inspect', (picked as string[])[0]); }
}
export function inspectSyscfgFile(path: string, reference: boolean): void { request(reference ? 'reference' : 'syscfg', path); }
export async function inspectSyscfg(reference: boolean): Promise<void> {
  if (busy() || selected() === null) return;
  const o = new dialog.OpenOptions();
  o.title = reference ? 'Choisir une référence SysCFG à comparer' : 'Analyser un dump SysCFG courant (8 Ko maximum)';
  const picked = await dialog.open(o);
  if (picked !== null && (picked as string[]).length === 1) inspectSyscfgFile((picked as string[])[0], reference);
}
export async function rehearse(): Promise<void> {
  const d = selected();
  if (busy() || d === null || (d as Device).mode !== 'simulation') return;
  const format = filesystem(), id = (d as Device).id;
  const o = new dialog.MessageOptions('Répéter le parcours de secours ?');
  o.detail = 'Appareil fictif : ' + (d as Device).name + '\nFormat : ' + filesystem() + '\nFirmware : ' + (d as Device).firmware + '\nAucun périphérique USB ne sera modifié. Seuls les fichiers de la session locale sont écrits.';
  o.buttons = ['Simuler', 'Annuler'];
  if ((await dialog.message(o)) !== 0 || busy()) return;
  if (selectedId() !== id || filesystem() !== format) { setNotice('La sélection a changé : confirmer le nouveau plan.'); return; }
  runConfirmedRehearsal();
}
// Kept separate from the dialog so another host can supply its own explicit confirmation.
export function runConfirmedRehearsal(): void { setWorkflow(steps()); request('rehearse', '', 'SIMULER'); }

function receive(line: string): void {
  try {
    const value = JSON.parse(line);
    const type = '' + value.type;
    if (type === 'session') {
      setSessionPath('' + value.path); setReady(true); setBusy(false); scan();
    } else if (type === 'devices') {
      const next: Device[] = [];
      for (let i = 0; i < value.devices.length; i++) {
        const v = value.devices[i], d = new Device();
        d.id = '' + v.id; d.name = '' + v.name; d.mode = '' + v.mode; d.connection = '' + v.connection;
        d.filesystem = '' + v.filesystem; d.scheme = '' + v.scheme; d.size = Number(v.size); d.blockSize = Number(v.blockSize);
        d.model = '' + v.model; d.firmware = '' + v.firmware; d.identity = '' + v.identity; d.physical = '' + v.physical;
        const p = new IdentityProfile(), a = v.profile;
        if (a !== undefined) {
          p.typeName = '' + a.typeName; p.generation = '' + a.generation; p.maximum = '' + a.maximum;
          p.factoryMaximum = '' + a.factoryMaximum; p.advice = '' + a.advice; p.status = '' + a.status; p.detail = '' + a.detail;
          for (let j = 0; j < a.changed.length; j++) p.changed.push('' + a.changed[j]);
          for (let j = 0; j < a.hints.length; j++) p.hints.push('' + a.hints[j]);
          for (let j = 0; j < a.specs.length; j++) p.specs.push(new Specification('' + a.specs[j].label, '' + a.specs[j].value));
          for (let j = 0; j < a.fields.length; j++) p.fields.push(new Specification('' + a.fields[j].label, '' + a.fields[j].value));
        }
        d.profile = p;
        for (let j = 0; j < v.evidence.length; j++) d.evidence.push('' + v.evidence[j]);
        for (let j = 0; j < v.warnings.length; j++) d.warnings.push('' + v.warnings[j]);
        next.push(d);
      }
      const previous = selectedId();
      setDevices(next);
      let preserved = false;
      for (const d of next) if (d.id === previous) preserved = true;
      setSelectedId(preserved ? previous : next.length > 0 && (next.length === 1 || mode() === 'simulation') ? next[0].id : '');
      setRecoveryPlan(null);
    } else if (type === 'plan') {
      const p = new RecoveryPlan(), v = value.plan;
      p.filesystem = '' + v.filesystem; p.firmware = '' + v.firmware; p.sha256 = '' + v.sha256;
      p.simulated = v.simulated === true; p.executable = v.executable === true;
      for (let i = 0; i < v.blockers.length; i++) p.blockers.push('' + v.blockers[i]);
      for (let i = 0; i < v.notes.length; i++) p.notes.push('' + v.notes[i]);
      setRecoveryPlan(p);
    } else if (type === 'firmware') {
      const f = new Firmware(), v = value.firmware;
      f.name = '' + v.name; f.sha256 = '' + v.sha256; f.size = Number(v.size); f.warning = '' + v.warning; f.entries = v.entries.length as i32;
      setFirmware(f); setRecoveryPlan(null);
    } else if (type === 'artifact') { setArtifact('' + value.path); setNotice('' + value.label); }
    else if (type === 'event') {
      const stage = '' + value.stage, message = '' + value.message, level = '' + value.level;
      setLogs([new LogEntry(stage, message, level, Number(value.elapsed).toFixed(2), JSON.stringify(value.detail)), ...logs()].slice(0, 100));
      if (stage === 'result') {
        setNotice(message); setFailed(level === 'error');
        if (level === 'error') {
          const next = workflow().map((s: RecoveryStep) => { const n = new RecoveryStep(s.id, s.title); n.status = s.status === 'running' ? 'failed' : s.status; return n; }); setWorkflow(next);
        }
      } else if (value.detail.state !== undefined) {
        const next = workflow().map((s: RecoveryStep) => { const n = new RecoveryStep(s.id, s.title); n.status = s.id === stage ? '' + value.detail.state : s.status; return n; }); setWorkflow(next);
      }
    } else if (type === 'error') { setNotice('' + value.message); setFailed(true); }
    else if (type === 'done') setBusy(false);
  } catch (e) { setNotice('Réponse du backend illisible : ' + e); setFailed(true); setBusy(false); }
}
export function initialize(): void {
  setMode(sys.env('IPOD_RESCUE_MODE') === 'simulation' ? 'simulation' : 'hardware');
  start(receive, (message: string) => { setBusy(false); setReady(false); setFailed(true); setNotice(message); });
}
export function shutdown(): void { stop(); }

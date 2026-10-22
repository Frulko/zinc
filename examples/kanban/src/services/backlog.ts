import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as proc from 'zinc:process';
import { Task, Detail, decodeTasks, decodeDetail } from '../models';
import { SNAPSHOT_LIMIT } from '../constants';

let root = '', binary = '';
let watcher: proc.Process | null = null;
let detailProcess: proc.Process | null = null;
let detailRequest: i32 = 0;
let snapshotWatch: i32 = -1;
let snapshotFile = '';

export function findRepository(): string {
  const configured = sys.env('KANBAN_REPO');
  let at = configured !== '' ? configured : sys.cwd();
  if (!at.startsWith('/')) at = sys.launchDir() + '/' + at;
  for (let i = 0; i < 12; i++) {
    if (fs.exists(at + '/backlog.config.yml')) return fs.realpath(at);
    const cut = at.lastIndexOf('/');
    if (configured !== '' || cut <= 0) break;
    at = at.slice(0, cut);
  }
  throw new Error('Projet introuvable. Définissez KANBAN_REPO vers le dossier Zinc.');
}
function findBacklog(): string {
  const candidates = sys.env('PATH').split(':');
  candidates.push(sys.env('HOME') + '/.local/bin');
  for (const dir of candidates) if (dir !== '' && fs.exists(dir + '/backlog')) return dir + '/backlog';
  throw new Error('Backlog.md introuvable dans PATH. Installez le CLI backlog.');
}

export function startBacklog(receive: (tasks: Task[]) => void, connection: (live: boolean, message: string) => void): void {
  stopBacklog();
  try {
    snapshotFile = sys.env('KANBAN_SNAPSHOT');
    if (snapshotFile !== '') {
      snapshotFile = fs.realpath(snapshotFile);
      const read = (): void => {
        try { receive(decodeTasks(fs.readText(snapshotFile))); connection(true, 'Instantané local · suivi du fichier'); }
        catch (e) { connection(false, 'Lecture de l’instantané : ' + e); }
      };
      read();
      snapshotWatch = fs.watch(snapshotFile, (event: string, name: string) => read());
      return;
    }
    root = findRepository(); binary = findBacklog();
    const p = proc.spawn(binary, ['task', 'list', '--json', '--watch'], { cwd: root });
    watcher = p;
    let buffer = '', error = '';
    p.onStdout((line: string) => {
      if (watcher !== p) return;
      buffer += line + '\n';
      if (buffer.length > SNAPSHOT_LIMIT) { p.kill(); connection(false, 'Le flux dépasse 16 Mo.'); buffer = ''; return; }
      // Backlog.md frames each pretty-printed snapshot with an unindented closing brace.
      if (line !== '}') return;
      try { receive(decodeTasks(buffer)); connection(true, 'Backlog.md · suivi en direct'); }
      catch (e) { connection(false, 'Lecture du backlog : ' + e); }
      buffer = '';
    });
    p.onStderr((line: string) => { error = (error + line + ' ').slice(-1200); });
    p.onExit((code: i32) => { if (watcher === p) { watcher = null; connection(false, 'Suivi arrêté (' + code + '). ' + error); } });
  } catch (e) { connection(false, '' + e); }
}
export function cancelDetail(): void {
  detailRequest++;
  if (detailProcess !== null) (detailProcess as proc.Process).kill();
  detailProcess = null;
}
export function loadDetail(id: string, receive: (d: Detail | null, error: string) => void): void {
  cancelDetail();
  const request = detailRequest;
  try {
    if (snapshotFile !== '') {
      if (id.includes('/') || id.includes('\\') || id.includes('..')) throw new Error('Identifiant de tâche invalide.');
      const dir = snapshotFile.slice(0, snapshotFile.lastIndexOf('/')) + '/details/';
      const d = decodeDetail(fs.readText(dir + id + '.json'));
      if (d.id !== id) throw new Error('Identifiant différent.');
      receive(d, ''); return;
    }
    const p = proc.spawn(binary, ['task', 'view', id, '--json'], { cwd: root });
    detailProcess = p;
    let output = '', error = '';
    p.onData((chunk: string, stderr: boolean) => {
      if (stderr) error = (error + chunk).slice(-1200);
      else { output += chunk; if (output.length > SNAPSHOT_LIMIT) { error = 'Détail trop volumineux.'; p.kill(); } }
    });
    p.onExit((code: i32) => {
      if (request !== detailRequest) return;
      detailProcess = null;
      if (code !== 0) { receive(null, error !== '' ? error : 'Impossible de lire cette tâche.'); return; }
      try { const d = decodeDetail(output); if (d.id !== id) throw new Error('Identifiant différent.'); receive(d, ''); }
      catch (e) { receive(null, '' + e); }
    });
  } catch (e) { receive(null, '' + e); }
}
export function stopBacklog(): void {
  if (snapshotWatch >= 0) fs.unwatch(snapshotWatch);
  snapshotWatch = -1;
  const p = watcher; watcher = null;
  if (p !== null) (p as proc.Process).kill();
  cancelDetail();
}

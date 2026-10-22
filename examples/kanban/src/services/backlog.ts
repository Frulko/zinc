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
export function writable(): boolean { return snapshotFile === '' && root !== '' && binary !== ''; }

async function clearDescription(base: Detail, title: string): Promise<void> {
  // Backlog.md ignores an empty --description: clear only its marked body, keeping all other fields.
  const r = await proc.run(binary, ['task', 'view', base.id, '--json'], { cwd: root });
  if (r.code !== 0) throw new Error(r.stderr || 'Impossible de relire la tâche.');
  const current = decodeDetail(r.stdout);
  if (current.title !== title || current.description !== base.description) throw new Error('La tâche a changé pendant l’enregistrement. Votre brouillon est conservé.');
  if (current.description === '') return;
  const path = fs.realpath(root + '/' + current.path);
  if (!path.startsWith(root + '/')) throw new Error('Le fichier de tâche est en dehors du projet.');
  const raw = fs.readText(path), begin = '<!-- SECTION:DESCRIPTION:BEGIN -->', end = '<!-- SECTION:DESCRIPTION:END -->';
  const from = raw.indexOf(begin), to = raw.indexOf(end, from + begin.length);
  if (from < 0 || to < 0) throw new Error('La description ne possède pas les marqueurs Backlog.md ; elle reste intacte.');
  const dir = fs.mkdtemp(path.slice(0, path.lastIndexOf('/')) + '/.kanban-');
  try {
    const temp = dir + '/task'; fs.writeText(temp, raw.slice(0, from + begin.length) + '\n' + raw.slice(to));
    fs.chmod(temp, fs.stat(path).mode & 511);
    if (fs.readText(path) !== raw) throw new Error('Le fichier a changé pendant l’enregistrement. Réessayez après relecture.');
    fs.rename(temp, path);
  } finally { fs.remove(dir, true); }
}

/** Only requested fields are changed; Backlog.md preserves the rest of the task and appends comments. */
export async function editTask(base: Detail, title: string, description: string): Promise<void> {
  if (!writable()) throw new Error('Cet instantané est en lecture seule. Connectez le backlog pour modifier une tâche.');
  if (title.trim() === '') throw new Error('Le titre ne peut pas être vide.');
  const current = await proc.run(binary, ['task', 'view', base.id, '--json'], { cwd: root });
  if (current.code !== 0) throw new Error(current.stderr || 'Impossible de relire la tâche.');
  const actual = decodeDetail(current.stdout);
  if (actual.title !== base.title || actual.description !== base.description) throw new Error('La tâche a été modifiée ailleurs. Rechargez le détail avant d’enregistrer. Votre brouillon est conservé.');
  const args = ['task', 'edit', base.id, '--title', title.trim()];
  if (description.trim() !== '') { args.push('--description'); args.push(description); }
  args.push('--plain');
  const result = await proc.run(binary, args, { cwd: root });
  if (result.code !== 0) throw new Error(result.stderr || 'Échec de l’enregistrement.');
  if (description.trim() === '') await clearDescription(base, title.trim());
}
export async function commentTask(id: string, body: string): Promise<void> {
  if (!writable()) throw new Error('Cet instantané est en lecture seule.');
  if (body.trim() === '') throw new Error('Écrivez un commentaire.');
  const normalized = body.replaceAll('\r\n', '\n');
  if (normalized.split('\n').some((line: string) => line.trim() === '---')) throw new Error('Une ligne contenant uniquement --- est réservée par Backlog.md.');
  const author = sys.env('KANBAN_AUTHOR') || sys.env('USER') || 'Kanban';
  const result = await proc.run(binary, ['task', 'edit', id, '--comment', normalized, '--comment-author', author, '--plain'], { cwd: root });
  if (result.code !== 0) throw new Error(result.stderr || 'Échec de l’ajout du commentaire.');
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

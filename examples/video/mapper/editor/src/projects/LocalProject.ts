// A local project is a folder on this computer, not the connected player's live show.
import * as fs from 'zinc:fs';
import * as dialog from 'zinc:system/dialog';
import { createSignal } from 'zinc:ui/solid';
import { language } from '../i18n';

export enum ProjectPhase { Idle, Choosing, Ready, Failed }
const [phase, setPhase] = createSignal<ProjectPhase>(ProjectPhase.Idle);
const [detail, setDetail] = createSignal<string>('');
const [projectPath, setProjectPath] = createSignal<string>('');
export { phase as localProjectPhase, detail as localProjectDetail, projectPath as localProjectPath };
function local(fr: string, en: string): string { return language() === 'fr' ? fr : en; }

function transition(next: ProjectPhase, message: string): void {
  const current = phase();
  const valid = (next === ProjectPhase.Choosing && (current === ProjectPhase.Idle || current === ProjectPhase.Ready || current === ProjectPhase.Failed)) ||
    (current === ProjectPhase.Choosing && (next === ProjectPhase.Idle || next === ProjectPhase.Ready || next === ProjectPhase.Failed));
  if (!valid) throw new Error('Invalid local project transition');
  setDetail(message);
  setPhase(next);
}

async function folder(title: string): Promise<string | null> {
  const options = new dialog.OpenOptions();
  options.title = title;
  options.directory = true;
  const paths = await dialog.open(options);
  return paths === null || paths.length === 0 ? null : paths[0];
}

/** A unique directory is ours to clean up if initialization fails. */
export function createProject(parent: string, name: string): string {
  if (!/^[A-Za-z0-9_-]{1,48}$/.test(name)) throw new Error(local('Nom : 1 à 48 lettres non accentuées, chiffres, tirets ou underscores.', 'Name: 1–48 unaccented letters, numbers, hyphens or underscores.'));
  if (!fs.stat(parent).isDirectory) throw new Error(local('Choisissez un dossier existant.', 'Choose an existing folder.'));
  const path = fs.mkdtemp(`${parent}/${name}-`);
  try {
    if (!fs.mkdir(`${path}/media`) || !fs.mkdir(`${path}/scenes`)) throw new Error('Cannot create project directories');
    fs.writeText(`${path}/mapping.json`, '{"version":1,"layers":[]}');
    fs.writeText(`${path}/show.json`, '{"columns":[],"active":-1,"playing":[]}');
    return path;
  } catch (e) {
    if (!fs.remove(path, true)) throw new Error(`Cannot remove incomplete project ${path}: ${e}`);
    throw e;
  }
}

/** Checks the files before calling a folder a local project; it never connects or changes a player. */
export function inspectProject(path: string): void {
  const mapping: any = JSON.parse(fs.readText(`${path}/mapping.json`));
  const show: any = JSON.parse(fs.readText(`${path}/show.json`));
  if (mapping === null || !Array.isArray(mapping.layers) || show === null || !Array.isArray(show.columns)) throw new Error(local('Projet invalide : mapping ou show incomplet.', 'Invalid project: mapping or show is incomplete.'));
  for (const column of show.columns as any[]) if (column === null || !Array.isArray(column.cells)) throw new Error(local('Projet invalide : colonne sans cellules.', 'Invalid project: a column has no cells.'));
}

export async function chooseLocalProject(create: boolean, name: string): Promise<void> {
  if (phase() === ProjectPhase.Choosing) return;
  transition(ProjectPhase.Choosing, local('Choisissez un dossier.', 'Choose a folder.'));
  try {
    if (create && !/^[A-Za-z0-9_-]{1,48}$/.test(name)) throw new Error(local('Saisissez un nom sans espace ni accent.', 'Enter a name without spaces or accents.'));
    const chosen = await folder(create ? local('Créer un projet dans ce dossier', 'Create a project in this folder') : local('Examiner un projet local', 'Inspect a local project'));
    if (chosen === null) { transition(projectPath() === '' ? ProjectPhase.Idle : ProjectPhase.Ready, local('Annulé.', 'Cancelled.')); return; }
    const path = create ? createProject(chosen, name) : chosen;
    if (!create) inspectProject(path);
    setProjectPath(path);
    transition(ProjectPhase.Ready, create ? local('Projet créé. Le lecteur connecté est inchangé.', 'Project created. The connected player is unchanged.') : local('Structure vérifiée ; médias non contrôlés. Projet non chargé sur le lecteur.', 'Structure checked; media not verified. Project not loaded on the player.'));
  } catch (e) {
    transition(ProjectPhase.Failed, `${e}`);
  }
}

// Delivery runs locally against an explicitly selected, stopped project.
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as dialog from 'zinc:system/dialog';
import * as process from 'zinc:process';
import { createSignal } from 'zinc:ui/solid';
import { language } from '../i18n';
import { inspectProject, localProjectPath } from '../projects/LocalProject';

export enum DeliveryPhase { Idle, Choosing, Running, Done, Failed, Cancelling, Cancelled }
const [phase, setPhase] = createSignal<DeliveryPhase>(DeliveryPhase.Idle);
const [detail, setDetail] = createSignal<string>('');
let toolsRoot = '';
let bakeProcess: process.Process | null = null;
export { phase as deliveryPhase, detail as deliveryDetail };
function local(fr: string, en: string): string { return language() === 'fr' ? fr : en; }

function transition(next: DeliveryPhase, message: string): void {
  const current = phase();
  const valid = (next === DeliveryPhase.Choosing && (current === DeliveryPhase.Idle || current === DeliveryPhase.Done || current === DeliveryPhase.Failed || current === DeliveryPhase.Cancelled)) ||
    (current === DeliveryPhase.Choosing && (next === DeliveryPhase.Idle || next === DeliveryPhase.Running || next === DeliveryPhase.Failed)) ||
    (current === DeliveryPhase.Running && (next === DeliveryPhase.Done || next === DeliveryPhase.Failed || next === DeliveryPhase.Cancelling)) ||
    (current === DeliveryPhase.Cancelling && (next === DeliveryPhase.Cancelled || next === DeliveryPhase.Done || next === DeliveryPhase.Failed));
  if (!valid) throw new Error('Invalid delivery transition');
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

function validRoot(root: string, bake: boolean): boolean {
  if (root === '') return false;
  const tool = bake ? 'bake/bake.py' : 'assemble/zinc.json';
  return fs.exists(`${root}/examples/video/mapper/${tool}`);
}

async function findRoot(bake: boolean): Promise<string | null> {
  if (validRoot(toolsRoot, bake)) return toolsRoot;
  const env = sys.env('ZINC_ROOT');
  if (validRoot(env, bake)) { toolsRoot = env; return env; }
  const picked = await folder(local('Choisir le dossier Zinc contenant les outils Mapper', 'Select the Zinc checkout containing Mapper tools'));
  if (picked === null) return null;
  if (!validRoot(picked, bake)) throw new Error(local('Ce dossier ne contient pas l’outil Mapper demandé.', 'This folder does not contain the requested Mapper tool.'));
  toolsRoot = picked;
  return picked;
}

function cli(root: string): string {
  const local = `${root}/build/zinc`;
  return fs.exists(local) ? local : 'zinc';
}

export function canCancelBake(): boolean { return phase() === DeliveryPhase.Running && bakeProcess !== null; }

export function cancelBake(): void {
  if (!canCancelBake()) return;
  transition(DeliveryPhase.Cancelling, local('Annulation et nettoyage en cours…', 'Cancelling and cleaning up…'));
  (bakeProcess as process.Process).kill(15);
}

function start(cmd: string, args: string[], bake: boolean = false): void {
  const child = process.spawn(cmd, args, {});
  bakeProcess = bake ? child : null;
  child.closeStdin();
  transition(DeliveryPhase.Running, local('En cours… Laissez l’éditeur ouvert jusqu’à la fin.', 'Working… Leave the editor open until this finishes.'));
  let output = '';
  child.onData((text: string, stderr: boolean) => {
    output = (output + text).slice(-4000);
    if (phase() === DeliveryPhase.Running && output.trim() !== '') setDetail(output.trim().split('\n').slice(-2).join('\n'));
  });
  child.onExit((code: i32) => {
    bakeProcess = null;
    const message = output.trim();
    const result = message.split('\n').find((line: string): boolean => line.startsWith('Project assembled:') || line.startsWith('Wrote '));
    if (code === 0) transition(DeliveryPhase.Done, result !== undefined ? result as string : local('Terminé.', 'Finished.'));
    else if (phase() === DeliveryPhase.Cancelling && (code === 130 || code === 143)) transition(DeliveryPhase.Cancelled, local('Export annulé.', 'Export cancelled.'));
    else transition(DeliveryPhase.Failed, message !== '' ? message : `${local('Échec', 'Process failed')} (${code}).`);
  });
}

/** Assembly finishes its copy; a bake owns a cancellable renderer and temporary output. */
export async function deliver(bake: boolean, width: number, height: number, fps: number, duration: number, animated: boolean = false, column: number = 0): Promise<void> {
  if (phase() === DeliveryPhase.Choosing || phase() === DeliveryPhase.Running || phase() === DeliveryPhase.Cancelling) return;
  if (sys.platform() === 'web') return;
  transition(DeliveryPhase.Choosing, local('Choisissez un projet local.', 'Choose a local project.'));
  try {
    if (bake && (width < 2 || width > 4096 || width % 2 !== 0 || height < 2 || height > 4096 || height % 2 !== 0 || fps < 1 || fps > 60 || !Number.isFinite(duration) || duration <= 0 || duration > 3600 || !Number.isInteger(width) || !Number.isInteger(height) || !Number.isInteger(fps))) throw new Error(local('Dimensions paires de 2 à 4096, cadence de 1 à 60 et durée de 0 à 3600 secondes.', 'Use even dimensions from 2 to 4096, 1–60 fps and a duration up to 3600 seconds.'));
    if (bake && (!Number.isInteger(column) || column < 0)) throw new Error(local('La colonne doit être un entier positif, ou 0 pour le mapping enregistré.', 'Column must be a positive integer, or 0 for the saved mapping.'));
    if (bake && animated && (width > 1920 || height > 1080 || Math.ceil(fps * duration) > 120)) throw new Error(local('Export animé : 1920 × 1080 et 120 images maximum. Réduisez la durée ou la cadence.', 'Animated export: at most 1920 × 1080 and 120 frames. Reduce duration or frame rate.'));
    const root = await findRoot(bake);
    if (root === null) { transition(DeliveryPhase.Idle, local('Annulé.', 'Cancelled.')); return; }
    const project = localProjectPath() !== '' ? localProjectPath() : await folder(local('Choisir le dossier du projet Mapper arrêté', 'Select a stopped Mapper project folder'));
    if (project === null) { transition(DeliveryPhase.Idle, local('Annulé.', 'Cancelled.')); return; }
    if (!fs.exists(`${project}/mapping.json`) || (!bake && !fs.exists(`${project}/show.json`))) throw new Error(local('Le dossier ne contient pas un projet Mapper enregistré.', 'The selected folder does not contain a saved Mapper project.'));
    inspectProject(project);
    if (bake && column > 0) {
      const show: any = JSON.parse(fs.readText(`${project}/show.json`));
      if (column > show.columns.length) throw new Error(local('Cette colonne n’existe pas dans le projet sélectionné.', 'That column does not exist in the selected project.'));
    }
    const choice = new dialog.MessageOptions(local('Où se trouvent les médias de ce projet ?', 'Where are this project’s media?'));
    choice.buttons = [local('Dans le projet', 'Project folder'), local('Autre dossier', 'Choose folder'), local('Annuler', 'Cancel')];
    const mediaChoice = await dialog.message(choice);
    if (mediaChoice < 0 || mediaChoice === 2) { transition(DeliveryPhase.Idle, local('Annulé.', 'Cancelled.')); return; }
    let media = '';
    if (mediaChoice === 1) {
      const selected = await folder(local('Choisir le dossier des médias', 'Select the media folder'));
      if (selected === null) { transition(DeliveryPhase.Idle, local('Annulé.', 'Cancelled.')); return; }
      media = selected;
    }
    if (bake) {
      const options = new dialog.SaveOptions();
      options.title = animated ? local('Enregistrer la vidéo animée mappée', 'Save animated mapped video') : local('Enregistrer la vidéo statique mappée', 'Save static mapped video');
      options.defaultPath = 'mapping.mp4';
      const output = await dialog.save(options);
      if (output === null) { transition(DeliveryPhase.Idle, local('Annulé.', 'Cancelled.')); return; }
      const args = [`${root}/examples/video/mapper/bake/bake.py`, `${project}/mapping.json`, output, '--size', `${width}x${height}`, '--fps', `${fps}`, '--duration', `${duration}`, '--zinc', cli(root)];
      if (media !== '') args.push('--media', media);
      if (animated) args.push('--animated');
      if (column > 0) args.push('--show', `${project}/show.json`, '--column', `${column - 1}`);
      start('python3', args, true);
    } else {
      const destination = await folder(local('Choisir où copier le projet', 'Select a destination for the project copy'));
      if (destination === null) { transition(DeliveryPhase.Idle, local('Annulé.', 'Cancelled.')); return; }
      const args = ['run', `${root}/examples/video/mapper/assemble`, '--', project, destination];
      if (media !== '') args.push(media);
      start(cli(root), args);
    }
  } catch (e) {
    transition(DeliveryPhase.Failed, `${e}`);
  }
}

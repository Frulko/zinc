// The active project belongs to the connected player; local folders are separate until opened.
import { waitingCount } from '../transfers';
import { createSignal } from 'zinc:ui/solid';
import { getJson, postJson, flushCommands } from '../services/link';
import { loadMedia, loadShow, loadState, waitForShowSave } from '../state';

export enum ActiveProjectPhase { Idle, Working, Ready, Failed }
const [phase, setPhase] = createSignal<ActiveProjectPhase>(ActiveProjectPhase.Idle);
const [path, setPath] = createSignal<string>('');
const [detail, setDetail] = createSignal<string>('');
export { phase as activeProjectPhase, path as activeProjectPath, detail as activeProjectDetail };
function transition(next: ActiveProjectPhase): void {
  if (next === ActiveProjectPhase.Working && phase() === ActiveProjectPhase.Working) throw new Error('Project operation in progress');
  if (next !== ActiveProjectPhase.Working && phase() !== ActiveProjectPhase.Working) throw new Error('No project operation in progress');
  setPhase(next);
}

/** refresh, save or open. The API confirms completion before this editor reports success. */
export async function playerProject(action: string, chosenPath: string = ''): Promise<void> {
  if (phase() === ActiveProjectPhase.Working) return;
  transition(ActiveProjectPhase.Working);
  setDetail('');
  try {
    if (action === 'open' && waitingCount() > 0) throw new Error('Wait for media uploads to finish before opening another project');
    if (action === 'refresh') setPath('');
    if (action !== 'refresh') {
      await flushCommands();
      await waitForShowSave();
    }
    const result = action === 'refresh' ? await getJson('/project') : await postJson(`/project/${action}`, action === 'open' ? JSON.stringify({ path: chosenPath }) : '');
    if (typeof result.path !== 'string') throw new Error('Player did not confirm its project');
    setPath(result.path as string);
    if (action === 'open') {
      await loadState();
      await loadShow();
      await loadMedia();
    }
    setDetail(action);
    transition(ActiveProjectPhase.Ready);
  } catch (error) {
    setDetail(`${error}`);
    transition(ActiveProjectPhase.Failed);
  }
}

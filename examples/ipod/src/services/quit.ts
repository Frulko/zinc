// Quitting cleanly. Every way out (Cmd+Q, Quit in the menu bar item, the window closed while nothing keeps the app alive, SIGINT,
// SIGTERM) comes here: the steps registered with onQuit run in order (the session saved, the speaker paused before the server that
// feeds it goes, the speakers' events unsubscribed, the server stopped, the iPod closed...), each awaited, all within QUIT_LIMIT_MS;
// then the process ends, finished or not. A step that fails or hangs does not stop the ones after it.
import * as sys from 'zinc:sys';

const QUIT_LIMIT_MS = 3000;

class Step {
  name: string; run: () => Promise<void>;
  constructor(name: string, run: () => Promise<void>) { this.name = name; this.run = run; }
}
const steps: Step[] = [];
let quitting = false;

/** Adds a step to the quit, after those registered before it. */
export function onQuit(name: string, run: () => Promise<void>): void { steps.push(new Step(name, run)); }
/** True once the quit started (a step may want to know: nothing new is begun then). */
export function isQuitting(): boolean { return quitting; }

/** `p`, or nothing after `ms`: a step that hangs leaves time to the others. */
function within(p: Promise<void>, ms: number): Promise<void> {
  return new Promise<void>((resolve: () => void) => {
    let done = false;
    const end = (): void => { if (!done) { done = true; resolve(); } };
    setTimeout(end, ms);
    p.then(end, (e: Error) => { console.log(`quit: ${e.message}`); end(); });
  });
}

/** Runs the steps, then ends the process with `code`. A second call while quitting does nothing. */
export async function quitNow(code: i32 = 0): Promise<void> {
  if (quitting) return;
  quitting = true;
  const deadline = sys.clock() + QUIT_LIMIT_MS;
  setTimeout(() => { sys.exit(code); }, QUIT_LIMIT_MS + 100);   // whatever happens, the app is gone then
  for (const s of steps) {
    const left = deadline - sys.clock();
    if (left <= 0) break;
    let started: Promise<void>;
    try { started = s.run(); } catch (e) { console.log(`quit: ${s.name}: ${(e as Error).message}`); continue; }
    await within(started, left);
  }
  sys.exit(code);
}

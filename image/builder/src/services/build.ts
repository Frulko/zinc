// One build: tools/pi-image run with the saved profile, its output read line by line. The lines it prints for apps
// ("::step 3/12 label", "::progress 42 text", "::error text", "::done /dist/file") become calls of the listener; every
// line but the progress ones goes to the log.
import * as proc from 'zinc:process';
import * as sys from 'zinc:sys';
import { PROTOCOL_STEP, PROTOCOL_PROGRESS, PROTOCOL_ERROR, PROTOCOL_DONE, BUILD_CONTAINER, EXTRA_PATH } from '../constants';

export interface BuildListener {
  onStep(index: i32, total: i32, label: string): void;
  /** How far the current step's long command is: percent, or -1 when not known, and a line that says it. */
  onProgress(percent: i32, text: string): void;
  onError(message: string): void;
  onDone(imagePath: string): void;
  onLine(line: string): void;
  onExit(code: i32): void;
}

/** "3/12 Installing packages" -> [3, 12] and the label; a total of "?" (the first step) is 0. */
export class StepLine {
  index: i32 = 0;
  total: i32 = 0;
  label: string = '';
}

export function parseStep(rest: string): StepLine {
  const step = new StepLine();
  const space = rest.indexOf(' ');
  const counts = (space < 0 ? rest : rest.slice(0, space)).split('/');
  step.index = parseInt(counts[0]) as i32;
  step.total = counts.length > 1 && counts[1] !== '?' ? parseInt(counts[1]) as i32 : 0;
  step.label = space < 0 ? '' : rest.slice(space + 1);
  return step;
}

export function dispatchLine(line: string, listener: BuildListener): void {
  if (line.startsWith(PROTOCOL_STEP)) {
    const step = parseStep(line.slice(PROTOCOL_STEP.length));
    listener.onStep(step.index, step.total, step.label);
  } else if (line.startsWith(PROTOCOL_PROGRESS)) {
    const rest = line.slice(PROTOCOL_PROGRESS.length);
    const space = rest.indexOf(' ');
    listener.onProgress(parseInt(space < 0 ? rest : rest.slice(0, space)) as i32, space < 0 ? '' : rest.slice(space + 1));
    return;
  } else if (line.startsWith(PROTOCOL_ERROR)) {
    listener.onError(line.slice(PROTOCOL_ERROR.length));
  } else if (line.startsWith(PROTOCOL_DONE)) {
    listener.onDone(line.slice(PROTOCOL_DONE.length));
  }
  listener.onLine(line);
}

function environment(): string[] { return ['PATH=' + EXTRA_PATH + ':' + sys.env('PATH')]; }

export class BuildRun {
  process: proc.Process;

  /** @throws when the tool cannot be started */
  constructor(tool: string, profilePath: string, workingDirectory: string, listener: BuildListener) {
    this.process = proc.spawn(tool, ['build', profilePath], { cwd: workingDirectory, env: environment() });
    this.process.closeStdin();
    this.process.onStdout((line: string) => dispatchLine(line, listener));
    this.process.onStderr((line: string) => dispatchLine(line, listener));
    this.process.onExit((code: i32) => listener.onExit(code));
  }

  /** The container cleans up (unmounts, frees its loop devices) and the tool exits with an error. */
  stop(): void {
    proc.run('docker', ['stop', BUILD_CONTAINER], { env: environment() });
    this.process.kill();
  }
}

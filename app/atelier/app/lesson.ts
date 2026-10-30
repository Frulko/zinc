// A lesson beside the sketch (ZN-774.26): the panel of components/Lesson.tsx. The lessons, their checks and the progress belong to
// `zinc learn` (src/cli_learn.cpp); Atelier runs it with --json and shows what it says: the lesson's folder is an ordinary sketch of the
// sketchbook, each save checks the step, the hint and the solution come on demand. The progress ($ZINC_HOME/learn.json) is the one
// `zinc learn` keeps in a terminal.
import { createSignal } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { zinc, job } from './tools';
import { sketchDir, sketchbook, openSketch, openFile, edited, save, say, Buffer } from './workspace';
import { t } from './text';
import { setStartOpen } from './commands';

export class LessonState {
  id: string = ''; title: string = ''; page: string = ''; dir: string = ''; file: string = '';
  step: i32 = 0; steps: i32 = 0; done: boolean = false;
  text: string = ''; hint: string = ''; solution: string = '';
  checked: i32 = 0; passed: boolean = false; message: string = ''; errors: string = '';
}
export class LessonEntry { id: string = ''; title: string = ''; steps: i32 = 0; done: i32 = 0; }

export const [lesson, setLesson] = createSignal<LessonState | null>(null);
export const [hintOpen, setHintOpen] = createSignal<boolean>(false);
export const [lessonList, setLessonList] = createSignal<LessonEntry[]>([]);
const echo: boolean = sys.env('ZINC_ATELIER_ECHO') !== '';   // tests read the panel's state on Atelier's output
/** The panel's state in one line (scripted sessions wait for it, the tests read it). */
export function lessonText(): string {
  const s = lesson();
  if (s === null) return '';
  const l = s as LessonState;
  return `${l.id} step ${l.step}/${l.steps}${l.done ? ' done' : ''}` + (l.checked > 0 ? (l.passed ? ` passed ${l.checked}` : ` not yet: ${l.message}`) : '');
}
function show(s: LessonState | null): void { setLesson(s); if (echo && s !== null) console.log('[lesson] ' + lessonText()); }

/** What `zinc learn --json` printed, or null when it printed no state (the folder holds no lesson). */
function parse(out: string): LessonState | null {
  const at = out.indexOf('{');
  if (at < 0) return null;
  try {
    const d = JSON.parse(out.slice(at));
    const s = new LessonState();
    s.id = d.lesson; s.title = d.title; s.page = d.page; s.dir = d.dir; s.file = d.file;
    s.step = d.step; s.steps = d.steps; s.done = d.done;
    s.text = d.text; s.hint = d.hint; s.solution = d.solution;
    if (d.checked !== undefined) { s.checked = d.checked; s.passed = d.passed; s.message = d.message; s.errors = d.errors; }
    return s;
  } catch (e) { return null; }
}

/** Runs `zinc learn <args> --json` and shows its answer; `then` gets it. */
function learn(args: string[], then: (s: LessonState | null) => void): void {
  let out = '';
  job(1);
  try {
    const p = zinc(['learn'].concat(args).concat(['--json']), '');
    p.onData((chunk: string, stderr: boolean) => { if (!stderr) out += chunk; });
    p.onExit((code: i32) => { job(-1); then(parse(out)); });
  } catch (e) { job(-1); }
}

/** The lessons for the menu (`zinc learn --list --json`); `then` rebuilds what lists them. */
export function loadLessons(then: () => void): void {
  let out = '';
  job(1);
  try {
    const p = zinc(['learn', '--list', '--json'], '');
    p.onData((chunk: string, stderr: boolean) => { if (!stderr) out += chunk; });
    p.onExit((code: i32) => {
      job(-1);
      const list: LessonEntry[] = [];
      try {
        for (const d of JSON.parse(out)) { const e = new LessonEntry(); e.id = d.id; e.title = d.title; e.steps = d.steps; e.done = d.done; list.push(e); }
      } catch (e) { /* no lessons where this zinc looks */ }
      setLessonList(list);
      then();
    });
  } catch (e) { job(-1); then(); }
}

/** Opens lesson `id` beside the editor: unpacked into the sketchbook the first time (its starter code), then opened as the sketch. */
export function openLesson(id: string): void {
  const dir = sketchbook() + '/' + id;
  learn([id, '--dir', dir], (s: LessonState | null) => {
    if (s === null) return;
    setHintOpen(false);
    setStartOpen(false);
    openSketch(s.dir);
    show(s);
  });
}

/** The sketch just opened: its lesson when it is a lesson's folder (a .lesson file), else no panel. */
export function sketchOpened(dir: string): void {
  if (dir === '' || !fs.exists(dir + '/.lesson')) { setLesson(null); return; }
  const cur = lesson();
  if (cur !== null && (cur as LessonState).dir === dir) return;
  learn(['--dir', dir], (s: LessonState | null) => { setHintOpen(false); show(s); });
}

/** Checks the step on the file as saved (each save of the lesson's sketch does it). */
export function checkLesson(): void {
  const cur = lesson();
  if (cur === null || (cur as LessonState).dir !== sketchDir()) return;
  learn(['--check', '--dir', (cur as LessonState).dir], (s: LessonState | null) => {
    if (s === null) return;
    if ((s as LessonState).passed) { setHintOpen(false); say(t('atelier.lesson.passed', ['step', `${(s as LessonState).checked}`])); loadLessons(() => { }); }   // the start view's progress
    show(s);
  });
}

/** The solution of the step in the editor, saved (so checked): Svelte's Solve. */
export function solveStep(): void {
  const cur = lesson();
  if (cur === null) return;
  const s = cur as LessonState;
  const b = openFile(s.dir + '/' + s.file);
  if (b === null) return;
  edited(b as Buffer, s.solution);
  save(b as Buffer);
}

export function closeLesson(): void { setLesson(null); }

// The first-launch tour (ZN-774.08, docs/reports/onboarding-atelier-audit.md 8b): the language first, then one step per part of the
// window. The steps and where the tour is; components/Tour.tsx draws it and does what each step asks. Finished or skipped, the
// tour is remembered in ~/.zinc/atelier.json (<ZINC_ATELIER_HOME>/.atelier.json under a test) and never comes back unasked;
// Help > Tour replays it, without the language.
import { createSignal } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

/** The steps, in order; their texts are atelier.tour.<id>.title and .text. */
export const STEPS: string[] = ['language', 'welcome', 'example', 'editor', 'run', 'console', 'error', 'completion', 'palette', 'devices', 'templates'];
/** The step shown, -1 when there is no tour. */
export const [tourStep, setTourStep] = createSignal<i32>(-1);
export function tourOn(): boolean { return tourStep() >= 0; }
export function stepId(): string { const i = tourStep(); return i < 0 ? '' : STEPS[i]; }

function markerFile(): string {
  const book = sys.env('ZINC_ATELIER_HOME'), home = sys.env('ZINC_HOME') !== '' ? sys.env('ZINC_HOME') : sys.env('HOME') + '/.zinc';
  return book !== '' ? book + '/.atelier.json' : home + '/atelier.json';
}
function marker(): any {
  try { const d: any = JSON.parse(fs.readText(markerFile())); if (d !== null && typeof d === 'object') return d; } catch (e) { }
  return JSON.parse('{}');
}
/** True on a first launch: the tour was never finished nor skipped (and, under a test's sketchbook, only when the test asks). */
export function tourWanted(): boolean {
  if (sys.env('ZINC_ATELIER_HOME') !== '' && sys.env('ZINC_ATELIER_TOUR') !== '1') return false;
  return marker().tour !== 'done';
}
function remember(skipped: boolean): void {
  const d = marker();
  d.tour = 'done'; d.tourVersion = 1; d.skipped = skipped;
  try { const f = markerFile(); fs.mkdir(f.slice(0, f.lastIndexOf('/')), true); fs.writeText(f, JSON.stringify(d) + '\n'); } catch (e) { }
}

/** Starts the tour: at the language on a first launch, at the welcome when Help > Tour replays it. */
export function startTour(withLanguage: boolean): void { setTourStep(withLanguage ? 0 : 1); }
export function nextStep(): void { if (tourStep() + 1 < STEPS.length) setTourStep(tourStep() + 1); else endTour(false); }
export function backStep(): void { if (tourStep() > 1) setTourStep(tourStep() - 1); }
/** Ends the tour, finished or skipped (Escape, Skip the tour): it will not come back by itself. */
export function endTour(skipped: boolean): void { if (tourStep() < 0) return; setTourStep(-1); remember(skipped); }

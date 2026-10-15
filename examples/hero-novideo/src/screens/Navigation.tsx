// Navigation: the turn-by-turn GPS demo of examples/maps/navigation, embedded (its code is imported from there).
// The map keeps its own state (module level), so it pauses while the tab is closed and resumes where it was.
import { createEffect } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Navigation, navKey, mapRef, stepNavigation } from '../../../maps/navigation/src/embed';
import { startApp, setNight, handNightToHost, skipPreview } from '../../../maps/navigation/src/app';
import { jumpTo, setPlaying } from '../../../maps/navigation/src/sim';
import { dark, setDark } from '../app/prefs';

let started = false;

export function NavigationScreen(): i32 {
  if (!started) { started = true; startApp(true); handNightToHost((on: boolean) => setDark(on)); }
  createEffect(() => setNight(dark()));   // the map palette follows the app theme; its moon / sun button toggles it
  return <Navigation />;
}

/** Skips the route preview and drives from `d` metres (ZINC_DEMO=navdrive, perf runs). */
export function driveAt(d: number): void { skipPreview(); jumpTo(d); setPlaying(true); }

/** Keys of the map (digits stay tab shortcuts); true when handled. */
export function navigationKey(e: ui.KeyEvent): boolean { return navKey(e, false); }

/** Per frame, only while the tab is mounted: the camera gets the map canvas box. */
export function stepNavigationTab(dt: number): void {
  if (mapRef.node < 0) return;
  const b = ui.screenBox(mapRef.node);
  if (b[2] > 0) stepNavigation(dt, b[0], b[1], b[2], b[3]);
}

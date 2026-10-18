// zinc:script/fast: the numbers-only fast path of the QuickJS boundary. A call that takes up to four numbers and returns one crosses without JSON text, without Dyn values
// and without an engine context, in both directions: about 0.04 us on a desktop where the generic `expose` and `call` cost about 1 us (and 60 to 80 us on a 2012 tablet,
// where this costs 0.7 to 1.1 us). Use it for the hot calls (a UI mutation, a cell of a map, a tick); everything else stays on zinc:script.
// docs/reports/script-boundary-optimisation.md; measured by next/tools/bench-bridge.
import { Script, ScriptFunction, scriptError } from 'zinc:script';
import F from './native/quickjs_fast.spec';

/** A host function for the script: up to four numbers in, one number out. */
export type NumFn = (a: number, b: number, c: number, d: number) => number;

/** Makes `fn` a global function of the script. The script's arguments are converted with Number() (a missing one is 0); the result is a number; a throw in `fn` becomes an Error in the script. */
export function exposeNum(s: Script, name: string, fn: NumFn): void { F.exposeNum(s.engine.h, name, fn); }

/** Calls a function of the script (from Script.fn) with up to four numbers (n of them) and returns its number. Throws the script's error when it threw or did not return a number. */
export function callNum(f: ScriptFunction, n: number, a: number, b: number, c: number, d: number): number {
  const h = f.engine.h;
  const r = F.callRefNum(h, f.ref, n, a, b, c, d);
  if (r !== r && F.failed(h)) throw scriptError(h);
  return r;
}

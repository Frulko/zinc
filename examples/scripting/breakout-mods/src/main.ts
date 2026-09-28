// breakout with mods: the game of examples/breakout, whose rules (serve speed, speed-up per brick, scoring) come from
// a JavaScript mod, assets/rules.js, run in a zinc:script sandbox. The mod sees only what the host exposes (log);
// a rule it does not define, or one that fails, falls back to the game's own.
//
//   zinc run examples/scripting/breakout-mods
import { onFrame } from 'zinc:gfx';
import { Script, ScriptError } from 'zinc:script';
import { Game, Rules, DefaultRules } from '../../../breakout/src/game/game';
import { readControls } from '../../../breakout/src/input';
import { draw } from '../../../breakout/src/render';

/** Does the mod export function `name`? */
function defines(vm: Script, name: string): boolean {
  const f = vm.fn(name);
  if (f === null) return false;
  f.release();
  return true;
}

/** Rules answered by the mod's exported functions. */
class ModRules implements Rules {
  vm: Script;
  base: DefaultRules = new DefaultRules();
  has: boolean[];
  constructor(vm: Script) {
    this.vm = vm;
    this.has = [defines(vm, 'serveSpeed'), defines(vm, 'speedUp'), defines(vm, 'points')];
  }
  /** A number from the mod, or `fallback` (logged once per failure). */
  ask(i: i32, fn: string, args: unknown[], fallback: number): number {
    if (!this.has[i]) return fallback;
    try {
      const v = this.vm.call(fn, args);
      if (typeof v === 'number') return v;
      console.log(`rules.js: ${fn} returned a ${typeof v}, using the default`);
    } catch (e) {
      console.log(`rules.js: ${e.message}${e instanceof ScriptError && e.line > 0 ? ` (line ${e.line})` : ''}`);
    }
    this.has[i] = false;
    return fallback;
  }
  serveSpeed(level: i32): number { return this.ask(0, 'serveSpeed', [level], this.base.serveSpeed(level)); }
  speedUp(speed: number): number { return this.ask(1, 'speedUp', [speed], this.base.speedUp(speed)); }
  points(base: i32, level: i32, combo: i32): i32 { return Math.round(this.ask(2, 'points', [base, level, combo], this.base.points(base, level, combo))); }
}

const game = new Game();
const vm = new Script({ memoryLimit: 1 << 20, timeLimitMs: 5 });
vm.expose('log', (msg: string) => { console.log('[mod]', msg); });
try {
  vm.loadAsset('rules.js');
  game.rules = new ModRules(vm);
} catch (e) {
  console.log(`rules.js not loaded, playing the default rules: ${e.message}`);
}

onFrame((dt: number) => {
  game.update(dt, readControls());
  draw(game);
});

// The controls: one small table says which inputs hold each action of the game (left flipper, right flipper,
// plunger, the three bumps, start). An input is "key:<name>" (a key of the keyboard, or of the encoder of a cabinet's
// buttons), "pad:<button>" (a button as zinc:gfx reports them: Up Down Left Right A B X Y L R Start Select) or
// "gamepad:<button>" (a button of any plugged gamepad by its place on the pad: South East West North LeftShoulder
// RightShoulder LeftTrigger RightTrigger Back Start LeftStick RightStick Up Down Left Right Guide) or "touch:<zone>" (left,
// right, plunger: zones of the table's view). A gamepad's d-pad, left stick, face buttons, shoulders, start and back are
// also the "pad:" buttons. A settings file replaces the inputs of the actions it names.
import { gamepadCount, gamepadButtons, isDown, Btn, keyCount, keyKind, keyName, KeyKind, touchCount, touchX, touchY, pointerDown, pointerX, pointerY } from 'zinc:gfx';
import { Controls } from './game';
import { keysOf } from './format/schema';

export const ACTIONS = ['left', 'right', 'plunger', 'nudgeLeft', 'nudgeRight', 'nudgeUp', 'start', 'nextTable'];
const PADS = ['Up', 'Down', 'Left', 'Right', 'A', 'B', 'X', 'Y', 'L', 'R', 'Start', 'Select'];
const GAMEPAD = ['South', 'East', 'West', 'North', 'LeftShoulder', 'RightShoulder', 'LeftTrigger', 'RightTrigger', 'Back', 'Start', 'LeftStick', 'RightStick',
  'Up', 'Down', 'Left', 'Right', 'Guide'];   // the order of zinc:gfx's GamepadButton

export class Bindings {
  /** The inputs of each action, in the order of ACTIONS. */
  inputs: string[][] = [
    ['key:z', 'key:arrowleft', 'pad:L', 'pad:Left', 'gamepad:LeftTrigger', 'touch:left'],
    ['key:/', 'key:arrowright', 'pad:R', 'pad:Right', 'gamepad:RightTrigger', 'touch:right'],
    ['key: ', 'key:arrowdown', 'pad:Down', 'gamepad:South', 'touch:plunger'],
    ['key:x', 'pad:X'],
    ['key:.', 'pad:Y'],
    ['key:arrowup', 'pad:Up'],
    ['key:enter', 'key:1', 'pad:Start'],
    ['key:tab', 'key:t', 'pad:Select'],
  ];

  /** Applies a settings file: { "controls": { "left": ["key:a", "pad:L"], ... } }. Returns '' or what is wrong with it. */
  apply(text: string): string {
    let s: any = null;
    try { s = JSON.parse(text); } catch (e) { return `the settings are not JSON: ${(e as Error).message}`; }
    if (s === null || typeof s !== 'object') return 'the settings must be an object';
    const c: any = s.controls;
    if (c === undefined) return '';
    if (c === null || typeof c !== 'object' || Array.isArray(c)) return 'controls: must be an object of actions';
    for (const name of keysOf(c)) if (ACTIONS.indexOf(name) < 0) return `controls.${name}: is no action (${ACTIONS.join(' ')})`;
    for (let a = 0; a < ACTIONS.length; a++) {
      const list: any = c[ACTIONS[a]];
      if (list === undefined) continue;
      if (!Array.isArray(list)) return `controls.${ACTIONS[a]}: must be a list of inputs`;
      const inputs: string[] = [];
      for (let i = 0; i < list.length; i++) {
        const v: any = list[i];
        if (typeof v !== 'string') return `controls.${ACTIONS[a]}[${i}]: must be a text like "key:z", "pad:L", "gamepad:LeftTrigger" or "touch:left"`;
        const input: string = v;
        const ok = input.startsWith('key:') ? input.length > 4 : input.startsWith('pad:') ? PADS.indexOf(input.slice(4)) >= 0
          : input.startsWith('gamepad:') ? GAMEPAD.indexOf(input.slice(8)) >= 0
          : input === 'touch:left' || input === 'touch:right' || input === 'touch:plunger';
        if (!ok) return `controls.${ACTIONS[a]}[${i}]: "${input}" is no input (key:<name>, pad:${PADS.join(' ')}, gamepad:${GAMEPAD.join(' ')}, touch:left right plunger)`;
        inputs.push(input.startsWith('key:') ? input.toLowerCase() : input);
      }
      this.inputs[a] = inputs;
    }
    return '';
  }
}

const held = new Map<string, boolean>();
let nextButton = false;
/** The player asked for the next table this frame (the list of the tables, chooser.ts): a key struck, or a button newly held. */
export let nextTable = false;

/** Reads the inputs of this frame into `c`. The touch zones are those of the table's view: its box in the window. */
export function readControls(c: Controls, b: Bindings, vx: number, vy: number, vw: number, vh: number): void {
  const struck: string[] = [];   // the keys that went down this frame
  for (let i: i32 = 0; i < keyCount(); i++) {
    const kind = keyKind(i);
    if (kind === KeyKind.Text || kind === KeyKind.Repeat) continue;
    held.set(keyName(i).toLowerCase(), kind === KeyKind.Down);
    if (kind === KeyKind.Down) struck.push(keyName(i).toLowerCase());
  }
  // touch: every finger counts; the mouse is one finger. Left and right halves of the table, the plunger's corner
  let left = false, right = false, plunger = false;
  const n = touchCount();
  for (let i: i32 = 0; i <= n; i++) {
    let x = 0, y = 0;
    if (i < n) { x = touchX(i); y = touchY(i); } else if (n === 0 && pointerDown()) { x = pointerX(); y = pointerY(); } else continue;
    if (x < vx || x >= vx + vw || y < vy || y >= vy + vh) continue;
    if (x > vx + vw * 0.8 && y > vy + vh * 0.7) plunger = true;
    else if (x < vx + vw / 2) left = true;
    else right = true;
  }
  let gamepads: i32 = 0;   // the buttons held on the gamepads, all of them together
  for (let i: i32 = 0; i < gamepadCount(); i++) gamepads |= gamepadButtons(i);
  const on = (inputs: string[]): boolean => {
    for (const input of inputs) {
      if (input.startsWith('key:')) { if (held.get(input.slice(4)) === true) return true; }
      else if (input.startsWith('pad:')) { if (isDown(PADS.indexOf(input.slice(4)) as Btn)) return true; }
      else if (input.startsWith('gamepad:')) { if ((gamepads >> GAMEPAD.indexOf(input.slice(8)) & 1) !== 0) return true; }
      else if (input === 'touch:left' ? left : input === 'touch:right' ? right : plunger) return true;
    }
    return false;
  };
  c.left = on(b.inputs[0]); c.right = on(b.inputs[1]); c.plunger = on(b.inputs[2]);
  c.nudgeLeft = on(b.inputs[3]); c.nudgeRight = on(b.inputs[4]); c.nudgeUp = on(b.inputs[5]); c.start = on(b.inputs[6]);
  let key = false, button = false;
  for (const input of b.inputs[7]) {
    if (input.startsWith('key:')) { if (struck.indexOf(input.slice(4)) >= 0) key = true; }
    else if (on([input])) button = true;
  }
  nextTable = key || (button && !nextButton);
  nextButton = button;
}

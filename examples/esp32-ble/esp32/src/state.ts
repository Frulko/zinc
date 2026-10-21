// The link and the conversation. The Mac's messages are shown and answered; "led on" and "led off" drive the LED on GPIO 26.
import { Link } from 'zinc:ble';
import { setup, write } from 'zinc:gpio';
import { LED_PIN, MAX_LINES } from './constants';

export class Line {
  text: string;
  mine: boolean;
  constructor(text: string, mine: boolean) { this.text = text; this.mine = mine; }
}
export class State {
  name: string = '';
  link: Link | null = null;
  peer: string = '';
  lines: Line[] = [];
  presses: i32 = 0;
  dirty: boolean = true;
}
export const state = new State();

function add(text: string, mine: boolean): void {
  state.lines.push(new Line(text, mine));
  if (state.lines.length > MAX_LINES) state.lines.shift();
  state.dirty = true;
}

export function say(text: string): void {
  const l = state.link;
  if (l === null) return;
  l.send(text);
  add(text, true);
}

export function opened(l: Link): void {
  state.link = l;
  state.peer = l.id;
  console.log('ble: connected to ' + l.id);
  add('connected', false);
  say('hello from ' + state.name);
}

export function received(l: Link, text: string): void {
  console.log('ble: received ' + JSON.stringify(text));
  add(text, false);
  const t = text.trim().toLowerCase();
  if (t === 'led on' || t === 'led off') {
    write(LED_PIN, t === 'led on' ? 1 : 0);
    say('the LED is ' + (t === 'led on' ? 'on' : 'off'));
  } else say('got ' + text.length + ' characters');
}

export function closed(l: Link): void {
  console.log('ble: closed');
  state.link = null;
  add('closed', false);
}

export function initLed(): void {
  setup(LED_PIN, 'out', 'none');
  write(LED_PIN, 0);
}

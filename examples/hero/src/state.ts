// Hero state: the animation clock, the last menu choice and a fading highlight after each click.
import { createSignal } from 'zinc:ui/solid';

export const MENU: string[] = ['Play', 'Gallery', 'Settings', 'Credits'];

/** Seconds since start: every entrance animation is a function of it. */
export const [time, setTime] = createSignal<number>(0);
export const [selected, setSelected] = createSignal<string>('');
/** 1 right after a click, fading to 0 in half a second. */
export const [pulse, setPulse] = createSignal<number>(0);

export function choose(label: string): void {
  setSelected(label);
  setPulse(1);
}

/** Advances the clock and the pulse; called once per frame. */
export function tick(dt: number): void {
  setTime(time() + dt);
  if (pulse() > 0) setPulse(Math.max(0, pulse() - dt * 2));
}

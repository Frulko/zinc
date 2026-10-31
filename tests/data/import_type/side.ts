// A module with side effects and code that draws: a program that reads only its types runs none of it.
import { clear } from 'zinc:gfx';
console.log('side.ts ran');
export interface Song { title: string; plays: i32 }
export type Title = string;
export enum Mood { Calm, Loud }
export class Point { x: number = 0; }
export class Player {
  private vol: number = 1;
  pos = new Point();   // typed by the class it constructs (zinc:leapmotion's Hand.palm)
  play(): void { clear(0); }
  // no return type: the shape of a setter and of a method that returns nothing is void (zinc:audio's Sound)
  get volume(): number { return this.vol; }
  set volume(v: number) { if (v >= 0) this.vol = v; }
  mute() { this.vol = 0; }
}
export function draw(): void { clear(0); }

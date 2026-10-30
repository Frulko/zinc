// A module with side effects and code that draws: a program that reads only its types runs none of it.
import { clear } from 'zinc:gfx';
console.log('side.ts ran');
export interface Song { title: string; plays: i32 }
export type Title = string;
export enum Mood { Calm, Loud }
export class Player { play(): void { clear(0); } }
export function draw(): void { clear(0); }

// What the panel (src/panel.ts) changes, and the actions that change it: the clock, the haze, the triangle budget, the shadows, the readout,
// the stereo picture, the tour or free flight, a flight to a point of interest. No drawing here; `version` counts the changes, so the panel
// knows when to draw again.
import { Scene, Fog, Defaults3D } from 'zinc:3d';
import { platform } from 'zinc:sys';
import { setStereo, stereoDepth } from 'zinc:hardware';
import { City } from './city';
import { Flight } from './flight';
import { Hud } from './hud';
import { PLACES } from './places';
import { CLOCK_RATE, FAR_PLANE } from './constants';

/** The hours of the clock's three buttons: noon, the dusk of late October (the sun sets at 16:50), and the night. */
export const HOURS: number[] = [12, 17, 21];
export const HAZE_NAMES: string[] = ['Off', 'Near', 'Normal', 'Far'];
const HAZE_SCALE: number[] = [0, 0.6, 1, 1.5];
export const BUDGET_NAMES: string[] = ['Low', 'Device', 'High'];
const BUDGET_SCALE: number[] = [0.5, 1, 2];

export class Settings {
  /** 0 off, 1 near, 2 the device's (normal), 3 far. */
  haze: i32 = 2;
  /** 0 half the device's, 1 the device's, 2 twice. */
  budget: i32 = 1;
  clockRuns = true;
  shadows = true;
  stereo = false;
  /** Shown on the panel: the budget in triangles. */
  budgetText = '';
  /** The 3DS and the PSP draw shadows (zinc:3d World.shadows); the 3DS has a 3D screen. */
  readonly canShadow: boolean = platform() === 'n3ds' || platform() === 'psp';
  readonly canStereo: boolean = stereoDepth() >= 0;
  version: i32 = 0;

  constructor(private dev: Defaults3D, private city: City, private scene: Scene, private flight: Flight, private hud: Hud) {
    this.budgetText = `Device: ${dev.budget}`;
  }

  setHour(k: i32): void { this.flight.hour = HOURS[k]; this.version++; }
  toggleClock(): void { this.clockRuns = !this.clockRuns; this.flight.rate = this.clockRuns ? CLOCK_RATE : 0; this.version++; }

  cycleHaze(): void {
    this.haze = (this.haze + 1) % 4;
    const k = HAZE_SCALE[this.haze];
    this.scene.fog = k === 0 ? null : new Fog(this.scene.background, this.dev.fogStart * k, Math.min(this.dev.fogEnd * k, FAR_PLANE * 0.97));
    this.version++;
  }

  cycleBudget(): void {
    this.budget = (this.budget + 1) % 3;
    const b: i32 = Math.round(this.dev.budget * BUDGET_SCALE[this.budget]);
    this.city.world.budget = b;
    this.budgetText = `${BUDGET_NAMES[this.budget]}: ${b}`;
    this.version++;
  }

  toggleShadows(): void { this.shadows = !this.shadows; this.city.setShadows(this.shadows); this.version++; }
  toggleReadout(): void { this.hud.visible = !this.hud.visible; this.version++; }
  toggleStereo(): void { this.stereo = !this.stereo; setStereo(this.stereo); this.version++; }
  setTour(on: boolean): void { this.flight.setTour(on); this.version++; }
  goTo(k: i32): void { this.flight.goTo(PLACES[k]); this.version++; }
}

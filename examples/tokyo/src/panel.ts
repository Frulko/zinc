// The control panel, one zinc:stage node of 320 x 240 with three pages: Places (a map of Shiba with the eye on it, a button per point of
// interest: the eye flies there), Settings (the clock, the haze, the triangle budget, the shadows, the readout, the stereo picture) and
// Controls (the tour or free flight, the buttons). On the 3DS it is the touch screen, drawn only when something it shows has changed; on the
// other devices an overlay that SELECT (Tab on a desktop) opens, driven by the d-pad and A, or the mouse.
import { rrect, rect, line, border, drawText, drawImage, font, textWidth, imageFromPixels } from 'zinc:gfx';
import { platform } from 'zinc:sys';
import { Sprite, registerTapZone, findTopmostZoneAt, uiState } from 'zinc:stage';
import { Settings, HAZE_NAMES, HOURS } from './settings';
import { Flight } from './flight';
import { City } from './city';
import { Hud } from './hud';
import { PLACES } from './places';
import { PANEL_W, PANEL_H, PANEL_BG, PANEL_BUTTON, PANEL_ON, PANEL_FOCUS, PANEL_TEXT, PANEL_DIM, TOWER_RED, MAP_X0, MAP_Z0, MAP_METRES,
  MAP_W, MAP_H } from './constants';

const BOLD = font('sans-bold', 12);
const SMALL = font('sans', 11);

// what a button does: the three pages, a place each, then the settings and the flight
const TAB: i32 = 0, PLACE: i32 = 3, DAY: i32 = 10, CLOCK: i32 = 13, HAZE: i32 = 14, BUDGET: i32 = 15, SHADOWS: i32 = 16, READOUT: i32 = 17,
  STEREO: i32 = 18, TOUR: i32 = 19, FREE: i32 = 20, ACTIONS: i32 = 21;
const TABS: string[] = ['Places', 'Settings', 'Controls'];
const TIMES: string[] = ['Day', 'Dusk', 'Night'];
const ROW_X = 104, ROW_W = 208, ROW_H = 24, ROW_STEP = 28, TOP = 36;

const KEYBOARD: string[] = ['Arrows: fly ahead and turn', 'V / Space: look up / down', 'E / Q: climb / descend', 'C: faster',
  'X: turn the clock', 'Return: the tour on or off', 'Tab: this panel (or the mouse)'];
const PSP: string[] = ['Stick, d-pad: fly ahead and turn', 'Triangle / Cross: look up / down', 'R / L: climb / descend', 'Square: faster',
  'Circle: turn the clock', 'Start: the tour on or off', 'Select: this panel (d-pad, Cross)'];
const VITA: string[] = ['Left stick, d-pad: fly ahead and turn', 'Right stick: look around', 'Triangle / Cross: look up / down',
  'R / L: climb / descend', 'Square: faster, Circle: the clock', 'Start: the tour on or off', 'Select: this panel (d-pad, Cross)'];
const N3DS: string[] = ['Circle pad, d-pad: fly ahead and turn', 'Y / A: look up / down', 'R / L: climb / descend', 'X: faster',
  'B: turn the clock', 'Start: the tour on or off', 'Select: the readout'];

export class Panel extends Sprite {
  /** Open (the 3DS: always). */
  shown: boolean;
  private page: i32 = 0;
  private focus: i32 = 0;   // the button the d-pad is on, in the page's list
  private readonly pages: i32[][] = [[], [], []];
  private readonly taps: (() => void)[] = [];
  private readonly ids: string[] = [];
  private readonly keys: string[];
  private map: i32 = -1;
  private readonly seen: i32[] = [-1, -1, -1, -1, -1];   // what the last drawing showed, as numbers: it draws again when one changes

  constructor(private settings: Settings, private flight: Flight, private city: City, private hud: Hud, private touch: boolean) {
    super('panel');
    this.width = PANEL_W; this.height = PANEL_H;
    this.shown = touch;
    for (let a: i32 = 0; a < ACTIONS; a++) { this.taps.push(this.tapper(a)); this.ids.push(`tokyo-${a}`); }
    for (let p: i32 = 0; p < 3; p++) for (let t: i32 = 0; t < 3; t++) this.pages[p].push(TAB + t);
    for (let k: i32 = 0; k < PLACES.length; k++) this.pages[0].push(PLACE + k);
    const s = this.pages[1];
    s.push(DAY); s.push(DAY + 1); s.push(DAY + 2); s.push(CLOCK); s.push(HAZE); s.push(BUDGET);
    if (settings.canShadow) s.push(SHADOWS);
    s.push(READOUT);
    if (settings.canStereo) s.push(STEREO);
    this.pages[2].push(TOUR); this.pages[2].push(FREE);
    const p = platform();
    this.keys = p === 'n3ds' ? N3DS : p === 'psp' ? PSP : p === 'vita' ? VITA : KEYBOARD;
  }

  private tapper(a: i32): () => void { return (): void => this.act(a); }

  /** The map picture, from the city's heights: made from the main window's frame (a picture is not made inside another window's). */
  prepare(): void { if (this.map < 0) this.map = imageFromPixels(this.city.mapPixels(MAP_X0, MAP_Z0, MAP_METRES, MAP_W, MAP_H), MAP_W, MAP_H); }

  /** The pad, while the overlay is open: up or left the button before, down or right the next one, A presses it. */
  navigate(step: i32, press: boolean): void {
    const list = this.pages[this.page];
    if (step !== 0) this.focus = (this.focus + step + list.length) % list.length;
    if (press) this.act(list[this.focus]);
  }

  /** Presses the button under (x, y) of the panel; false when there is none (ZINC_TOKYO_TAP, the scripted runs of the consoles). */
  tapAt(x: number, y: number): boolean {
    const st = this.stage;   // the zones are in the window's pixels, the panel at the stage's corner
    const z = st === null ? null : findTopmostZoneAt(st.x + x, st.y + y, true);
    if (z === null || z.onTapCallback === null) return false;
    (z.onTapCallback as () => void)();
    return true;
  }

  private act(a: i32): void {
    const s = this.settings;
    if (a < PLACE) { this.page = a - TAB; this.focus = a - TAB; }
    else if (a < DAY) s.goTo(a - PLACE);
    else if (a < CLOCK) s.setHour(a - DAY);
    else if (a === CLOCK) s.toggleClock();
    else if (a === HAZE) s.cycleHaze();
    else if (a === BUDGET) s.cycleBudget();
    else if (a === SHADOWS) s.toggleShadows();
    else if (a === READOUT) s.toggleReadout();
    else if (a === STEREO) s.toggleStereo();
    else s.setTour(a === TOUR);
    uiState.dirty = true;
  }

  /** Draws again only when what it shows has changed: the settings, the page, the focus, the mode, the eye's pixel on the map. */
  override onUpdate(_dt: number): void {
    const f = this.flight, map = this.page === 0;
    this.see(0, this.settings.version);
    this.see(1, (f.touring ? 1 : 0) | (this.hud.visible ? 2 : 0) | (this.page << 2) | (this.focus << 4));
    this.see(2, map ? Math.floor((f.eye[0] - MAP_X0) / MAP_METRES) : 0);
    this.see(3, map ? Math.floor((f.eye[2] - MAP_Z0) / MAP_METRES) : 0);
    this.see(4, map ? Math.round(Math.atan2(f.look[2], f.look[0]) * 8 / Math.PI) & 15 : 0);
  }
  private see(k: i32, v: i32): void { if (this.seen[k] !== v) { this.seen[k] = v; uiState.dirty = true; } }

  override onDraw(_w: number, _h: number): void {
    rrect(0, 0, PANEL_W, PANEL_H, 8, PANEL_BG, this.touch ? 255 : 230);
    for (let t: i32 = 0; t < 3; t++) this.button(TAB + t, 6 + t * 104, 6, 100, 24, TABS[t], this.page === t);
    if (this.page === 0) this.places();
    else if (this.page === 1) this.settingsPage();
    else this.controls();
  }

  private places(): void {
    const mx = 8, my = TOP;
    if (this.map >= 0) drawImage(this.map, mx, my, MAP_W, MAP_H, 255, 0);
    border(mx, my, MAP_W, MAP_H, 0, 1, PANEL_DIM, 255);
    for (let k: i32 = 0; k < PLACES.length; k++) {
      const p = PLACES[k];
      rect(mx + (p.x - MAP_X0) / MAP_METRES - 2, my + (p.z - MAP_Z0) / MAP_METRES - 2, 4, 4, k === 0 ? TOWER_RED : PANEL_FOCUS);
    }
    const f = this.flight;
    const ex = Math.max(0, Math.min(MAP_W - 1, (f.eye[0] - MAP_X0) / MAP_METRES)), ez = Math.max(0, Math.min(MAP_H - 1, (f.eye[2] - MAP_Z0) / MAP_METRES));
    const l = Math.sqrt(f.look[0] * f.look[0] + f.look[2] * f.look[2]) || 1;
    line(mx + ex, my + ez, mx + ex + f.look[0] / l * 10, my + ez + f.look[2] / l * 10, PANEL_TEXT);
    rect(mx + ex - 2, my + ez - 2, 5, 5, PANEL_TEXT);
    drawText(BOLD, mx, my + MAP_H + 8, f.touring ? 'Guided tour' : 'Free flight', PANEL_TEXT, 255, 0);
    drawText(SMALL, mx, my + MAP_H + 26, 'Touch a place:', PANEL_DIM, 255, 0);
    drawText(SMALL, mx, my + MAP_H + 40, 'the eye flies there.', PANEL_DIM, 255, 0);
    for (let k: i32 = 0; k < PLACES.length; k++) this.button(PLACE + k, 144, TOP + k * 28, 168, 25, PLACES[k].name, false);
  }

  private settingsPage(): void {
    const s = this.settings;
    let y = TOP;
    this.label('Time', y);
    for (let k: i32 = 0; k < 3; k++) this.button(DAY + k, ROW_X + k * 70, y, 68, ROW_H, TIMES[k], Math.abs(this.flight.hour - HOURS[k]) < 0.5);
    y += ROW_STEP;
    this.label('Clock', y); this.button(CLOCK, ROW_X, y, ROW_W, ROW_H, s.clockRuns ? 'Running' : 'Stopped', s.clockRuns); y += ROW_STEP;
    this.label('Haze', y); this.button(HAZE, ROW_X, y, ROW_W, ROW_H, HAZE_NAMES[s.haze], s.haze > 0); y += ROW_STEP;
    this.label('Triangles', y); this.button(BUDGET, ROW_X, y, ROW_W, ROW_H, s.budgetText, false); y += ROW_STEP;
    if (s.canShadow) { this.label('Shadows', y); this.button(SHADOWS, ROW_X, y, ROW_W, ROW_H, s.shadows ? 'On' : 'Off', s.shadows); y += ROW_STEP; }
    this.label('Readout', y); this.button(READOUT, ROW_X, y, ROW_W, ROW_H, this.hud.visible ? 'On' : 'Off', this.hud.visible); y += ROW_STEP;
    if (s.canStereo) { this.label('Stereo 3D', y); this.button(STEREO, ROW_X, y, ROW_W, ROW_H, s.stereo ? 'On' : 'Off', s.stereo); }
  }

  private controls(): void {
    const touring = this.flight.touring;
    this.button(TOUR, 8, TOP, 148, 26, 'Guided tour', touring);
    this.button(FREE, 164, TOP, 148, 26, 'Free flight', !touring);
    for (let k: i32 = 0; k < this.keys.length; k++) drawText(SMALL, 12, TOP + 38 + k * 18, this.keys[k], PANEL_DIM, 255, 0);
  }

  private label(text: string, y: number): void { drawText(SMALL, 12, y + 6, text, PANEL_DIM, 255, 0); }

  private button(a: i32, x: number, y: number, w: number, h: number, text: string, on: boolean): void {
    rrect(x, y, w, h, 6, on ? PANEL_ON : PANEL_BUTTON, 255);
    if (!this.touch && this.pages[this.page][this.focus] === a) border(x, y, w, h, 6, 2, PANEL_FOCUS, 255);
    drawText(BOLD, x + (w - textWidth(BOLD, text, 0)) / 2, y + (h - 13) / 2, text, PANEL_TEXT, 255, 0);
    registerTapZone(this.ids[a], x, y, w, h, this.taps[a]);
  }
}

import { width, height } from 'zinc:gfx';
import { TOOL_NONE } from '../constants';
import { TerrainParams } from '../gen/terrain';

// What the interface itself remembers (the game state is `world`): the tool in hand, the speed, which windows are open. Nothing here is simulation.
export const WIN_NONE = 0, WIN_MENU = 3, WIN_OPTIONS = 4, WIN_MAIN = 5, WIN_SAVES = 6, WIN_NEW = 7, WIN_END = 10;
export const SPEEDS: number[] = [.5, 1, 2, 4];
export const ui = {
  tool: TOOL_NONE as number,
  speed: 1,                 // index in SPEEDS
  category: -1,             // the open build flyout (index of categories()), -1 none
  collapsed: false,         // the control column folded to a handle
  window: WIN_NONE,         // the modal dialog (menu, slots, new game, the ending); the windows below stack, any number open
  info: false, advisors: false, campaign: false,
  guide: true,              // the guided start card (dismissed for good, saved with the options)
  overlay: 0,
  overlayMenu: false,               // index of the overlay on the map (0: none)
  selKind: 0,               // 1 a building, 2 a person
  selId: -1,
  advisor: 0,               // tab of the advisor window
  time: 0,                  // seconds of real time, for blinking and flashes
  back: 0,                  // the window a sub-menu returns to
  editing: false,           // typing in a text field (keys go to the field)
};
export const TOP_H = 34, STATUS_H = 26, COL_W = 188, COL_FOLDED = 20;
/** The part of the window the map lives in: below the top bar, left of the column, above the status strip. */
export function viewport(): { x: number; y: number; w: number; h: number } {
  const cw = ui.collapsed ? COL_FOLDED : COL_W;
  return { x: 0, y: TOP_H, w: width() - cw, h: height() - TOP_H - STATUS_H };
}
export function columnX(): number { return width() - (ui.collapsed ? COL_FOLDED : COL_W); }
/** Where the map is on screen (set by the scene each frame): buffer pixel (sx, sy) is at x + (sx - cropX) * scale. */
export const mapView = { x: 0, y: 0, scale: 1, cropX: 0, cropY: 0 };
/** What the scene lets the interface do (set once by the scene). */
export const act = {
  setTool: (tool: number): void => {},
  say: (text: string): void => {},
  jump: (x: number, y: number): void => {},
  togglePause: (): void => {},
  setSpeed: (i: number): void => {},
  rebake: (): void => {},
  newVillage: (seed: number, size: number, campaign: boolean, risks: boolean, params: TerrainParams): void => {},
  save: (): void => {},
  quit: (): void => {},
  loaded: (): void => {},
};

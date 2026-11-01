import { TREE_MIN, TREE_REGROW, DEER_MIN, DEER_RESPAWN } from './constants';

// Live settings: the panel (ui/SettingsPanel.ts) edits these while the game runs, the game reads them every frame or step.
// Constants stay the defaults; nothing here is saved yet (a later step may persist it next to the village).
export const MINIMAP_OFF = 0;
export const MINIMAP_CORNERS: string[] = ['Off', 'Haut gauche', 'Haut droite', 'Bas droite', 'Bas gauche', 'Centre'];
export const MINIMAP_SIZES: string[] = ['1 px', '2 px', '3 px', '4 px', '6 px', '8 px', 'Ultra'];
export const MINIMAP_CELLS: number[] = [1, 2, 3, 4, 6, 8, 0];      // pixels per tile on screen; 0 = as big as the window allows ("ultra pixel")
export const LOD_MODES: string[] = ['Net (recalculé)', 'Fixe (agrandi)'];

export const RESAMPLE_MODES: string[] = ['Pixels (plus proche)', 'Lissé (moyenne)'];

export interface Settings {
  simSpeed: number;         // game seconds per real second
  animFps: number;          // poses per second of the village picture
  wind: number;             // speed of the grass and water glints
  shadows: boolean;
  atlas: boolean;           // people and deer are stamped from baked frames (off: every bone is drawn live, slower)
  edges: boolean;           // the dark and warm outlines drawn from depth
  walkSpeed: number;        // multiplier on people's walking speed
  treeMin: number;          // no-limit mode: below this many trees (on a 12 x 12 map; scaled by area) one grows back
  treeRegrow: number;       // seconds between two new trees
  deerMin: number;
  deerRespawn: number;
  lod: number;              // index in LOD_MODES, zooming in only: 0 the art is lit again at each zoom level (sharp); 1 the normal-level art is enlarged (zooming out never resizes: it shows a wider window)
  resample: number;         // index in RESAMPLE_MODES: how the fixed-detail models are resized (nearest pixel, or averaged so edges keep their quality)
  pauseOnMove: boolean;     // the game and its animations stand still while the camera moves or zooms (and a moment after), so the view scrolls smoothly
  edgePan: boolean;         // the camera scrolls when the pointer touches the window's edge
  minimapCorner: number;    // index in MINIMAP_CORNERS
  minimapSize: number;      // index in MINIMAP_SIZES
  minimapUnits: boolean;    // people and deer as dots
}

export const settings: Settings = {
  simSpeed: 1, animFps: 24, wind: 1, shadows: true, atlas: true, edges: true, walkSpeed: 1,
  treeMin: TREE_MIN, treeRegrow: TREE_REGROW, deerMin: DEER_MIN, deerRespawn: DEER_RESPAWN,
  lod: 0, resample: 1, pauseOnMove: true, edgePan: true, minimapCorner: 3, minimapSize: 2, minimapUnits: true,
};

// Sizes, depths and colours of Nova Patrol DS: every literal used twice.
import { TABLE_W, TABLE_L } from '../../pinball/src/table/layout';

export const TOP_W: i32 = 400, TOP_H: i32 = 240, BOTTOM_W: i32 = 320, BOTTOM_H: i32 = 240;
/** The table is cut in two at its middle: the upper half on the top screen, the lower half (flippers, plunger) on the bottom one. */
export const SPLIT: number = TABLE_L / 2;
/** Pixels per table inch: half the table's length fills a screen's 240 lines. */
export const K: number = TOP_H / SPLIT;
/** The camera looks straight down from this high (in): things above the playfield (ramps, the ball riding them) come a little closer. */
export const EYE_HEIGHT: number = 160;
export const CENTER_X: number = TABLE_W / 2;
/** Each screen's side panels, beside the cabinet (a little wider than the table). */
export const TOP_PANEL_W: number = Math.floor((TOP_W - (TABLE_W + 2.2) * K) / 2);
export const BOTTOM_PANEL_W: number = Math.floor((BOTTOM_W - (TABLE_W + 2.2) * K) / 2);

// Depths on the top screen, in pixels of parallax at full slider (> 0: in front of the screen).
export const STEREO_STEPS: i32 = 4; // five slider strengths, mono plus four cached views per eye
export const DEPTH_CAP = 3;          // the pop bumpers' caps
export const DEPTH_PER_INCH = 1.6;   // a ball riding a ramp, per inch above the playfield
export const DEPTH_POPUP = 5;        // the score popups
export const DEPTH_BAND = 6;         // the message band

export const INK: u32 = 0x07111f, PANEL: u32 = 0x0b1c2d, WHITE: u32 = 0xffffff, DIM: u32 = 0xa9bbcc, CYAN: u32 = 0x3fe7ff,
  GOLD: u32 = 0xffd23f, PINK: u32 = 0xff4fa3, RED: u32 = 0xff3b3b, GREEN: u32 = 0x5cff8a;
export const BUMPER_COLORS: u32[] = [0xff3b8a, 0x3fe7ff, 0xffb13b];

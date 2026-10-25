// Colours, sizes and depths of Meadow Run 3D: every literal used twice.
import { ImageFlag } from 'zinc:gfx';

export const SKY: u32 = 0xdff6f5, INK: u32 = 0x2b2d42, WHITE: u32 = 0xffffff, GOLD: u32 = 0xffcd75, RED: u32 = 0xef7d57,
  GREEN: u32 = 0x7ff0a5, DIM: u32 = 0x8b8fa8, PANEL: u32 = 0x3a3d56, EARTH: u32 = 0x9e5b3c, CLOUD_C: u32 = 0xffffff, SPIKE_C: u32 = 0xd94f4f;
export const PIXEL = ImageFlag.Nearest as i32, MIRROR = ImageFlag.FlipX as i32;
export const HURT_TINT: u32 = 0xff7070;

// the bottom screen
export const BOTTOM_W: i32 = 320, BOTTOM_H: i32 = 240;
export const MAP_X = 10, MAP_Y = 44, MAP_W: i32 = 300, MAP_H: i32 = 70;   // the level's map (120 x 28 cells at 2.5 px)

// Depths on the top screen, in pixels of shift between the eyes at full slider: > 0 in front of the screen, < 0 behind it.
export const DEPTH_FAR = -5;     // the far layer (hills, clouds of the background)
export const DEPTH_COINS = 2;    // the coins float a little out of the screen
export const DEPTH_TEXT = 6;     // the title and the messages

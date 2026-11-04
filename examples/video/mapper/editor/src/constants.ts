// Shared names and limits of the editor.
export const SEND_INTERVAL_MS = 33;      // commands are coalesced and sent 30 times a second
export const SETTLE_MS = 80;             // queued commands land before a state is read back
export const HIT_RADIUS = 14;            // pixels around a point that catch it
export const CURVE_STEPS = 24;           // segments of a warped line
export const MAX_MASK_VALUES = 66;       // 32 points, after the feather and the invert
export const ADDRESS_KEY = 'mapper-address';

export const BACKGROUND: u32 = 0x111418;
export const CANVAS_BLACK: u32 = 0x000000;
export const SURFACE_BLACK: u32 = 0x0b0d10;
export const GRID_LINE: u32 = 0x222a33;
export const ACCENT: u32 = 0xffb020;
export const LINKED_POINT: u32 = 0x3cff78;
export const OTHER_CORNER: u32 = 0x8a94a2;
export const SELECTED_POINT: u32 = 0xffffff;
export const CROP_LINE: u32 = 0x8a94a2;
export const EDGE_BLEND: u32 = 0x508cff;
export const MASK_SHOW: u32 = 0x3cff78;
export const MASK_HIDE: u32 = 0xff3c3c;
export const EDGE_INSIDE: i32 = 0, EDGE_OUTSIDE: i32 = 1;   // /layer/n/edgedir; 2 fades across the edge

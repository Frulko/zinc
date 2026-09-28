// Effect budget for the Raspberry Pi (single-core software rasterizer on a Pi 1): fewer sparks, no motion trail, no
// glow halos (each is a large translucent shape to blend again whenever it changes). The baked table art is the same.

export const MAX_SPARKS: i32 = 12;
export const TRAIL: i32 = 0;
export const GLOW: boolean = false;

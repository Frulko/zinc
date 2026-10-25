// Colours, sizes and depths of Starfall: every literal used twice.
export const TOP_W: i32 = 400, TOP_H: i32 = 240, BOTTOM_W: i32 = 320, BOTTOM_H: i32 = 240;
/** The field's column on the top screen starts here (the bottom screen is the column itself, as on the console the screens line up). */
export const TOP_X = 40;

export const NIGHT: u32 = 0x0b1030, DEEP: u32 = 0x070a22, WHITE: u32 = 0xffffff, DIM: u32 = 0x8f97c0, CYAN: u32 = 0x3fe7ff,
  GOLD: u32 = 0xffd23f, RED: u32 = 0xff5a4a, GREEN: u32 = 0x5cff8a, SIDE: u32 = 0x10163f;

// Depths on the top screen, in pixels of parallax at full slider (> 0: in front of the screen).
export const DEPTH_FAR = -6;        // the far stars
export const DEPTH_SKY = -3;        // the constellation
export const DEPTH_RISING = 4;      // a star thrown back up comes out of the screen
export const DEPTH_TITLE = 6;

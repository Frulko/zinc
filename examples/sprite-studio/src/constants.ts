// Every literal of the studio used more than once: sprite size, window sizes and places, colours, limits.

/** The sprite is SPRITE_SIZE x SPRITE_SIZE pixels; each pixel holds a palette index, 0 being transparent. */
export const SPRITE_SIZE: i32 = 32;
export const TRANSPARENT: i32 = 0;
/** How many screen points a sprite pixel takes on the canvas. */
export const ZOOM: i32 = 14;
export const MAX_FRAMES: i32 = 16;
export const UNDO_LIMIT: i32 = 100;
export const BRUSH_SIZES: i32[] = [1, 2, 3];
export const FPS_CHOICES: i32[] = [4, 6, 8, 12, 24];

export const TOOL_PENCIL = 'pencil', TOOL_ERASER = 'eraser', TOOL_FILL = 'fill', TOOL_PICKER = 'picker';
export const TOOLS: string[] = [TOOL_PENCIL, TOOL_ERASER, TOOL_FILL, TOOL_PICKER];
export const TOOL_LABELS: string[] = ['Pencil (B)', 'Eraser (E)', 'Fill (G)', 'Picker (I)'];

/** The file the studio saves to and loads from, in the app's folder (SPRITE_STUDIO_FILE moves it, as the test does). */
export const SAVE_FILE = 'sprite.json';

// windows: the canvas in the middle, the tools on its left, the preview on its right
export const CANVAS_W: i32 = 560, CANVAS_H: i32 = 600;
export const TOOLS_W: i32 = 260, TOOLS_H: i32 = 660;
export const PREVIEW_W: i32 = 520, PREVIEW_H: i32 = 290;
export const WINDOW_GAP: i32 = 12;
/** The screen used to place the windows when the system cannot say (headless runs). */
export const FALLBACK_SCREEN_W: i32 = 1440, FALLBACK_TOP: i32 = 80;

export const COLOR_BACKGROUND: i32 = 0x1d2027;
export const COLOR_PANEL: i32 = 0x262a33;
export const COLOR_GRID: u32 = 0x31353f;
export const COLOR_CHECK_LIGHT: u32 = 0x3a3f4a, COLOR_CHECK_DARK: u32 = 0x30343e;
export const COLOR_ONION: u32 = 0x9aa4b8;
export const COLOR_PREVIEW_BG: u32 = 0x15171c, COLOR_PREVIEW_VIEW: u32 = 0x2b303a, COLOR_PREVIEW_TEXT: u32 = 0xc9d1dc;

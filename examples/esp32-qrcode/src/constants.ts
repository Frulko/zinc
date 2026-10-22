// The texts, layout and colours of the demo.
import { wifiText } from 'zinc:qrcode';

/** What the codes say: a phone's camera opens the link, joins the network or shows the text. */
export const TEXTS: string[] = [
  'https://github.com/nayuki/QR-Code-generator',
  wifiText('zinc-setup', ''),
  'Hello from Zinc: this code was made on the board, in C, called from TypeScript.',
];
export const LABELS: string[] = ['a link', 'join a Wi-Fi network', 'a text'];

/** The code's area: a square under the title, with the quiet zone (4 modules of white) the standard asks for. */
export const AREA_X: i32 = 20;
export const AREA_Y: i32 = 52;
export const AREA_SIZE: i32 = 200;

export const COLOR_BACKGROUND: u32 = 0x101820;
export const COLOR_TEXT: u32 = 0xe8eef4;
export const COLOR_MUTED: u32 = 0x8898a8;
export const COLOR_LIGHT: u32 = 0xffffff;
export const COLOR_DARK: u32 = 0x000000;
export const COLOR_BUTTON: u32 = 0x2f6fde;
export const COLOR_BUTTON_DOWN: u32 = 0x1d4c9e;

// the on-screen button: the next text
export const BUTTON_X: i32 = 20;
export const BUTTON_Y: i32 = 270;
export const BUTTON_W: i32 = 200;
export const BUTTON_H: i32 = 40;

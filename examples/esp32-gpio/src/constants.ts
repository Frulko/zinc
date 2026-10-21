// The pins, timings and colours of the demo. GPIO 26 and GPIO 35 are free on the ESP32-2432S022 (35 is an input only, with no internal
// pull: wire a 10 kΩ resistor to 3.3 V, the button to ground) and on esp32sim's T-Display board, whose right button is GPIO 35.
export const LED_PIN: u8 = 26;
export const BUTTON_PIN: u8 = 35;
export const BLINK_MS: i32 = 500;
export const DEBOUNCE_MS: u16 = 30;

export const COLOR_BACKGROUND: u32 = 0x101820;
export const COLOR_PANEL: u32 = 0x1c2733;
export const COLOR_TEXT: u32 = 0xe8eef4;
export const COLOR_MUTED: u32 = 0x8898a8;
export const COLOR_LED_ON: u32 = 0xffb020;
export const COLOR_LED_OFF: u32 = 0x3a3020;
export const COLOR_BUTTON: u32 = 0x2f6fde;
export const COLOR_BUTTON_DOWN: u32 = 0x1d4c9e;

// the on-screen button (the same action as the wired one)
export const BUTTON_X: i32 = 20;
export const BUTTON_Y: i32 = 236;
export const BUTTON_W: i32 = 200;
export const BUTTON_H: i32 = 56;

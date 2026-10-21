// Colours, names and limits of the app.
export const COLOR_PAGE = 0xF8FAFC;

/** The app connects by itself to the first device whose name starts with this (the ESP32 advertises "Zinc ..."; the simulator "Zinc sim"). */
export const DEVICE_PREFIX = 'Zinc';
/** Sent once a link opens, so the other side shows something at once. */
export const GREETING = 'hello from the Mac';
/** Lines kept in the conversation. */
export const MAX_LINES = 200;

export const FROM_ME = 'me';
export const FROM_DEVICE = 'device';
export const FROM_APP = 'app';   // the app's own notes: connected, closed, errors

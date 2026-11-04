// Names and ports of the mapper, in one place. Files live in the working directory (an Android app's files folder, the folder a desktop run starts in).
export const SETUP_FILE = 'mapping.json';    // the layers: saved a moment after each change, read at start
export const SHOW_FILE = 'show.json';        // the columns and what the 3D view knows of the surfaces
export const TOKEN_FILE = 'web-token.txt';   // the editor's token: it stays the same across restarts, so its URL keeps working
export const VOLUME_FILE = 'volume.json';    // the master volume: the device's, not a scene's
export const SCENES_DIR = 'scenes';          // saved scenes: one file each, the layers and the columns
export const PREVIOUS_SCENE = 'previous';    // what was on before the last load or new scene: nothing is lost by a wrong click
export const DEFAULT_MEDIA_DIR = 'media';    // where uploads land (Android layers always read this one)
export const DEFAULT_OSC_PORT = '9000';
export const DEFAULT_WEB_PORT = '8080';

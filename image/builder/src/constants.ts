// Every literal the builder uses twice: the lines tools/pi-image prints for it, limits, where things live.

/** tools/pi-image prints these at the start of a line for the apps that follow a build. */
export const PROTOCOL_STEP = '::step ';
export const PROTOCOL_ERROR = '::error ';
export const PROTOCOL_DONE = '::done ';

/** The container a build runs in (tools/pi-image names it): `docker stop` on it stops the build cleanly. */
export const BUILD_CONTAINER = 'zinc-pi-image-build';

/** Where Docker lives on a Mac when the app is started from the Finder, which gives it a short PATH. */
export const EXTRA_PATH = '/usr/local/bin:/opt/homebrew/bin:/opt/local/bin';

/** The log shows the last lines of a build; the whole build is still in the terminal of tools/pi-image. */
export const LOG_LINES_KEPT = 400;

/** The public keys offered by "Use my key", the first one found. */
export const SSH_PUBLIC_KEYS = ['.ssh/id_ed25519.pub', '.ssh/id_ecdsa.pub', '.ssh/id_rsa.pub'];

export const RASPBERRY_PI_IMAGER = '/Applications/Raspberry Pi Imager.app';

export type BuildStatus = 'idle' | 'running' | 'done' | 'failed';

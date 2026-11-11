// Runtime observations, distinct from zinc:platform's build-profile capability constants.
import { device } from 'zinc:sys';
const inventory: any = JSON.parse(device('board'));
/** Device-tree model (DMI product on a PC), or ''. */
export const BOARD: string = inventory.BOARD;
/** Revision-decoded SoC, or ''. */
export const SOC: string = inventory.SOC;
/** Board RAM in MiB; MemTotal when the revision does not specify it. */
export const RAM_MB: number = inventory.RAM_MB;
/** Hexadecimal Raspberry Pi revision code, or ''. */
export const REVISION: string = inventory.REVISION;
/** Observed hardware, not profile support or a guarantee of permission to use it.
 * gpio, i2c, spi, pwm, hwdec-h264, drm, audio, wifi, ble, camera; unknown names return false. */
export function has(cap: string): boolean { return inventory.caps[cap] === true; }

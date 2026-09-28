// Effect budget for desktops (macOS, Linux): the Raspberry Pi build takes quality.rpi1.ts instead (a file next to
// this one named for the profile replaces it at build time; docs/targets/capabilities.md).

/** Sparks in flight at once. */
export const MAX_SPARKS: i32 = 48;
/** Ball positions kept for the motion trail (0: no trail). */
export const TRAIL: i32 = 7;
/** Soft glow halos around lit inserts and bumper flashes. */
export const GLOW: boolean = true;

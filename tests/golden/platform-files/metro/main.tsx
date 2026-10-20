// Metro's platform files (tests/t0/platform_files.sh): './Screen' is Screen.android.tsx on Android, Screen.webos.ts on webOS, Screen.native.tsx
// on every other platform but the web, Screen.tsx on the web; '../which' has no file for these platforms and falls back to which.ts.
import { SCREEN } from './Screen';
import { WHICH } from '../which';
console.log(`${SCREEN} ${WHICH}`);

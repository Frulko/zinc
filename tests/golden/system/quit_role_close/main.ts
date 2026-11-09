// Quit of the app menu runs the close handlers first (ZN-1054): a program keeps its state there before it ends. The first Quit is vetoed
// (unsaved work), the second goes through.
import * as menu from 'zinc:system/menu';
import * as system from 'zinc:system';
import { onFrame, clear } from 'zinc:gfx';
menu.setApp([menu.role('appMenu')]);
let asks = 0;
system.on('window', (a: string[]) => { if (a[0] === 'close-requested') { asks++; console.log('close handler', asks); if (asks === 1) system.preventClose(); } });
let n = 0;
onFrame((dt: number) => { clear(0); n++; if (n === 8) { console.log('quit did not end the app'); system.quit(1); } });

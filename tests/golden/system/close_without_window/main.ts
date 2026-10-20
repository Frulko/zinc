// An app whose only permission is "menu" (ZN-728): the close button's request is confirmed all the same, so the window closes.
import * as menu from 'zinc:system/menu';
import * as system from 'zinc:system';
import { onFrame, clear } from 'zinc:gfx';
menu.setApp([menu.role('appMenu')]);
let n = 0;
onFrame((dt: number) => { clear(0); console.log('frame', ++n); if (n === 8) { console.log('quit did not end the app'); system.quit(1); } });

import * as system from 'zinc:system';
import * as menu from 'zinc:system/menu';
menu.setApp([menu.role('appMenu')]);
console.log(system.selftest());
system.quit(0);

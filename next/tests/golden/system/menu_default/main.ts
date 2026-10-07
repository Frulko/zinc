import * as system from 'zinc:system';
import * as menu from 'zinc:system/menu';
// no setApp: the standard menus appear, named after the app
menu.onClick('role:quit', (s: string) => { console.log('quit chosen from', s); system.quit(0); });

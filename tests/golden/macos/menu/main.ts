import * as system from 'zinc:system';
import * as menu from 'zinc:system/menu';
menu.setApp([
  menu.role('appMenu'),
  menu.submenu('File', [menu.item('new', 'New', 'CmdOrCtrl+N'), menu.item('open', 'Open...', 'CmdOrCtrl+O'), menu.separator(), menu.role('close')]),
  menu.role('editMenu'), menu.role('viewMenu'), menu.role('windowMenu'),
]);
menu.onClick('open', (s: string) => { console.log('open clicked from', s); });
menu.onClick('role:copy', (s: string) => { console.log('copy role event'); });
const r = system.call('menu.dump', {}) as { text: string };
console.log(r.text);
console.log(JSON.stringify(system.call('menu.perform', { path: 'File/Open...' })));
console.log(JSON.stringify(system.call('menu.perform', { path: 'Edit/Copy' })));
setTimeout(() => system.quit(0), 300);

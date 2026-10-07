import * as system from 'zinc:system';
import * as menu from 'zinc:system/menu';

async function main(): Promise<void> {
  menu.setApp([
    menu.role('appMenu'),
    menu.submenu('File', [
      menu.item('new', 'New', 'CmdOrCtrl+N'),
      menu.item('open', 'Open...', 'CmdOrCtrl+O'),
      menu.separator(),
      menu.role('close'),
    ]),
    menu.role('editMenu'), menu.role('viewMenu'), menu.role('windowMenu'),
  ]);
  menu.onClick('open', (source: string) => console.log('open from', source));
  menu.onClick('role:copy', (source: string) => console.log('copy role from', source));
  menu.updateItem('open', 'Open File...', false, false);
  const picked = await menu.popup([menu.item('a', 'Alpha'), menu.item('b', 'Beta')], 10, 20);
  console.log('popup picked', JSON.stringify(picked));
  system.on('shortcut', (a: string[]) => { console.log('done'); system.quit(0); });
}
main();

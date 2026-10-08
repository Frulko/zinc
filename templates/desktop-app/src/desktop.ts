// Desktop integration: the application menu (the macOS menu bar, drawn by the UI kit elsewhere) and an icon in the system tray when the platform has one.
import * as menu from 'zinc:system/menu';
import * as tray from 'zinc:system/tray';
import { go, dark, setDark, addNote } from './state';

export function installMenus(appName: string): void {
  menu.setApp([
    menu.role('appMenu'),
    menu.submenu('File', [menu.item('new-note', 'New Note', 'CmdOrCtrl+N'), menu.separator(), menu.role('quit')]),
    menu.role('editMenu'),
    menu.submenu('View', [menu.item('page-home', 'Home', 'CmdOrCtrl+1'), menu.item('page-notes', 'Notes', 'CmdOrCtrl+2'), menu.item('page-settings', 'Settings', 'CmdOrCtrl+3'),
      menu.separator(), menu.item('toggle-dark', 'Toggle Dark Mode', 'CmdOrCtrl+D')]),
    menu.role('windowMenu'),
  ]);
  menu.onClick('new-note', (src: string) => { addNote(`Note ${new Date().toLocaleTimeString()}`); go('Notes'); });
  menu.onClick('page-home', (src: string) => go('Home'));
  menu.onClick('page-notes', (src: string) => go('Notes'));
  menu.onClick('page-settings', (src: string) => go('Settings'));
  menu.onClick('toggle-dark', (src: string) => setDark(!dark()));
  if (tray.isSupported()) {
    const o = new tray.Options('{{id}}');
    o.tooltip = appName;
    o.menu = [menu.item('new-note', 'New Note'), menu.item('page-notes', 'Show Notes'), menu.separator(), menu.role('quit')];
    o.hasMenu = true;
    tray.create(o);   // the promise resolves once the icon is shown: nothing waits for it
  }
}

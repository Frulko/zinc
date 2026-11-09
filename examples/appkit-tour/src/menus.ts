// The menu bar (zinc:system/menu: the real one on macOS): the standard app, Edit, View and Window menus, and a File menu with the toolbar's
// actions. The Edit roles act on the field being edited (cut, copy, paste, undo, select all).
import * as menu from 'zinc:system/menu';
import { askNewFolder, confirmTrash } from './actions';

export function installMenuBar(): void {
  menu.setApp([
    menu.role('appMenu'),
    menu.submenu('File', [
      menu.item('new-folder', 'New Folder…', 'CmdOrCtrl+Shift+N'),
      menu.separator(),
      menu.item('trash', 'Move to Trash'),   // no Cmd-Backspace: a menu key comes before the field editor, and it deletes a line while typing
    ]),
    menu.role('editMenu'),
    menu.role('viewMenu'),
    menu.role('windowMenu'),
  ]);
  menu.onClick('new-folder', (_source: string) => { askNewFolder(); });
  menu.onClick('trash', (_source: string) => { confirmTrash(); });
}

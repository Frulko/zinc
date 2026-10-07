// The role table of zinc:system/menu: what each role expands to (label, accelerator) and which are native AppKit selectors on macOS. Shared by the macOS backend, the simulator and the
// UI kit's menu bar. Edit roles are not native selectors: Zinc text fields are not NSTextViews, so they post role:<name> events the kit handles as commands.
export class RoleInfo {
  label: string;
  accelerator: string;
  constructor(label: string, accelerator: string) { this.label = label; this.accelerator = accelerator; }
}

/** Label and accelerator of a leaf role; `app` is the app name for the labels that carry it. */
export function roleInfo(role: string, app: string): RoleInfo | null {
  if (role === 'about') return new RoleInfo('About ' + app, '');
  if (role === 'hide') return new RoleInfo('Hide ' + app, 'Cmd+H');
  if (role === 'hideOthers') return new RoleInfo('Hide Others', 'Alt+Cmd+H');
  if (role === 'unhide') return new RoleInfo('Show All', '');
  if (role === 'services') return new RoleInfo('Services', '');
  if (role === 'quit') return new RoleInfo('Quit ' + app, 'Cmd+Q');
  if (role === 'close') return new RoleInfo('Close', 'Cmd+W');
  if (role === 'minimize') return new RoleInfo('Minimize', 'Cmd+M');
  if (role === 'zoom') return new RoleInfo('Zoom', '');
  if (role === 'front') return new RoleInfo('Bring All to Front', '');
  if (role === 'togglefullscreen') return new RoleInfo('Enter Full Screen', 'Ctrl+Cmd+F');
  if (role === 'undo') return new RoleInfo('Undo', 'Cmd+Z');
  if (role === 'redo') return new RoleInfo('Redo', 'Shift+Cmd+Z');
  if (role === 'cut') return new RoleInfo('Cut', 'Cmd+X');
  if (role === 'copy') return new RoleInfo('Copy', 'Cmd+C');
  if (role === 'paste') return new RoleInfo('Paste', 'Cmd+V');
  if (role === 'selectAll') return new RoleInfo('Select All', 'Cmd+A');
  return null;
}

/** The roles of the standard menus: appMenu, editMenu, viewMenu, windowMenu, help ('' separator). */
export function menuRoles(menu: string): string[] {
  if (menu === 'appMenu') return ['about', '', 'services', '', 'hide', 'hideOthers', 'unhide', '', 'quit'];
  if (menu === 'editMenu') return ['undo', 'redo', '', 'cut', 'copy', 'paste', 'selectAll'];
  if (menu === 'viewMenu') return ['togglefullscreen'];
  if (menu === 'windowMenu') return ['minimize', 'zoom', '', 'front'];
  return [];
}
export function menuTitle(menu: string, app: string): string {
  if (menu === 'appMenu') return app;
  if (menu === 'editMenu') return 'Edit';
  if (menu === 'viewMenu') return 'View';
  if (menu === 'windowMenu') return 'Window';
  if (menu === 'fileMenu') return 'File';
  if (menu === 'help') return 'Help';
  return menu;
}
/** Roles that are native AppKit selectors on macOS (the others post role:<name> events). */
export function isNativeRole(role: string): boolean {
  return role === 'about' || role === 'hide' || role === 'hideOthers' || role === 'unhide' || role === 'services' || role === 'close' || role === 'minimize' || role === 'zoom' || role === 'front' || role === 'togglefullscreen';
}

import * as system from 'zinc:system';
import * as menu from 'zinc:system/menu';
import * as tray from 'zinc:system/tray';

async function main(): Promise<void> {
  console.log('available', tray.isAvailable());
  const o = new tray.Options('main');
  o.tooltip = 'Zinc tray'; o.title = '3'; o.template = true;
  o.menu = [menu.item('show', 'Show'), menu.separator(), menu.item('quit', 'Quit')]; o.hasMenu = true;
  o.menuOnLeftClick = false;
  const t = await tray.create(o);
  t.onClick((button: string, double: boolean) => console.log('tray click', button, double));
  menu.onClick('show', (source: string) => console.log('tray menu item from', source));
  const before = system.call('tray.dump', {}) as { trays: { id: string; template: boolean; width: number; height: number; title: string; tooltip: string; menu: string }[] };
  const d = before.trays[0];
  console.log('tray', d.id, 'template', d.template, 'image', d.width + 'x' + d.height, 'title', d.title, 'tooltip', d.tooltip);   // (the position depends on the displays: not printed)
  console.log(d.menu);
  system.call('tray.click', { id: 'main', button: 'left' });   // a real performClick on the status item
  system.call('tray.click', { id: 'main', button: 'right' });
  t.setTitle('4');
  console.log('title now', (system.call('tray.dump', {}) as { trays: { title: string }[] }).trays[0].title);
  setTimeout(() => { t.destroy(); console.log('trays left', (system.call('tray.dump', {}) as { trays: unknown[] }).trays.length); system.quit(0); }, 300);
}
main();

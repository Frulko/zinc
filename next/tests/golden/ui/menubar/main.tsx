import { createSignal, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { MenuBar, ContextMenu, MenuEntry, setTheme, LIGHT, DARK } from 'zinc:ui/kit';
import { env } from 'zinc:sys';
import * as menu from 'zinc:system/menu';

const light = env('MENUBAR_THEME') !== 'dark';
setTheme(light ? LIGHT : DARK);
const [log, setLog] = createSignal<string>('nothing yet');
const template: MenuEntry[] = [
  { label: 'File', submenu: [
    { id: 'new', label: 'New', accelerator: 'mod-n' },
    { id: 'open', label: 'Open...', accelerator: 'mod-o' },
    { separator: true },
    { id: 'autosave', label: 'Autosave', checked: true },
    { label: 'Recent', submenu: [{ id: 'r1', label: 'notes.md' }, { id: 'r2', label: 'todo.md' }] },
  ] },
  { label: 'Edit', submenu: [{ id: 'undo', label: 'Undo', accelerator: 'mod-z' }, { id: 'copy', label: 'Copy', accelerator: 'mod-c', disabled: true }] },
];
function App(): i32 {
  return <view class={light ? "flex-col h-full bg-white" : "flex-col h-full bg-slate-950"}>
    <MenuBar items={template} native={env('MENUBAR_NATIVE') === '1'} onSelect={(id: string) => { setLog('chose ' + id); console.log('menu', id); }} />
    <ContextMenu items={[{ id: 'ctx-copy', label: 'Copy' }, { id: 'ctx-paste', label: 'Paste' }]} onSelect={(id: string) => { console.log('context', id); }}>
      <view class="p-6"><text class="text-sm text-slate-500">{log()}</text></view>
    </ContextMenu>
  </view>;
}
// the same template the native menu takes, converted for the kit (compile check of menu.toKit)
const fromSystem = menu.toKit([menu.submenu('Demo', [menu.item('x', 'Do it', 'CmdOrCtrl+D'), menu.separator(), menu.role('quit')]), menu.role('editMenu')]);
if (env('MENUBAR_KIT') === '1') console.log(JSON.stringify(fromSystem));
render(App, light ? 0xffffff : 0x020617, null);
if (env('MENUBAR_DUMP') === '1') setTimeout(() => { console.log(ui.dump().slice(0, 1800)); }, 1000);

// ui.onKeyUp and the modifiers held alone: Shift down and up reach onKey and onKeyUp as 'Shift' (DOM keydown / keyup)
import * as ui from 'zinc:ui';
const root = ui.createNode(ui.VIEW);
ui.mount(root, 0x000000, null);
ui.onKey((e: ui.KeyEvent) => { console.log('down ' + e.key + (e.shift ? ' +shift' : '')); });
ui.onKeyUp((e: ui.KeyEvent) => { console.log('up ' + e.key); });

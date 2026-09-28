// Inferno class components on the React engine: setState, linkEvent, keyed children, props updates.
import 'inferno';  // JSX in this file uses the React engine
import { App } from '../../examples/inferno-todo/app';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
const root = ui.createNode(ui.VIEW);
ui.insert(root, <App title="Todos" />, -1);
let f = 0;
ui.mount(root, 0xf1f5f9, (dt: number) => {
  f++;
  if (f === 2) ui.click(ui.find('Add task'));
  if (f === 4) ui.click(ui.find('○ Run without a JS engine'));
  if (f === 6) { console.log(ui.dump()); quit(); }
});

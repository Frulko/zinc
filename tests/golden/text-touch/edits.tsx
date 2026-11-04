import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
function App(): i32 { return <View><Input value="zinc://192.168.2.216:8090/code" /></View>; }
let done = false;
ui.addWatcher((): void => {
  if (done) return;
  let field = -1;
  for (let i = 0; i < 20; i++) { const n = ui.inspectNode(i); if (n !== null && n.ed !== null) field = i; }
  if (field < 0) return;
  done = true;
  ui.focusNode(field);
  // UIKit's replaceRange/deleteBackward: select the replaced range, then commit its replacement (including empty).
  ui.systemSignal('imeselect 0 ' + ui.getValue(field).length);
  ui.systemSignal('commit ');
  if (ui.getValue(field) !== '') throw new Error('select all + delete did not clear the link');
  ui.systemSignal('commit zinc://host/code');
  ui.select(field, 7, 11);
  ui.systemSignal('imeselect 7 11');
  ui.systemSignal('commit laptop');
  if (ui.getValue(field) !== 'zinc://laptop/code') throw new Error('range replacement lost the caret');
  ui.setValue(field, '');
  ui.systemSignal('commit next');
  if (ui.getValue(field) !== 'next') throw new Error('controlled clear kept stale text');
  console.log('ime range edits: ok');
  quit();
});
render(App, 0xffffff, null);

import * as ui from 'zinc:ui';

const seen: string[] = [];
const old = ui.createNode(ui.VIEW);
const oldSerial = ui.nodeSerial(old);
ui.onFocusWithin(old, (on: boolean) => { seen.push('stale'); });
ui.destroy(old);
ui.destroy(old);   // disposal is idempotent before reuse
const live = ui.createNode(ui.VIEW);
if (live !== old || ui.nodeSerial(live) === oldSerial) throw new Error('slot was not reused');
ui.onFocusWithin(live, (on: boolean) => { seen.push('live:' + on); });
ui.domFocus(live, true);
ui.domFocus(-1, true);

// A callback can dispose a root awaiting notification, then replace both registrations.
const victim = ui.createNode(ui.VIEW);
let replacement: i32 = -1;
ui.onFocusWithin(victim, (on: boolean) => { seen.push('victim:' + on); });
ui.onFocusWithin(live, (on: boolean) => {
  seen.push('dispose:' + on);
  ui.destroy(victim);
  ui.destroy(live);
  replacement = ui.createNode(ui.VIEW);
  if (replacement !== live) throw new Error('dispatch slot was not reused');
  ui.onFocusWithin(replacement, (inside: boolean) => { seen.push('replacement:' + inside); });
});
ui.domFocus(victim, true);
ui.domFocus(live, true);
ui.domFocus(replacement, true);
ui.domFocus(-1, true);
console.log(seen.join(','));

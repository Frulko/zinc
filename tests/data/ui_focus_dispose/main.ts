import * as ui from 'zinc:ui';

const seen: string[] = [];
const old = ui.createNode(ui.VIEW);
const oldSerial = ui.nodeSerial(old);
const stopOld = ui.onFocusWithin(old, (on: boolean) => { seen.push('stale'); });
ui.destroy(old);
ui.destroy(old);   // disposal is idempotent before reuse
const stopDead = ui.onFocusWithin(old, (on: boolean) => { seen.push('dead'); });
const live = ui.createNode(ui.VIEW);
if (live !== old || ui.nodeSerial(live) === oldSerial) throw new Error('slot was not reused');
ui.onFocusWithin(live, (on: boolean) => { seen.push('live:' + on); });
stopOld();
stopOld();
stopDead();
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
// Component cleanup replaces its closure while the same host node stays alive.
const reused = ui.createNode(ui.VIEW);
let stopPrevious: () => void = () => {};
for (let i: i32 = 0; i < 3; i++) {
  stopPrevious();
  stopPrevious = ui.onFocusWithin(reused, (on: boolean) => { seen.push('outdated'); });
}
stopPrevious();
const stopCurrent = ui.onFocusWithin(reused, (on: boolean) => { seen.push('current:' + on); });
stopPrevious();   // the previous disposer cannot remove the replacement
ui.domFocus(reused, true);
ui.domFocus(-1, true);
stopCurrent();
stopCurrent();
ui.domFocus(reused, true);
ui.domFocus(-1, true);

// Snapshot dispatch skips an unsubscribed peer and never calls a new registration.
const dispatchRoot = ui.createNode(ui.VIEW);
const stopOther = ui.onFocusWithin(dispatchRoot, (on: boolean) => { seen.push('other'); });
let stopSelf: () => void = () => {};
stopSelf = ui.onFocusWithin(dispatchRoot, (on: boolean) => {
  seen.push('self:' + on);
  stopSelf();
  stopOther();
  ui.onFocusWithin(dispatchRoot, (inside: boolean) => { seen.push('late:' + inside); });
});
ui.domFocus(dispatchRoot, true);
ui.domFocus(-1, true);
ui.domFocus(dispatchRoot, true);
ui.domFocus(-1, true);
console.log(seen.join(','));

import * as ui from 'zinc:ui';
import { equal } from 'zinc:assert';

export const policies = ['keep', 'keep-x', 'auto', 'keep', 'unknown', 'keep-x', '', 'KEEP'];
let reads: i32 = 0, presses: i32 = 0, cancels: i32 = 0;
export function read(policy: string): string { reads++; return policy; }
export function down(e: ui.PointerEvent): void { presses++; }
export function cancel(e: ui.PointerEvent): void { cancels++; }

function drag(area: i32, dx: number, dy: number, stolen: boolean): void {
  ui.scrollTo(area, 0, 0);
  const b = ui.screenBox(area), x = b[0] + 130, y = b[1] + 150;
  const beforePresses = presses, beforeCancels = cancels;
  ui.touchAt(1, x, y, 0);
  ui.touchAt(1, x + dx, y + dy, 1);
  equal(presses, beforePresses + 1, 'the child captures the press');
  equal(cancels, beforeCancels + (stolen ? 1 : 0), 'scroll arbitration cancels capture');
  equal(ui.scrollTop(area) > 0, stolen, 'scroll arbitration moves the container');
  ui.touchAt(1, x + dx, y + dy, 2);
  ui.scrollTo(area, 0, 0);
}

export function verify(area: i32, step: i32): void {
  equal(reads, step + 1, 'one expression evaluation per apply');
  const policy = policies[step];
  drag(area, -60, -20, policy !== 'keep' && policy !== 'keep-x');
  drag(area, 0, -60, policy !== 'keep');
  if (step === policies.length - 1) console.log('jsx-grab: pass');
}

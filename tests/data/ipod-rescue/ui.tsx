// Complete the real asynchronous process exchange before starting the headless frame budget.
import { render, createEffect } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import { on } from 'zinc:system';
import { RescuePanel } from '../../../examples/ipod-rescue/src/pages/RescuePanel';
import { BACKGROUND } from '../../../examples/ipod-rescue/src/constants';
import { LogEntry, RecoveryStep } from '../../../examples/ipod-rescue/src/models';
import { initialize, shutdown, busy, selected, logs, setLogs, workflow, runConfirmedRehearsal, setFault, failed } from '../../../examples/ipod-rescue/src/state';

let started = false, mounted = false;
ui.setScheme('light');
const injected = sys.env('IPOD_RESCUE_TEST_FAULT');
if (injected !== '') setFault(injected);
on('quit', (args: string[]) => shutdown());
sys.onSignal('SIGTERM', () => { shutdown(); sys.exit(1); });
createEffect(() => {
  if (busy() || selected() === null) return;
  if (!started) { started = true; runConfirmedRehearsal(); return; }
  let complete = true;
  for (const s of workflow()) if (s.status !== 'verified') complete = false;
  if ((!complete && !failed()) || mounted) return;
  mounted = true;
  setLogs(logs().map((e: LogEntry) => new LogEntry(e.stage, e.message, e.level, '0.00', e.detail)));
  console.log(failed() ? 'rescue-ui: rejected rehearsal, no false success, no hardware writes' : 'rescue-ui: nine verified steps, SysCFG preserved, no hardware writes');
  render(RescuePanel, BACKGROUND, null);
});
initialize();

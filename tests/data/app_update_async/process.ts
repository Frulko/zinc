import { run, Result } from 'zinc:process';
import { env } from 'zinc:sys';
import { onFrame } from 'zinc:gfx';
import { ok as assert } from 'zinc:assert';
let frame = 0;
onFrame(() => {
  frame++;
  if (frame === 1) run(env('UPDATE_PYTHON'), ['-c', 'import time; time.sleep(.03); print("done")'], {}).then((r: Result) => {
    assert(r.code === 0 && r.stdout === 'done\n' && frame === 1, 'deterministic frames overtook a process promise');
    console.log('process completed in frame 1');
  });
});

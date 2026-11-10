import * as update from 'zinc:system/update';
import * as fs from 'zinc:fs';
import { env, exit } from 'zinc:sys';
import { onFrame } from 'zinc:gfx';
import { ok as assert } from 'zinc:assert';
let frame = 0;
onFrame(() => {
  frame++;
  if (frame === 1) update.check(env('UPDATE_URL')).then((info: update.UpdateInfo) => {
    assert(frame >= 2 && info.available, 'check blocked a frame');
    console.log('frames stayed responsive');
    exit(0);
  });
  if (frame === 2) fs.writeText(env('UPDATE_FIXTURE') + '/released', 'yes');
});

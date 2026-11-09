// File copies and hashes must not block the projection thread.
import * as fs from 'zinc:fs';
import { sha256File, toHex } from 'zinc:hash';
import { self, MessageEvent } from 'zinc:worker';

interface SnapshotInput { root: string; names: string[]; sources: string[] }
interface SnapshotOutput { digests: string[]; bytes: number[]; problem: string }
self.onmessage = (event: MessageEvent<SnapshotInput>) => {
  const job = event.data;
  const output: SnapshotOutput = { digests: [], bytes: [], problem: '' };
  try {
    for (let i: i32 = 0; i < job.names.length; i++) {
      const target = `${job.root}/${job.names[i]}`;
      if (job.sources[i] !== '') fs.copyFile(job.sources[i], target);
      output.bytes.push(fs.stat(target).size);
      output.digests.push(toHex(sha256File(target)));
    }
  } catch (e) { output.problem = `${e}`; }
  self.postMessage(output);
  self.close();
};

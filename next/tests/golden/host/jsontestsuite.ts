// JSONTestSuite (nst/JSONTestSuite 1ef36fa, tests/data/jsontestsuite.tar.xz): does JSON.parse accept or reject each file? tests/t1/jsontestsuite.sh checks y_ accepted, n_ rejected, i_ as recorded.
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
const dir = sys.args()[0];
for (const f of fs.list(dir)) {
  const text = fs.readText(dir + '/' + f);
  let ok = true;
  try { JSON.parse(text); } catch (e) { ok = false; }
  console.log(f, ok ? 'accept' : 'reject');
}

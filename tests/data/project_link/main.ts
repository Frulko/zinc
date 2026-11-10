import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { projectLink, projectLinkFiles, projectFiles } from '../../../lib/std/project-link';
function assert(ok: boolean): void { if (!ok) throw new Error('project link assertion failed'); }
const files: any = { 'src/main.ts': 'console.log("Héllo 🌍 / # %");\r\n', 'src/math.ts': 'export const n = 42;\n', 'zinc.json': '{"entry":"src/main.ts"}' };
const link = projectLink(files);
const back = projectLinkFiles(link);
assert(JSON.stringify(back) === JSON.stringify(files));
let rejected: i32 = 0;
for (const bad of ['{"../escape.ts":"x"}', '{"/absolute.ts":"x"}', '{"a\\\\b.ts":"x"}', '{"a.ts":false}', '[]', '{"__proto__":"x","a.ts":"x"}', '{"zinc.json":"{}"}']) {
  try { projectFiles(JSON.parse(bad)); } catch (e) { rejected++; }
}
assert(rejected === 7);
try { projectLink({ 'main.ts': 'x'.repeat(9000) }); } catch (e) { rejected++; }
try { projectLinkFiles('#files-json/%QQ'); } catch (e) { rejected++; }
assert(rejected === 9);
console.log(link);

const args = sys.args();
if (args.length > 0) {
  const browser = projectLinkFiles(fs.readText(args[0]).trim());
  assert(JSON.stringify(browser) === JSON.stringify(files));
  console.log('browser-to-native: ok');
}

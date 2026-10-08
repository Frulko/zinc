// Layout conformance runner (ZN-289, LE-10): every case of cases.json (Yoga v3.2.1's 548 generated cases, from Chrome) is built from zinc:ui nodes with
// its style keys, laid out by the engine of the run (ZINC_UI_LAYOUT=classic or rn) and its boxes compared with Yoga's assertions, tolerance 0.
// One line per case: PASS / FAIL <feature>/<name> (the first wrong box) / SKIP <feature>/<name> (<reason>), then `total <pass> <fail> <skip>`.
import * as ui from 'zinc:ui';
import { readText } from 'zinc:fs';
import { UI_LAYOUT } from 'zinc:platform';

interface FixtureNode { id: string; parent: string | null; index: i32; keys: string[]; values: number[]; expect: number[]; }
interface Fixture { name: string; feature: string; skip: boolean; unsupported: string | null; nodes: FixtureNode[]; }

const doc: any = JSON.parse(readText('tests/golden/layout-conformance/cases.json'));
const cases = doc.cases as Fixture[];
// a huge top-left box stands for Yoga's undefined available space
const top = ui.createNode(ui.VIEW);
ui.setStyles(top, [new ui.Style(['width', 'height', 'alignItems'], [100000, 100000, 0])]);
ui.setRoot(top);
let pass = 0, fail = 0, skip = 0;
const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.001;
for (const c of cases) {
  const tag = c.feature + '/' + c.name;
  if (c.skip || c.unsupported !== null) { skip++; console.log(`SKIP ${tag} (${c.skip ? 'skipped by Yoga' : c.unsupported as string})`); continue; }
  const handles = new Map<string, i32>();
  for (const n of c.nodes) {
    const h = ui.createNode(ui.VIEW);
    handles.set(n.id, h);
    // the case's root: Yoga ignores the flex and position styles of a root, so they are dropped here (in the huge box they would grow it)
    const ks: string[] = [], vs: number[] = [];
    for (let i = 0; i < n.keys.length; i++) {
      const k = n.keys[i];
      if (n.parent === null && (k === 'position' || k === 'grow' || k === 'shrink' || k === 'basis' || k === 'basisPercent')) continue;
      ks.push(k); vs.push(n.values[i]);
    }
    if (ks.length > 0) ui.setStyles(h, [new ui.Style(ks, vs)]);
  }
  let rootH: i32 = -1;
  for (const n of c.nodes) {
    const h = handles.get(n.id) as i32;
    if (n.parent === null) { rootH = h; ui.insert(top, h, -1); }
    else ui.insert(handles.get(n.parent as string) as i32, h, -1);   // the fixtures insert children in index order
  }
  let bad = '';
  for (const n of c.nodes) {
    const h = handles.get(n.id) as i32;
    const b = ui.screenBox(h);
    let px = 0, py = 0;
    if (n.parent !== null) { const p = ui.screenBox(handles.get(n.parent as string) as i32); px = p[0]; py = p[1]; }
    const got = [b[0] - px, b[1] - py, b[2], b[3]];
    const w = n.expect;
    if (!(near(got[0], w[0]) && near(got[1], w[1]) && near(got[2], w[2]) && near(got[3], w[3]))) {
      bad = `${n.id} ${got[0]},${got[1]} ${got[2]}x${got[3]}, want ${w[0]},${w[1]} ${w[2]}x${w[3]}`;
      break;
    }
  }
  if (bad === '') { pass++; console.log(`PASS ${tag}`); } else { fail++; console.log(`FAIL ${tag}: ${bad}`); }
  ui.remove(top, rootH);
}
console.log(`total ${UI_LAYOUT} ${pass} ${fail} ${skip}`);

import * as fs from 'zinc:fs';
import { parseDiagnostics, hottest, tracePhases, projectFiles, Phase } from '../../../app/atelier/model';
const d = parseDiagnostics("/a/b.ts:1:14: error Z0103: Type is not assignable: 'string' to 'i32'\nnoise\n");
console.log(d.length, d[0].file, d[0].line, d[0].col, d[0].code, d[0].message);
const h = hottest("main;a;b 3\nmain;a 1\nmain;c;b 4\n", 5);
console.log(h.length, h[0].name, h[0].self, h[0].share, h[1].name);
const t = tracePhases('[{"name":"thread_name","ph":"M","pid":1},{"name":"layout","ph":"X","ts":0,"dur":30},{"name":"paint","ph":"X","ts":5,"dur":10},{"name":"layout","ph":"X","ts":9,"dur":20}]');
console.log(t.length, t[0].name, t[0].total, t[0].count);
console.log(projectFiles("app").join(","));
// real files: a ZINC_TRACE of tests/golden/ui/click.tsx and a `zinc profile --folded` of fib.ts (the numbers vary, the names do not)
const phases = tracePhases(fs.readText('tests/golden/atelier/real-trace.json'));
console.log(phases.length > 3, phases.map((p: Phase) => p.name).sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)).join(','));
const top = hottest(fs.readText('tests/golden/atelier/real.folded'), 3);
console.log(top.length, top[0].name);

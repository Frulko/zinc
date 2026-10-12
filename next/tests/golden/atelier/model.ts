import * as fs from 'zinc:fs';
import { parseDiagnostics, hottest, tracePhases, projectFiles, Phase, parseDevices, parseFigures, sizeText, Figures, stepOf, readProject, jsonSet, jsonGet, jsonList, permissionText, importsOf, Project, Target } from '../../../app/atelier/model';
const d = parseDiagnostics("/a/b.ts:1:14: error Z0103: Type is not assignable: 'string' to 'i32'\nnoise\n");
console.log(d.length, d[0].file, d[0].line, d[0].col, d[0].code, d[0].message);
const h = hottest("main;a;b 3\nmain;a 1\nmain;c;b 4\n", 5);
console.log(h.length, h[0].name, h[0].self, h[0].share, h[1].name);
const t = tracePhases('[{"name":"thread_name","ph":"M","pid":1},{"name":"layout","ph":"X","ts":0,"dur":30},{"name":"paint","ph":"X","ts":5,"dur":10},{"name":"layout","ph":"X","ts":9,"dur":20}]');
console.log(t.length, t[0].name, t[0].total, t[0].count);
console.log(projectFiles("tests/golden/atelier").join(","));   // a folder that does not change with the app (ZN-728)
// real files: a ZINC_TRACE of tests/golden/ui/click.tsx and a `zinc profile --folded` of fib.ts (the numbers vary, the names do not)
const phases = tracePhases(fs.readText('tests/golden/atelier/real-trace.json'));
console.log(phases.length > 3, phases.map((p: Phase) => p.name).sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)).join(','));
const top = hottest(fs.readText('tests/golden/atelier/real.folded'), 3);
console.log(top.length, top[0].name);
// devices (ZN-729.06): the list as `zinc device list --json` prints it (one found on the network, one paired and away), samples of top
const dv = parseDevices('[{"name":"spark","address":"192.168.2.107:7733","state":"pairing open","kind":"Raspberry Pi 3 Model B Plus Rev 1.3","id":"aa"},{"name":"bench","address":"127.0.0.1:5000","state":"paired, not seen","kind":"","id":"bb"}]\n');
console.log(dv.length, dv[0].name, dv[0].state, dv[0].kind, dv[1].name, dv[1].address, parseDevices('zinc device: no').length);
const pi = parseFigures('{"ok":true,"name":"spark","os":"linux","osVersion":"6.6","arch":"aarch64","kind":"Raspberry Pi 3","cores":4,"load1":0.42,"cpu":"Cortex-A53","memTotal":953466880,"memFree":517996544,"tempC":48.3,"apps":[{"name":"blink","kind":"zapp","running":true,"pid":7,"cpuMs":9,"rss":3637248},{"name":"old","kind":"export","running":false}]}') as Figures;
console.log(pi.name, pi.system, pi.cpu, pi.load, sizeText(pi.memFree), sizeText(17179869184), pi.temp, pi.apps.length, pi.apps[0].name, pi.apps[0].running, pi.apps[1].running, pi.apps[1].rss);
const mac = parseFigures('{"ok":true,"name":"mac","os":"macos","osVersion":"24","arch":"arm64","kind":"","cores":1,"load1":1,"cpu":"","memTotal":1,"memFree":1,"apps":[]}') as Figures;
console.log(mac.cpu, mac.temp, parseFigures('zinc device: nothing answers') === null);
// the step lines of a command (ZN-734): a note of zinc device deploy and the progress of its transfer are steps, an error and a program's line are not
console.log(stepOf('  device     spark is linux aarch64 (Raspberry Pi 3 Model B Plus Rev 1.3): exporting for rpi, shown on its framebuffer').join('|'));
console.log(stepOf('  send       45%  16 MiB of 35 MiB  2.1 MiB/s').join('|'), '/', stepOf('  send       100%  35 MiB of 35 MiB  2.1 MiB/s               16.4 s').join('|'));
console.log(stepOf('  compile    4 files, 34 functions                        44 ms').join('|'));
console.log(stepOf('zinc device: spark does not answer').length, stepOf('installed blink on spark (35 MiB)').length, stepOf('  indented by the program').length, stepOf('').length);
// zinc.json (ZN-736): what a project says, and edits that change one value and nothing else
const hero = '{\n  "name": "hero",\n  "app": { "id": "dev.zinc.hero", "version": "1.2.0", "icon": "icon.png" },\n  "entry": "src/main.tsx",\n  "permissions": ["menu", "fs:read:data"],\n  "targets": {\n    "macos": {\n      "width": 1100,\n      "height": 700\n    },\n    "linux": { "width": 800, "height": 480, "display": "fbdev" },\n    "rpi1": { "display": { "driver": "gl", "mode": "1280x720" } }\n  },\n  "requires": ["heap>=8M", "display"]\n}\n';
const pr = readProject(hero) as Project;
console.log(pr.name, pr.id, pr.version, pr.icon, pr.entry, pr.declared, pr.permissions.join('+'), pr.requires.join('+'));
console.log(pr.targets.map((t: Target) => `${t.name} ${t.width}x${t.height} ${t.display}`).join(' | '));
console.log(readProject('[1, 2]') === null, readProject('') === null, readProject('{} x') === null, (readProject('{}') as Project).declared);
const sized = jsonSet(hero, ['targets', 'macos', 'width'], '1280');
console.log(sized.length - hero.length, jsonGet(sized, ['targets', 'macos', 'width']), sized.replace('1280', '1100') === hero);
console.log(jsonSet(hero, ['permissions'], jsonList(['menu'])).split('\n')[4], '/', jsonSet(hero, ['app', 'name'], '"Hero"').split('\n')[2]);
console.log(JSON.stringify(jsonSet('{ "name": "a" }', ['app', 'version'], '"0.2.0"')), JSON.stringify(jsonSet('{}', ['name'], '"a"')), JSON.stringify(jsonSet('{\n  "name": "a"\n}\n', ['permissions'], '[]')));
console.log(permissionText('tray'), '/', permissionText('fs:read:data'), '/', permissionText('net:api.example.com'), '/', permissionText('window:state'), '/', '[' + permissionText('teleport') + ']');
console.log(importsOf("import * as ui from 'zinc:ui';\nimport { a } from './a';\nimport 'three';\nimport { b } from \"zinc:gfx\";\n").join(','));

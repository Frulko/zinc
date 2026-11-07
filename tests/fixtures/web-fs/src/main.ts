// zinc:fs in a page (tests/t1/web_fs.sh): a project file shipped read-only (targets.web.files), and files written in an earlier visit read back after a reload.
import * as fs from 'zinc:fs';

const seed = fs.readText('data/seed.txt').trim();
let n = 1;
if (fs.exists('state/count.txt')) n = parseInt(fs.readText('state/count.txt')) + 1;
fs.mkdir('state/sub', true);
fs.writeText('state/count.txt', `${n}`);
fs.writeBytes('state/sub/b.bin', [1, 2, 3]);
fs.appendText('state/log.txt', `run ${n}\n`);
fs.copyFile('data/seed.txt', 'state/copy.txt');
fs.rename('state/copy.txt', 'state/moved.txt');
fs.writeText('state/gone.txt', 'x');
fs.remove('state/gone.txt');
const names = fs.list('state').sort().join(',');
const file = fs.stat('state/sub/b.bin'), dir = fs.stat('./state/sub/../sub');
const runs = fs.readText('state/log.txt').trim().split('\n').length;
console.log(`fs-run ${n} seed=${seed} list=${names} size=${file.size} file=${file.isFile} dir=${dir.isDirectory} runs=${runs} readonly=${!fs.remove('data/seed.txt')} moved=${fs.readText('/state/moved.txt').trim() === seed}`);

import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
// The web-platform-tests URL data against URL of zinc:web: tests/data/wpt/urltestdata.json (parser) and setters_tests.json (setters). Prints the counts and the first failures.
const dir = sys.args()[0];
let shown = 0;
function fail(kind: string, name: string, what: string): void { if (shown++ < 8) console.log('FAIL', kind, name, what); }
function parserCases(): void {
  const data: any = JSON.parse(fs.readText(dir + '/urltestdata.json'));
  let n = 0, ok = 0;
  for (let i = 0; i < data.length; i++) {
    const t: any = data[i];
    if (typeof t === 'string') continue;
    n++;
    const input: string = t.input;
    let u: URL | null = null;
    try { u = t.base === null ? new URL(input) : new URL(input, t.base as string); } catch (e) { u = null; }
    if (t.failure === true) { if (u === null) ok++; else fail('parse', input, 'should fail'); continue; }
    if (u === null) { fail('parse', input, 'threw'); continue; }
    const bad = u.href !== t.href ? 'href ' + u.href : u.protocol !== t.protocol ? 'protocol' : u.username !== t.username ? 'username' : u.password !== t.password ? 'password'
      : u.host !== t.host ? 'host ' + u.host : u.hostname !== t.hostname ? 'hostname' : u.port !== t.port ? 'port' : u.pathname !== t.pathname ? 'pathname ' + u.pathname
      : u.search !== t.search ? 'search' : u.hash !== t.hash ? 'hash' : t.origin !== undefined && u.origin !== t.origin ? 'origin ' + u.origin : '';
    if (bad === '') ok++; else fail('parse', input, bad);
  }
  console.log('urltestdata', ok + '/' + n);
}
function setterCases(): void {
  const data: any = JSON.parse(fs.readText(dir + '/setters_tests.json'));
  let n = 0, ok = 0;
  for (const prop of ['protocol', 'username', 'password', 'host', 'hostname', 'port', 'pathname', 'search', 'hash', 'href']) {
    const cases: any = data[prop];
    for (let i = 0; i < cases.length; i++) {
      const t: any = cases[i];
      n++;
      let bad = '';
      try {
        const u = new URL(t.href as string);
        const v: string = t.new_value;
        if (prop === 'protocol') u.protocol = v; else if (prop === 'username') u.username = v; else if (prop === 'password') u.password = v; else if (prop === 'host') u.host = v;
        else if (prop === 'hostname') u.hostname = v; else if (prop === 'port') u.port = v; else if (prop === 'pathname') u.pathname = v; else if (prop === 'search') u.search = v;
        else if (prop === 'hash') u.hash = v; else u.href = v;
        const e: any = t.expected;
        if (e.href !== undefined && u.href !== e.href) bad = 'href ' + u.href;
        else if (e.protocol !== undefined && u.protocol !== e.protocol) bad = 'protocol';
        else if (e.username !== undefined && u.username !== e.username) bad = 'username';
        else if (e.password !== undefined && u.password !== e.password) bad = 'password';
        else if (e.host !== undefined && u.host !== e.host) bad = 'host ' + u.host;
        else if (e.hostname !== undefined && u.hostname !== e.hostname) bad = 'hostname';
        else if (e.port !== undefined && u.port !== e.port) bad = 'port';
        else if (e.pathname !== undefined && u.pathname !== e.pathname) bad = 'pathname ' + u.pathname;
        else if (e.search !== undefined && u.search !== e.search) bad = 'search';
        else if (e.hash !== undefined && u.hash !== e.hash) bad = 'hash';
      } catch (err) { bad = 'threw'; }
      if (bad === '') ok++; else fail('setter ' + prop, t.href + ' <- ' + t.new_value, bad);
    }
  }
  console.log('setters_tests', ok + '/' + n);
}
parserCases();
setterCases();

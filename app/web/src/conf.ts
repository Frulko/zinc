// web.conf: `key=value` lines (relay, token, mode, last), written whole through a temporary file, readable by its owner only (the token).
import * as fs from 'zinc:fs';

export class Conf {
  path: string;
  keys: string[] = [];
  values: string[] = [];
  constructor(path: string) {
    this.path = path;
    if (!fs.exists(path)) return;
    for (const line of fs.readText(path).split('\n')) { const eq = line.indexOf('='); if (eq > 0) this.set(line.slice(0, eq), line.slice(eq + 1)); }
  }
  get(k: string): string { const i = this.keys.indexOf(k); return i < 0 ? '' : this.values[i]; }
  set(k: string, v: string): void { const i = this.keys.indexOf(k); if (i < 0) { this.keys.push(k); this.values.push(v); } else this.values[i] = v; }
  save(): void {
    let s = '';
    for (let i: i32 = 0; i < this.keys.length; i++) s += this.keys[i] + '=' + this.values[i].split('\n').join(' ') + '\n';
    fs.mkdir(this.path.slice(0, this.path.lastIndexOf('/')), true);
    fs.writeText(this.path + '.tmp', s);
    fs.chmod(this.path + '.tmp', 0o600);
    fs.rename(this.path + '.tmp', this.path);
  }
}

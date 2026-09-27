// zinc:fs for sim (same error messages as runtime/mod/fs.cpp)
import * as fs from 'node:fs';
const wrap = (what, path, f) => { try { return f(); } catch { throw new Error(what + path); } };
export const readText = p => wrap('ENOENT: cannot open ', p, () => fs.readFileSync(p, 'utf8'));
export const writeText = (p, d) => wrap('EACCES: cannot write ', p, () => fs.writeFileSync(p, d));
export const appendText = (p, d) => wrap('EACCES: cannot write ', p, () => fs.appendFileSync(p, d));
export const exists = p => fs.existsSync(p);
export const list = d => wrap('ENOENT: cannot list ', d, () => fs.readdirSync(d).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
export const remove = p => { try { fs.rmSync(p); return true; } catch { return false; } };
export const mkdir = p => { try { fs.mkdirSync(p); return true; } catch { return false; } };

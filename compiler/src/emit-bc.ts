import * as path from 'node:path';
// Experimental typed bytecode backend. Unsupported HIR/MIR is rejected, never executed as native code.
import { buildHir, type HStmt } from './hir.ts';
import { lowerMir, type MFunc } from './mir.ts';
import { type Sema, type ZT, VOID } from './sema.ts';
import { ts } from './frontend.ts';
import { ABI_VERSION, abiType, type AbiResult } from './abi.ts';

// Kept in the same order as runtime/vm/main.cpp. All integers in ZBC4 are little endian.
const OPS = ['const', 'mov', 'load', 'store', '+', '-', '*', '/', '%', '<', '<=', '>', '>=', '==', '!=', '&', '|', '^', '<<', '>>', '>>>', 'neg', 'not', 'bitnot', 'conv', 'jump', 'branch', 'call', 'ret', 'print', 'space', 'newline', 'sqrt', 'abs', 'floor', 'ceil', 'trunc', 'native', 'alloc', 'init', 'field.get', 'field.set', 'index.get', 'index.set', 'length', 'push', 'pop', 'concat', 'truthy', 'closure', 'call.closure', 'fnref', 'call.method', 'throw', 'exception', 'promise', 'await', 'promise.pending', 'promise.settle', 'microtask', 'timer', 'timer.cancel', 'yield', 'generator.step', 'generator.value', 'string', 'math', 'splice', 'join', 'collection', 'generator.control', 'methodref'];
const MATH = ['abs', 'floor', 'ceil', 'round', 'trunc', 'sign', 'sqrt', 'pow', 'sin', 'cos', 'tan', 'atan2', 'exp', 'log', 'hypot', 'min', 'max', 'fround', 'imul', 'clz32', 'random', 'seed'];
const type = (t: ZT): number => t.k === 'num' && t.m === 'u8' ? 3 : ['obj', 'arr', 'tup', 'null', 'fn', 'promise', 'gen', 'map', 'set'].includes(t.k) ? 7 : abiType(t);
interface Code { types: number[]; params: number[]; captures: number[]; ret: number; ins: number[][]; handlers: [number, number][] }
export function emitBytecode(sema: Sema, abi: AbiResult): Buffer {
  const sources = sema.fe.sources.filter(f => !abi.imports.has(f.fileName));
  const available = new Set(sources), visited = new Set<ts.SourceFile>(), active = new Set<ts.SourceFile>();
  const ordered: ts.SourceFile[] = [];
  const visit = (sf: ts.SourceFile) => {
    if (active.has(sf)) throw new Error(`zinc-vm: cyclic module initialization is not implemented: ${sf.fileName}`);
    if (visited.has(sf)) return;
    active.add(sf);
    for (const st of sf.statements) {
      if ((!ts.isImportDeclaration(st) && !ts.isExportDeclaration(st)) || !st.moduleSpecifier ||
          (ts.isImportDeclaration(st) ? st.importClause?.isTypeOnly : st.isTypeOnly)) continue;
      const dep = sema.checker.getSymbolAtLocation(st.moduleSpecifier)?.declarations?.find(ts.isSourceFile);
      if (dep && available.has(dep)) visit(dep);
    }
    active.delete(sf); visited.add(sf); ordered.push(sf);
  };
  visit(sema.fe.entry);
  const symbols = new Map<ts.Node, string>();
  for (const [i, sf] of ordered.entries()) for (const st of sf.statements) {
    if ((ts.isFunctionDeclaration(st) && st.body) || ts.isClassDeclaration(st)) symbols.set(st, `m${i}:${st.name?.text ?? 'default'}`);
    if (ts.isClassDeclaration(st)) for (const member of st.members) {
      if (ts.isPropertyDeclaration(member) && (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static))
        symbols.set(member, `${symbols.get(st)}.${member.name.getText()}`);
    }
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
      const bind = (name: ts.BindingName, declaration: ts.Node) => {
        if (ts.isIdentifier(name)) symbols.set(declaration, `m${i}:${name.text}`);
        else for (const element of name.elements) if (ts.isBindingElement(element)) bind(element.name, element);
      };
      bind(d.name, d);
    }
  }
  const modules = buildHir(sema, abi.calls, symbols).filter(m => !m.file.endsWith('.spec.ts'));
  const byFile = new Map(modules.map(m => [m.file, m]));
  const linked = ordered.map(sf => {
    const m = byFile.get(path.relative(sema.root, sf.fileName));
    if (!m) throw new Error(`zinc-vm: unsupported module ${sf.fileName}`);
    return m;
  });
  const hir = [{ file: '<linked>', globals: linked.flatMap(m => m.globals), classes: linked.flatMap(m => m.classes),
    fns: linked.flatMap(m => m.fns), init: [] as HStmt[], ordered: linked.flatMap(m => m.ordered) }];
  const classes = new Map(hir[0].classes.map(c => [c.decl, c]));
  hir[0].fns.push(...hir[0].classes.flatMap(c => c.methods));
  hir[0].classes = [];
  const globals = new Map<string, number>();
  const globalTypes: number[] = [];
  for (const m of hir) for (const s of m.globals) {
    if (s.k !== 'let' || s.cell) throw new Error('zinc-vm: unsupported global declaration');
    globals.set('@' + s.name, globalTypes.length); globalTypes.push(type(s.t));
  }
  const lower = hir[0];
  // Keep global initializers interleaved with executable statements, as in the source.
  const globalStatements = new Set(lower.globals);
  lower.init = lower.ordered.map((g): HStmt => {
    if (!globalStatements.has(g)) return g;
    if (g.k !== 'let') throw new Error('zinc-vm: unsupported global initializer');
    return { k: 'expr', e: { k: 'assign', t: g.t, target: { k: 'var', t: g.t, name: g.name, global: true }, v: g.init ?? { k: 'lit', t: g.t, v: g.t.k === 'bool' ? 'false' : g.t.k === 'str' ? JSON.stringify('') : '0' } } };
  });
  const fs = lowerMir(hir)[0].fns;
  if (!fs.some(f => f.name === '<init>')) fs.push({ name: '<init>', sig: '(): void', stats: '', blocks: [] });
  const names = new Map(fs.map((f, i) => [f.name, i]));
  const signatures = new Map(fs.filter(f => f.source).map(f => [f.name, { args: f.source!.params.map(p => type(p.t)), ret: type(f.source!.ret) }]));
  signatures.set('<init>', { args: [], ret: type(VOID) });
  // ZBC3 reserves layout 0 and keys 0/1 for host-originated guest Errors.
  const fields = new Map<string, number>([['message', 0], ['name', 1]]);
  const field = (name: string) => { let id = fields.get(name); if (id === undefined) { id = fields.size; fields.set(name, id); } return id; };
  const layouts: { array: boolean; keys: number[]; types: number[]; methods?: [number, number][] }[] = [{ array: false, keys: [0, 1], types: [6, 6] }];
  const namesToFunctions = names;
  const layout = (t: ZT) => {
    let names: string[], types: number[];
    if (t.k === 'arr') { names = ['[]']; types = [type(t.el)]; }
    else if (t.k === 'tup') { names = t.els.map((_, i) => String(i)); types = t.els.map(type); }
    else if (t.k === 'obj') { const cls = ts.isClassDeclaration(t.decl) ? classes.get(t.decl) : undefined; names = cls ? cls.fields.map(f => f.name) : sema.fieldNames(t.decl); types = cls ? cls.fields.map(f => type(f.t)) : names.map(n => type(sema.declType(sema.memberDecl(t.decl, n)!))); }
    else throw new Error('zinc-vm: unsupported aggregate layout');
    const methods = new Map<number, number>();
    const addMethods = (decl: ts.ClassDeclaration) => {
      const base = sema.baseClass(decl); if (base) addMethods(base);
      for (const f of classes.get(decl)?.methods ?? []) if (!f.static && !f.name.endsWith('.constructor')) methods.set(field(f.name.slice(f.name.lastIndexOf('.') + 1)), namesToFunctions.get(f.name)!);
    };
    if (t.k === 'obj' && ts.isClassDeclaration(t.decl)) addMethods(t.decl);
    const item = { array: t.k === 'arr', keys: names.map(field), types, methods: [...methods] };
    const existing = layouts.findIndex(l => l.array === item.array && l.keys.join() === item.keys.join() && l.types.join() === item.types.join() && JSON.stringify(l.methods ?? []) === JSON.stringify(item.methods));
    if (existing >= 0) return existing;
    layouts.push(item); return layouts.length - 1;
  };
  const constants: { t: number; v: string | number }[] = [];
  const compile = (f: MFunc): Code => {
    const fail = (what: string): never => { throw new Error(`zinc-vm: ${f.name}: unsupported ${what}`); };
    if (f.note) fail(f.note);
    const sig = signatures.get(f.name) ?? fail('closure');
    const insts = f.blocks.flatMap(b => [...b.phis, ...b.insts]);
    const byId = new Map(insts.map(i => [i.id, i]));
    const sourceType = (id: number | undefined) => {
      const i = id === undefined ? undefined : byId.get(id);
      return i?.op === 'capture' ? f.source?.captureTypes?.find(c => c.name === i.attr)?.t : i?.t;
    };
    const regs = new Map<number, number>();
    const types: number[] = [];
    for (const i of insts) {
      const cap = i.op === 'capture' ? f.source?.captureTypes?.find(c => c.name === i.attr) : undefined;
      regs.set(i.id, types.length); types.push(i.op === 'cell.new' || cap?.cell ? 7 : cap ? type(cap.t) : type(i.t));
    }
    const reg = (id: number) => regs.get(id) ?? fail(`register %${id}`);
    const ins: number[][] = [];
    const handlers: [number, number][] = [];
    const declaredParams = f.source?.params ?? [];
    const params = declaredParams.map(p => {
      const existing = insts.find(i => i.op === 'param' && i.attr === p.name);
      if (existing) return reg(existing.id);
      const r = types.length; types.push(type(p.t)); return r;
    });
    const op = (name: string, t = 0, a = 0, b = 0, c = 0) => {
      const n = OPS.indexOf(name); if (n < 0) fail(name);
      ins.push([n, t, a, b, c]);
    };
    const narrowByte = (a: number, t: ZT) => {
      if (t.k !== 'num' || t.m !== 'u8') return;
      const mask = types.length; types.push(3); const id = constants.length; constants.push({ t: 3, v: 255 });
      op('const', 3, mask, id); op('&', 3, a, a, mask);
    };
    const labels = new Map<number, number>();
    const fix: { at: number; field: number; target: number }[] = [];
    // Parallel phi copies need temporaries: a swap on a back edge must not overwrite its second input.
    const edge = (from: MFunc['blocks'][number], to: MFunc['blocks'][number]) => {
      const pred = to.preds.indexOf(from);
      const copies = to.phis.map(p => {
        const tmp = types.length; types.push(type(p.t));
        op('mov', type(p.t), tmp, reg(p.args[pred]));
        return [reg(p.id), tmp, type(p.t)];
      });
      for (const [dst, src, t] of copies) op('mov', t, dst, src);
      fix.push({ at: ins.length, field: 2, target: to.id }); op('jump');
    };
    for (const b of f.blocks) {
      labels.set(b.id, ins.length);
      for (const i of b.insts) {
        const a = reg(i.id), t = type(i.t), args = i.args.map(reg), [x = 0, y = 0] = args;
        switch (i.op) {
          case 'param': case 'capture': break;
          case 'undef': case 'const': {
            let v: string | number;
            if (t === 6) { try { v = i.op === 'undef' ? '' : JSON.parse(i.attr!); } catch { fail('string literal'); } }
            else v = t === 7 || i.op === 'undef' ? 0 : Number(i.val ?? i.attr);
            if (i.t.k === 'num' && i.t.m === 'u8') v = Number(v!) & 255;
            const k = constants.length; constants.push({ t, v: v! }); op('const', t, a, k); break;
          }
          case 'load': case 'store': {
            const target = i.op === 'load' ? names.get(i.attr!.slice(1)) : undefined;
            if (target !== undefined) { op('fnref', 7, a, target); break; }
            const g = globals.get(i.attr!) ?? fail(`global ${i.attr}`);
            op(i.op, t, i.op === 'load' ? a : x, g); break;
          }
          case 'bin': {
            let left=x, right=y, operand=types[x];
            if (['<<','>>','>>>'].includes(i.attr!)) {
              operand=t;
              const convert=(r:number) => { if(types[r]===operand)return r; const dst=types.length;types.push(operand);op('conv',operand,dst,r,types[r]);return dst; };
              left=convert(x);right=convert(y);
            }
            op(i.attr!, operand, a, left, right); narrowByte(a, i.t); break;
          }
          case 'un': op(({ '-': 'neg', '!': 'not', '~': 'bitnot', 'truthy': 'truthy' } as Record<string, string>)[i.attr!] ?? fail(i.attr!), types[x], a, x); narrowByte(a, i.t); break;
          case 'alloc.object': case 'alloc.array': case 'alloc.tuple': {
            const id = layout(i.t), l = layouts[id];
            op('alloc', 7, a, id, l.array ? args.length : l.types.length);
            const keys = i.attr?.split(',') ?? [];
            args.forEach((r, n) => {
              const slot = l.array || i.op === 'alloc.tuple' ? n : l.keys.indexOf(field(keys[n]));
              if (slot < 0 || l.types[l.array ? 0 : slot] !== types[r]) fail('aggregate initializer');
              op('init', types[r], a, slot, r);
            }); break;
          }
          case 'field.get': op(i.attr === 'cur' && sourceType(i.args[0])?.k === 'gen' ? 'generator.value' : 'field.get', t, a, x, field(i.attr!)); break;
          case 'field.set': op('field.set', t, x, y, field(i.attr!)); break;
          case 'index.get': op('index.get', t, a, x, y); break;
          case 'index.set': op('index.set', t, x, y, args[2]); break;
          case 'concat': {
            const base = types.length;
            for (const r of args) { const dst = types.length; types.push(types[r]); op('mov', types[r], dst, r); }
            op('concat', t, a, base, args.length); break;
          }
          case 'yield': op('yield', types[x], x);break;
          case 'await': {
            let promise = x;
            if (sourceType(i.args[0])?.k !== 'promise') {
              promise = types.length; types.push(7);op('promise', 7, promise, x, types[x]);
            }
            op('await', t, a, promise);break;
          }
          case 'exception': op('exception', 7, a); break;
          case 'new': case 'new!': {
            if (i.t.k === 'map' || i.t.k === 'set') {
              if (args.length) fail('collection constructor arguments');
              const key = type(i.t.k === 'map' ? i.t.key : i.t.el), value = i.t.k === 'map' ? type(i.t.val) : 0;
              op('collection', 7, a, (key << 8) | (value << 16), 0);break;
            }
            if (i.t.k === 'obj' && i.t.decl === sema.errorDecl) {
              const id = layout(i.t), l = layouts[id];op('alloc', 7, a, id, l.types.length);
              for (const [name, text] of [['name', i.attr ?? 'Error'], ['message', ''], ['stack', '']]) {
                let r = name === 'message' ? args[0] : undefined;
                if (r === undefined) { r = types.length; types.push(6); const k = constants.length; constants.push({ t: 6, v: text });op('const', 6, r, k); }
                const slot = l.keys.indexOf(field(name)); if (slot >= 0) op('init', 6, a, slot, r);
              }
              break;
            }
            if (i.t.k !== 'obj' || !ts.isClassDeclaration(i.t.decl)) fail('constructor');
            const cls = i.t.k === 'obj' && ts.isClassDeclaration(i.t.decl) ? classes.get(i.t.decl) : undefined;
            if (!cls) fail('constructor class');
            const fn = names.get(`${cls!.name}.constructor`)!;
            const id = layout(i.t); op('alloc', 7, a, id, layouts[id].types.length);
            const base = types.length;
            for (const r of [a, ...args]) { const dst = types.length; types.push(types[r]); op('mov', types[r], dst, r); }
            const result = types.length; types.push(0); op('call', 0, result, fn, base);break;
          }
          case 'call.method': case 'call.method!': case 'call.virtual': case 'call.virtual!': {
            if (i.attr === 'step' && sourceType(i.args[0])?.k === 'gen') { op('generator.step', 1, a, x);break; }
            const base = types.length;
            for (const r of args) { const dst = types.length; types.push(types[r]); op('mov', types[r], dst, r); }
            op('call.method', t, a, base, field(i.attr!));break;
          }
          case 'cell.new': {
            const id = layouts.length; layouts.push({ array: false, keys: [field('@cell')], types: [types[x]] });
            op('alloc', 7, a, id, 1);op('init', types[x], a, 0, x);break;
          }
          case 'cell.load': op('field.get', t, a, x, field('@cell')); break;
          case 'cell.store': op('field.set', types[y], x, y, field('@cell')); break;
          case 'closure': {
            const fn = names.get(`${f.name}::${i.attr?.split('[')[0]}`) ?? fail('closure target');
            const base = types.length;
            for (const r of args) { const dst = types.length; types.push(types[r]); op('mov', types[r], dst, r); }
            op('closure', 7, a, fn, base);break;
          }
          case 'call.closure': case 'call.closure!': {
            const base = types.length;
            for (const r of args.slice(1)) { const dst = types.length; types.push(types[r]); op('mov', types[r], dst, r); }
            op('call.closure', t, a, x, base);break;
          }
          case 'conv.num': {
            op('conv', t, a, x, types[x]);
            narrowByte(a, i.t);
            break;
          }
          case 'call.static': case 'call.static!': {
            const fn = names.get(i.attr!) ?? fail(`call ${i.attr}`);
            const base = types.length;
            for (const r of args) { const dst = types.length; types.push(types[r]); op('mov', types[r], dst, r); }
            op('call', t, a, fn, base); break;
          }
          case 'call.builtin': case 'call.builtin!':
            if (i.attr?.startsWith('@methodref:')) {
              op('methodref', 7, a, x, field(i.attr.slice(11)));
            } else if (i.attr?.startsWith('@native:')) {
              const id = Number(i.attr.slice(8)), base = types.length;
              if (abi.exports[id].result === 10) { const shape = layout(i.t); op('alloc', 7, a, shape, layouts[shape].types.length); }
              for (const r of args) { const dst = types.length; types.push(types[r]); op('mov', types[r], dst, r); }
              op('native', t, a, id, base);
            } else if (sourceType(i.args[0])?.k === 'map' || sourceType(i.args[0])?.k === 'set') {
              const collection = sourceType(i.args[0]) as Extract<ZT, { k: 'map' | 'set' }>;
              const key = type(collection.k === 'map' ? collection.key : collection.el), value = collection.k === 'map' ? type(collection.val) : 0;
              const packed = (key << 8) | (value << 16);
              const emit = (method: number, dest: number, result: number) => {
                const base = types.length;
                for (const r of args) { const dst = types.length;types.push(types[r]);op('mov', types[r], dst, r); }
                op('collection', result, dest, packed | method, base);
              };
              if (i.attr === 'entry_at' && collection.k === 'map') {
                const shape = layout(i.t);op('alloc', 7, a, shape, 2);
                const k = types.length;types.push(key);const v = types.length;types.push(value);
                emit(9, k, key);emit(10, v, value);op('init', key, a, 0, k);op('init', value, a, 1, v);
              } else {
                const methods: Record<string, number> = { size: 1, get: 2, set: 3, add: 3, has: 4, delete: 5, clear: 6, slots: 7, live_at: 8, key_at: 9, entry_at: 9, val_at: 10, keys: 11, values: 12, '@iterate.begin': 13, '@iterate.end': 14 };
                const method = methods[i.attr!] ?? fail(`collection method ${i.attr}`);
                if (method === 11 || method === 12) op('alloc', 7, a, layout(i.t), 0);
                emit(method, a, t);
              }
            } else if (i.attr === '@generator.close') op('generator.control', 0, a, x, 1);
            else if (i.attr === '@generator.takeClosing') op('generator.control', 1, a, 0, 0);
            else if (i.attr === '@promise.pending') op('promise.pending', 7, a);
            else if (i.attr === '@promise.resolve' || i.attr === '@promise.reject') {
              let value = args[1];
              if (value === undefined) { value = types.length;types.push(0); }
              op('promise.settle', types[value], x, value, i.attr === '@promise.reject' ? 1 : 0);
            } else if (i.attr === 'queueMicrotask' && args.length === 1) op('microtask', 0, x);
            else if (i.attr === 'setTimeout' || i.attr === 'setInterval') {
              if (!args.length || args.length > 2) fail('timer arguments');
              let delay = args[1];
              if (delay === undefined) { delay = types.length;types.push(2);const k = constants.length;constants.push({ t: 2, v: 0 });op('const', 2, delay, k); }
              op('timer', i.attr === 'setInterval' ? 1 : 0, a, x, delay);
            } else if ((i.attr === 'clearTimeout' || i.attr === 'clearInterval') && args.length === 1) op('timer.cancel', types[x], x);
            else if ((i.attr === 'Promise.resolve' || i.attr === 'Promise.reject')) {
              let r = args[0];
              if (r === undefined) { r = types.length;types.push(0); }
              if (i.attr === 'Promise.reject' && types[r] !== 7) fail('non-object promise rejection');
              op('promise', 7, a, r, types[r] | (i.attr === 'Promise.reject' ? 256 : 0));
            } else if ((i.attr === 'splice' || i.attr === 'slice') && types[x] === 7 && args.length >= (i.attr === 'slice' ? 1 : 2) && args.length <= 3) {
              const base = types.length;
              for (const r of args) { const dst = types.length; types.push(types[r]); op('mov', types[r], dst, r); }
              op('splice', 7, a, base, args.length | (i.attr === 'slice' ? 256 : 0));
            } else if (types[x] === 6 && ['length', 'slice', 'substring', 'indexOf', 'lastIndexOf', 'includes', 'startsWith', 'endsWith', 'trim', 'trimStart', 'trimEnd', 'toLowerCase', 'toUpperCase', 'charAt', 'split', 'charCodeAt'].includes(i.attr!)) {
              const method = ['length', 'slice', 'substring', 'indexOf', 'lastIndexOf', 'includes', 'startsWith', 'endsWith', 'trim', 'trimStart', 'trimEnd', 'toLowerCase', 'toUpperCase', 'charAt', 'split', 'charCodeAt'].indexOf(i.attr!);
              const base = types.length;
              for (const r of args) { const dst = types.length; types.push(types[r]); op('mov', types[r], dst, r); }
              if (i.attr === 'split') op('alloc', 7, a, layout(i.t), 0);
              op('string', t, a, base, method | (args.length << 8));
            } else if (i.attr === 'join' && types[x] === 7 && args.length <= 2) {
              const array = sourceType(i.args[0]);
              if (array?.k !== 'arr' || !['str', 'bool', 'num'].includes(array.el.k)) fail('join requires scalar array elements');
              op('join', 6, a, x, args.length === 2 ? y + 1 : 0);
            } else if (i.attr === 'length' && args.length === 1 && types[x] === 7) op('length', t, a, x);
            else if (i.attr === 'push' && args.length === 2 && types[x] === 7) op('push', t, a, x, y);
            else if (i.attr === 'pop' && args.length === 1 && types[x] === 7) op('pop', t, a, x);
            else if (i.attr === 'console.log') {
              args.forEach((r, k) => { if (k) op('space'); op('print', types[r], r); }); op('newline');
            } else if (i.attr?.startsWith('Math.') && MATH.includes(i.attr.slice(5))) {
              const method = MATH.indexOf(i.attr.slice(5)), base = types.length;
              for (const r of args) { const dst = types.length; types.push(types[r]); op('mov', types[r], dst, r); }
              op('math', t, a, base, method | (args.length << 8));
            }
            else fail(`builtin ${i.attr}`);
            break;
          default: fail(i.op);
        }
      }
      const t = b.term;
      if (t.k === 'invoke') {
        const at = ins.length - 1;edge(b, t.normal);handlers.push([at, ins.length]);edge(b, t.error);
      } else if (t.k === 'throw') {
        const at = ins.length;op('throw', types[reg(t.v)], reg(t.v));
        if (t.to) { handlers.push([at, ins.length]);edge(b, t.to); }
      } else if (t.k === 'br') edge(b, t.to);
      else if (t.k === 'cbr') {
        const at = ins.length; op('branch', 1, reg(t.c));
        ins[at][3] = ins.length; edge(b, t.a);
        ins[at][4] = ins.length; edge(b, t.b);
      } else if (t.k === 'ret') {
        op('ret', f.source?.kind === 'gen' || t.v === undefined ? 0 : types[reg(t.v)], t.v === undefined ? 0 : reg(t.v));
      }
      else fail(t.k);
    }
    if (!ins.length) op('ret');
    for (const p of fix) ins[p.at][p.field] = labels.get(p.target) ?? fail('branch target');
    const captures = (f.source?.captures ?? []).map(name => {
      const found = insts.find(i => i.op === 'capture' && i.attr === name);
      if (!found) { const cap = f.source!.captureTypes!.find(c => c.name === name)!; const r = types.length; types.push(cap.cell ? 7 : type(cap.t)); return r; }
      return reg(found.id);
    });
    return { types, params, captures, ret: f.source?.kind === 'gen' ? 4096 | (type(f.source.ret.k === 'gen' ? f.source.ret.el : VOID) << 13) | 7 : f.source?.kind === 'async' ? 256 | (type(f.source.ret.k === 'promise' ? f.source.ret.el : VOID) << 9) | 7 : sig.ret, ins, handlers };
  };
  const code = fs.map(compile);
  // Only the entry module's public bindings cross the embedding boundary. Script
  // files without exports expose their top-level declarations, matching globals.
  const exported: { name: string; kind: number; index: number; writable: boolean }[] = [];
  const publish = (name: string, decl: ts.Node) => {
    const symbol = symbols.get(decl); if (!symbol) return;
    if (ts.isFunctionDeclaration(decl)) {
      const index = names.get(symbol); if (index === undefined) return;
      const f = code[index];
      // u8 shares a u32 register tag but needs boundary narrowing metadata.
      const machineByte = (t: ZT) => t.k === 'num' && t.m === 'u8';
      if (decl.parameters.some(p => machineByte(sema.paramType(p))) || machineByte(sema.retOf(decl))) return;
      if (f.ret > 6 || f.captures.length || f.params.some(p => !f.types[p] || f.types[p] > 6)) return;
      exported.push({ name, kind: 0, index, writable: false });
    } else if (ts.isVariableDeclaration(decl) || ts.isBindingElement(decl)) {
      const index = globals.get('@' + symbol);
      const sourceType = sema.declType(decl);
      if (sourceType.k === 'num' && sourceType.m === 'u8') return;
      if (index === undefined || globalTypes[index] > 6) return;
      let declarationList: ts.Node | undefined = decl.parent;
      while (declarationList && !ts.isVariableDeclarationList(declarationList)) declarationList = declarationList.parent;
      exported.push({ name, kind: 1, index, writable: !((declarationList?.flags ?? 0) & ts.NodeFlags.Const) });
    }
  };
  const entrySymbol = sema.checker.getSymbolAtLocation(sema.fe.entry);
  if (entrySymbol && ts.isExternalModule(sema.fe.entry)) {
    for (const exportedSymbol of sema.checker.getExportsOfModule(entrySymbol)) {
      const symbol = exportedSymbol.flags & ts.SymbolFlags.Alias ? sema.checker.getAliasedSymbol(exportedSymbol) : exportedSymbol;
      const decl = symbol.declarations?.find(d => ts.isFunctionDeclaration(d) && d.body) ?? symbol.valueDeclaration;
      if (decl) publish(exportedSymbol.name, decl);
    }
  } else for (const [decl, symbol] of symbols) {
    if (decl.getSourceFile() === sema.fe.entry) publish(symbol.slice(symbol.indexOf(':') + 1), decl);
  }
  const chunks: Buffer[] = [Buffer.from('ZBC4')];
  const u = (v: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); chunks.push(b); };
  u(ABI_VERSION);
  u(globalTypes.length); globalTypes.forEach(u);
  u(constants.length);
  for (const k of constants) {
    u(k.t);
    if (typeof k.v === 'string') { const b = Buffer.from(k.v); u(b.length); chunks.push(b); }
    else { const b = Buffer.alloc(8); b.writeDoubleLE(k.v); chunks.push(b); }
  }
  u(abi.exports.length);
  for (const e of abi.exports) {
    for (const s of [e.module, e.name]) { const b = Buffer.from(s); u(b.length); chunks.push(b); }
    u(e.parameters.length); e.parameters.forEach(u); u(e.result);
  }
  u(layouts.length);
  for (const l of layouts) { u(l.array ? 1 : 0); u(l.keys.length); l.keys.forEach((key, i) => { u(key); u(l.types[i]); }); u(l.methods?.length ?? 0); for (const [key, fn] of l.methods ?? []) { u(key); u(fn); } }
  u(code.length); u(names.get('<init>')!);
  for (const f of code) {
    u(f.types.length); u(f.params.length); u(f.ret); u(f.ins.length); u(f.captures.length); u(f.handlers.length);
    f.types.forEach(u); f.params.forEach(u); f.captures.forEach(u);
    for (const [op, t, a, b, c] of f.ins) {
      const x = Buffer.alloc(16); x[0] = op; x[1] = t;
      x.writeUInt32LE(a, 4); x.writeUInt32LE(b, 8); x.writeUInt32LE(c, 12); chunks.push(x);
    }
    for (const [at, target] of f.handlers) { u(at); u(target); }
  }
  u(exported.length);
  for (const e of exported) {
    const name = Buffer.from(e.name); u(name.length); chunks.push(name);
    u(e.kind); u(e.index); u(e.writable ? 1 : 0);
  }
  return Buffer.concat(chunks);
}

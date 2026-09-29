// MIR (CMP-08): HIR functions lowered to SSA over a control-flow graph (Braun et al., "Simple and Efficient
// Construction of SSA Form"), then two passes: constant folding (with branch pruning) and dead code elimination.
// ponytail: an inspection stage (--emit=mir), not the input of the C++ emitter; the C++ compiler still does the
// optimisation work (docs/decisions/0013). Exceptional CFG edges are lowered; async and generator suspension points are explicit.
// Missing passes of CMP-08: inlining, devirtualisation, ranges (number -> i32), bounds, escape, RC optimisation.
import { type ZT, BOOL, VOID, isNum, isInt } from './sema.ts';
import { type HModule, type HFunc, type HStmt, type HExpr, typeName, printExpr } from './hir.ts';

interface Inst { id: number; op: string; t: ZT; args: number[]; attr?: string; block: Block; val?: number | boolean }
type Term = { k: 'br'; to: Block } | { k: 'cbr'; c: number; a: Block; b: Block } | { k: 'ret'; v?: number } | { k: 'throw'; v: number; to?: Block } | { k: 'invoke'; normal: Block; error: Block } | { k: 'none' };
interface Block { id: number; phis: Inst[]; insts: Inst[]; term: Term; preds: Block[]; sealed: boolean }
export interface MFunc { name: string; sig: string; blocks: Block[]; note?: string; stats: string; source?: HFunc }

const PURE = new Set(['const', 'bin', 'un', 'phi', 'param', 'capture', 'undef', 'conv.num', 'concat']);

class Builder {
  blocks: Block[] = [];
  cur!: Block;
  next = 0;
  defs = new Map<string, Map<Block, number>>();
  incomplete = new Map<Block, Map<string, Inst>>();
  insts = new Map<number, Inst>();
  replacements = new Map<number, number>();
  resolved(id: number): number { while (this.replacements.has(id)) id = this.replacements.get(id)!; return id; }
  loops: { brk: Block; cont: Block }[] = [];
  lambdas: HFunc[] = [];
  conds = 0;
  expressionValues = new Map<HExpr, number>();
  handler?: Block;
  finalizers: { body: HStmt[]; handler?: Block; loopDepth: number }[] = [];

  block(): Block { const b: Block = { id: this.blocks.length, phis: [], insts: [], term: { k: 'none' }, preds: [], sealed: false }; this.blocks.push(b); return b; }
  emit(op: string, t: ZT, args: number[], attr?: string): number {
    const i: Inst = { id: this.next++, op, t, args: args.map(a => this.resolved(a)), attr, block: this.cur };
    this.cur.insts.push(i);
    this.insts.set(i.id, i);
    if (this.handler && (op.startsWith('call.') || op === 'new' || op === 'new!' || op === 'await')) {
      const previous = this.cur, normal = this.block(); normal.sealed = true;
      previous.term = { k: 'invoke', normal, error: this.handler };
      normal.preds.push(previous); this.handler.preds.push(previous); this.cur = normal;
    }
    return i.id;
  }
  jump(to: Block) { if (this.cur.term.k === 'none') { this.cur.term = { k: 'br', to }; to.preds.push(this.cur); } }
  branch(c: number, a: Block, b: Block) { this.cur.term = { k: 'cbr', c, a, b }; a.preds.push(this.cur); b.preds.push(this.cur); }

  // ---------- SSA construction ----------
  write(v: string, b: Block, val: number) { let m = this.defs.get(v); if (!m) this.defs.set(v, m = new Map()); m.set(b, this.resolved(val)); }
  read(v: string, b: Block): number {
    const d = this.defs.get(v)?.get(b);
    if (d !== undefined) return this.resolved(d);
    let val: number;
    if (!b.sealed) { const phi = this.phi(b, v); let m = this.incomplete.get(b); if (!m) this.incomplete.set(b, m = new Map()); m.set(v, phi); val = phi.id; }
    else if (b.preds.length === 1) val = this.read(v, b.preds[0]);
    else if (!b.preds.length) { const save = this.cur; this.cur = b; val = this.emit('undef', VOID, [], v); this.cur = save; b.insts.unshift(b.insts.pop()!); }
    else { const phi = this.phi(b, v); this.write(v, b, phi.id); val = this.operands(v, phi); }
    this.write(v, b, val);
    return this.resolved(val);
  }
  phi(b: Block, v: string): Inst { const i: Inst = { id: this.next++, op: 'phi', t: VOID, args: [], attr: v, block: b }; b.phis.push(i); this.insts.set(i.id, i); return i; }
  operands(v: string, phi: Inst): number {
    // read() can replace phi.args while simplifying another phi: evaluate it before taking the array receiver.
    for (const p of phi.block.preds) { const operand = this.read(v, p); phi.args.push(this.resolved(operand)); }
    phi.args = phi.args.map(a => this.resolved(a));
    phi.t = this.insts.get(phi.args.find(a => a !== phi.id) ?? -1)?.t ?? VOID;
    return this.trivial(phi);
  }
  trivial(phi: Inst): number {
    // Recursive reads may simplify this phi while one of its operands is being built.
    if (!this.insts.has(phi.id)) return this.resolved(phi.id);
    if (phi.args.length !== phi.block.preds.length) return phi.id;
    phi.args = phi.args.map(a => this.resolved(a));
    let same: number | undefined;
    for (const a of phi.args) { if (a === same || a === phi.id) continue; if (same !== undefined) return phi.id; same = a; }
    if (same === undefined) return phi.id;
    phi.block.phis = phi.block.phis.filter(p => p !== phi);
    this.insts.delete(phi.id);
    this.replace(phi.id, same);
    for (const u of [...this.insts.values()]) if (u.op === 'phi' && u.args.includes(same) && u !== phi && u.block.phis.includes(u)) this.trivial(u);
    return same;
  }
  replace(from: number, to: number) {
    to = this.resolved(to);
    this.replacements.set(from, to);
    for (const i of this.insts.values()) i.args = i.args.map(a => a === from ? to : a);
    for (const b of this.blocks) { if (b.term.k === 'cbr' && b.term.c === from) b.term.c = to; if ((b.term.k === 'ret' || b.term.k === 'throw') && b.term.v === from) b.term.v = to; }
    for (const m of this.defs.values()) for (const [k, x] of m) if (x === from) m.set(k, to);
  }
  seal(b: Block) {
    for (const [v, phi] of this.incomplete.get(b) ?? []) this.operands(v, phi);
    this.incomplete.delete(b);
    b.sealed = true;
  }

  // ---------- lowering ----------
  stmts(ss: HStmt[]) { for (const s of ss) this.stmt(s); }
  stmt(s: HStmt) {
    switch (s.k) {
      case 'let': {
        const v = s.init ? this.expr(s.init) : this.emit('undef', s.t, [], s.name);
        if (s.cell) this.write(s.name, this.cur, this.emit('cell.new', s.t, [v], s.name));
        else this.write(s.name, this.cur, v);
        return;
      }
      case 'expr': this.expr(s.e); return;
      case 'if': {
        const c = this.expr(s.c), a = this.block(), b = this.block(), j = this.block();
        this.branch(c, a, b);
        a.sealed = b.sealed = true;
        this.cur = a; this.stmts(s.then); this.jump(j);
        this.cur = b; this.stmts(s.else); this.jump(j);
        this.seal(j); this.cur = j;
        return;
      }
      case 'loop': {
        const head = this.block(), body = this.block(), step = this.block(), exit = this.block();
        this.jump(head);
        this.cur = head;
        if (s.c) this.branch(this.expr(s.c), body, exit); else this.jump(body);
        this.seal(body);
        this.loops.push({ brk: exit, cont: step });
        this.cur = body; this.stmts(s.body); this.jump(step);
        this.loops.pop();
        this.seal(step);
        this.cur = step; this.stmts(s.step); this.jump(head);
        this.seal(head); this.seal(exit);
        this.cur = exit;
        return;
      }
      case 'break': case 'continue': { this.finalize(false); const l = this.loops[this.loops.length - 1]; this.jump(s.k === 'break' ? l.brk : l.cont); this.dead(); return; }
      case 'return': { const v = s.e ? this.expr(s.e) : undefined; this.finalize(true); this.cur.term = { k: 'ret', v }; this.dead(); return; }  // expr() may move this.cur
      case 'throw': { this.raise(this.expr(s.e)); return; }
      case 'try': this.tryStmt(s); return;
      case 'opaque': this.emit('opaque', VOID, [], s.text);
    }
  }
  raise(v: number) { this.cur.term = { k: 'throw', v, to: this.handler }; this.handler?.preds.push(this.cur); this.dead(); }
  finalize(returning: boolean) {
    const saved = this.finalizers, handler = this.handler;
    for (let i = saved.length - 1; i >= 0; i--) if (returning || this.loops.length <= saved[i].loopDepth) {
      this.finalizers = saved.slice(0, i); this.handler = saved[i].handler; this.stmts(saved[i].body);
    }
    this.finalizers = saved; this.handler = handler;
  }
  tryStmt(s: Extract<HStmt, { k: 'try' }>) {
    const outer = this.handler, after = this.block(), end = this.block();
    const cleanup = s.fin.length ? this.block() : undefined;
    const caught = s.hasCatch ? this.block() : cleanup;
    this.handler = caught ?? outer;
    if (s.fin.length) this.finalizers.push({ body: s.fin, handler: outer, loopDepth: this.loops.length });
    this.stmts(s.body); this.jump(after);
    if (s.hasCatch) {
      this.seal(caught!); this.cur = caught!; this.handler = cleanup ?? outer;
      const error = this.emit('exception', s.errorType, []); if (s.bind) this.write(s.bind, this.cur, s.bindCell ? this.emit('cell.new', s.errorType, [error], s.bind) : error);
      this.stmts(s.handler); this.jump(after);
    }
    if (s.fin.length) this.finalizers.pop();
    this.handler = outer; this.seal(after); this.cur = after; this.stmts(s.fin); this.jump(end);
    if (cleanup) {
      this.seal(cleanup); this.cur = cleanup;
      const error = this.emit('exception', s.errorType, []); this.stmts(s.fin); this.raise(error);
    }
    this.seal(end); this.cur = end;
  }
  /** Code after a jump lands in a fresh block with no predecessor (removed as unreachable). */
  dead() { const b = this.block(); b.sealed = true; this.cur = b; }
  expr(h: HExpr): number {
    const cached = this.expressionValues.get(h); if (cached !== undefined) return cached;
    const E = (x: HExpr) => this.expr(x);
    switch (h.k) {
      case 'lit': { const id = this.emit('const', h.t, [], h.v); const i = this.insts.get(id)!; i.val = h.v === 'true' ? true : h.v === 'false' ? false : isNum(h.t) ? Number(h.v) : undefined; return id; }
      case 'var':
        if (h.global) return this.emit('load', h.t, [], '@' + h.name);
        if (h.cell) return this.emit('cell.load', h.t, [this.read(h.name, this.cur)], h.name);
        return this.read(h.name, this.cur);
      case 'field': return this.emit('field.get', h.t, [E(h.obj)], h.name);
      case 'index': return this.emit('index.get', h.t, [E(h.obj), E(h.idx)]);
      case 'call': return this.emit(`call.${h.how}${h.check ? '!' : ''}`, h.t, [...(h.recv ? [E(h.recv)] : []), ...h.args.map(E)], h.fn);
      case 'new': return this.emit(`new${h.check ? '!' : ''}`, h.t, h.args.map(E), h.cls);
      case 'bin': return this.emit('bin', h.t, [E(h.l), E(h.r)], h.op);
      case 'un': return this.emit('un', h.t, [E(h.e)], h.op);
      case 'conv': return this.emit(`conv.${h.how}`, h.t, [E(h.e)], `${typeName(h.e.t)}->${typeName(h.t)}`);
      case 'dyn': return this.emit(`dyn.${h.op}`, h.t, h.args.map(E));
      case 'concat': return this.emit('concat', h.t, h.parts.map(E));
      case 'alloc': return this.emit(`alloc.${h.what}`, h.t, h.items.map(i => E(i.v)), h.items.map(i => i.name ?? '_').join(','));
      case 'lambda': this.lambdas.push(h.fn); return this.emit('closure', h.t, h.fn.captures.map(c => this.read(c, this.cur)), `${h.fn.name}#${this.lambdas.length}[${h.fn.captures.join(',')}]`);
      case 'seq': this.stmts(h.body); return E(h.value);
      case 'suspend': return this.emit(h.what, h.t, [E(h.e)], `#${h.state}`);
      case 'opaque': return this.emit('opaque', h.t, [], h.text);
      case 'cond': {
        const tmp = `%cond${this.conds++}`;
        const c = E(h.c), a = this.block(), b = this.block(), j = this.block();
        this.branch(c, a, b);
        a.sealed = b.sealed = true;
        this.cur = a; this.write(tmp, a, E(h.a)); this.jump(j);
        this.cur = b; this.write(tmp, this.cur, E(h.b)); this.jump(j);
        this.seal(j); this.cur = j;
        return this.read(tmp, j);
      }
      case 'assign': {
        const t = h.target;
        // Evaluate a field/index receiver once, before the RHS; compound updates reuse its old value.
        const obj = t.k === 'field' || t.k === 'index' ? E(t.obj) : undefined;
        const index = t.k === 'index' ? E(t.idx) : undefined;
        const needsOld = h.post || (h.v.k === 'bin' && h.v.l === t);
        const old = needsOld ? t.k === 'field' ? this.emit('field.get', t.t, [obj!], t.name)
          : t.k === 'index' ? this.emit('index.get', t.t, [obj!, index!]) : E(t) : -1;
        if (needsOld) this.expressionValues.set(t, old);
        const v = E(h.v);
        this.expressionValues.delete(t);
        if (t.k === 'var' && t.global) this.emit('store', t.t, [v], '@' + t.name);
        else if (t.k === 'var' && t.cell) this.emit('cell.store', t.t, [this.read(t.name, this.cur), v], t.name);
        else if (t.k === 'var') this.write(t.name, this.cur, v);
        else if (t.k === 'field') this.emit('field.set', t.t, [obj!, v], t.name);
        else if (t.k === 'index') this.emit('index.set', t.t, [obj!, index!, v]);
        else this.emit('opaque', t.t, [v], `assign to ${printExpr(t)}`);
        return h.post ? old : v;
      }
    }
  }
}

export function lowerFn(f: HFunc, name: string, out: MFunc[], method = false) {
  const sig = `(${f.params.map(p => `${p.name}: ${typeName(p.t)}`).join(', ')}): ${typeName(f.ret)}`;
  const b = new Builder();
  b.cur = b.block(); b.cur.sealed = true;
  for (const p of f.params) { const v = b.emit('param', p.t, [], p.name); b.write(p.name, b.cur, p.cell ? b.emit('cell.new', p.t, [v], p.name) : v); }
  if (method) b.write('this', b.cur, b.emit('param', VOID, [], 'this'));
  for (const c of f.captures) b.write(c, b.cur, b.emit('capture', VOID, [], c));
  b.stmts(f.body);
  if (b.cur.term.k === 'none') b.cur.term = { k: 'ret' };
  const stats = optimize(b);
  out.push({ name, sig, blocks: b.blocks, stats, source: f });
  b.lambdas.forEach((l, i) => lowerFn(l, `${name}::${l.name}#${i + 1}`, out));
}

// ---------- passes ----------
function fold(i: Inst, x: Inst[]): number | boolean | undefined {
  const [a, b] = x.map(y => y.val);
  if (i.op === 'un' && x[0].op === 'const') {
    if (i.attr === '!' && typeof a === 'boolean') return !a;
    if (i.attr === '-' && typeof a === 'number' && isNum(i.t) && (i.t.m === 'f64' || isInt(i.t.m))) return -a;
    return undefined;
  }
  if (i.op !== 'bin' || x.length !== 2 || x.some(y => y.op !== 'const' || y.val === undefined)) return undefined;
  if (typeof a === 'boolean' || typeof b === 'boolean') return i.attr === '==' ? a === b : i.attr === '!=' ? a !== b : undefined;
  const p = a as number, q = b as number;
  const cmp: Record<string, boolean> = { '<': p < q, '>': p > q, '<=': p <= q, '>=': p >= q, '==': p === q, '!=': p !== q };
  if (i.attr! in cmp && i.t.k === 'bool') return cmp[i.attr!];
  if (!isNum(i.t)) return undefined;
  const m = i.t.m;
  const r = ({ '+': p + q, '-': p - q, '*': p * q, '/': q === 0 && isInt(m) ? NaN : p / q, '%': p % q, '&': p & q, '|': p | q, '^': p ^ q, '<<': p << q, '>>': p >> q, '>>>': p >>> q } as Record<string, number>)[i.attr!];
  if (r === undefined || Number.isNaN(r)) return undefined;
  if (m === 'f64') return r;
  if (m === 'i32') return i.attr === '*' ? Math.imul(p, q) : i.attr === '/' ? undefined : r | 0;  // i32 division is checked at run time
  if (m === 'u32') return r >>> 0;
  if (m === 'f32') return Math.fround(r);
  return undefined;  // ponytail: fixed point and 64-bit kinds are not folded
}
function optimize(b: Builder): string {
  // Loop and exceptional back edges can seal a phi before its input phi has a type.
  const phiUsers = new Map<number, Inst[]>();
  for (const i of b.insts.values()) if (i.op === 'phi') for (const a of i.args) {
    const users = phiUsers.get(a) ?? [];users.push(i);phiUsers.set(a, users);
  }
  const typed = [...b.insts.values()].filter(i => i.t.k !== 'void');
  for (let n = 0; n < typed.length; n++) for (const phi of phiUsers.get(typed[n].id) ?? []) {
    if (phi.t.k === 'void') { phi.t = typed[n].t;typed.push(phi); }
  }
  let folded = 0, pruned = 0;
  const entry = b.blocks[0];
  for (let changed = true; changed;) {
    changed = false;
    for (const i of b.insts.values()) {
      if (i.op !== 'bin' && i.op !== 'un') continue;
      const v = fold(i, i.args.map(a => b.insts.get(a)!).filter(Boolean));
      if (v === undefined) continue;
      i.op = 'const'; i.args = []; i.val = v; i.attr = String(v); folded++; changed = true;
    }
    for (const bl of b.blocks) {
      const t = bl.term;
      if (t.k !== 'cbr') continue;
      const c = b.insts.get(t.c);
      if (c?.op !== 'const' || typeof c.val !== 'boolean') continue;
      const [keep, drop] = c.val ? [t.a, t.b] : [t.b, t.a];
      if (keep !== drop) { const k = drop.preds.indexOf(bl); drop.preds.splice(k, 1); for (const p of drop.phis) p.args.splice(k, 1); }
      bl.term = { k: 'br', to: keep };
      pruned++; changed = true;
    }
  }
  // unreachable blocks
  const live = new Set<Block>();
  const succ = (x: Block) => x.term.k === 'br' ? [x.term.to] : x.term.k === 'cbr' ? [x.term.a, x.term.b] : x.term.k === 'invoke' ? [x.term.normal, x.term.error] : x.term.k === 'throw' && x.term.to ? [x.term.to] : [];
  const walk = (x: Block) => { if (live.has(x)) return; live.add(x); succ(x).forEach(walk); };
  walk(entry);
  for (const bl of b.blocks) if (!live.has(bl)) for (const s of succ(bl)) if (live.has(s)) {
    const k = s.preds.indexOf(bl); s.preds.splice(k, 1); for (const p of s.phis) p.args.splice(k, 1);
  }
  b.blocks = b.blocks.filter(x => live.has(x));
  for (const bl of b.blocks) for (const p of [...bl.phis]) if (bl.phis.includes(p)) b.trivial(p);
  // straight-line merge: a block whose only successor has it as only predecessor
  let merged = 0;
  for (const bl of [...b.blocks]) {
    if (!b.blocks.includes(bl)) continue;
    for (let t = bl.term; t.k === 'br' && t.to !== bl && t.to.preds.length === 1 && !t.to.phis.length; t = bl.term) {
      const nx = t.to;
      for (const i of nx.insts) i.block = bl;
      bl.insts.push(...nx.insts);
      bl.term = nx.term;
      for (const s2 of succ(nx)) s2.preds = s2.preds.map(p => p === nx ? bl : p);
      b.blocks = b.blocks.filter(x => x !== nx);
      merged++;
    }
  }
  // dead code: pure instructions nobody uses
  let removed = 0;
  for (let changed = true; changed;) {
    changed = false;
    const used = new Set<number>();
    for (const bl of b.blocks) {
      for (const i of [...bl.phis, ...bl.insts]) i.args.forEach(a => used.add(a));
      const t = bl.term;
      if (t.k === 'cbr') used.add(t.c);
      if ((t.k === 'ret' || t.k === 'throw') && t.v !== undefined) used.add(t.v);
    }
    for (const bl of b.blocks) {
      const keep = (i: Inst) => used.has(i.id) || !PURE.has(i.op.startsWith('conv.num') ? 'conv.num' : i.op) || i.op === 'param';
      const n = bl.insts.length + bl.phis.length;
      bl.insts = bl.insts.filter(keep); bl.phis = bl.phis.filter(keep);
      if (bl.insts.length + bl.phis.length !== n) { removed += n - bl.insts.length - bl.phis.length; changed = true; }
    }
  }
  return `${b.blocks.length} block${b.blocks.length === 1 ? '' : 's'}; fold ${folded}, branches pruned ${pruned}, blocks merged ${merged}, dce ${removed}`;
}

export function lowerMir(ms: HModule[]): { file: string; fns: MFunc[] }[] {
  return ms.map(m => {
    const fns: MFunc[] = [];
    for (const f of m.fns) lowerFn(f, f.name, fns);
    for (const c of m.classes) for (const f of c.methods) lowerFn(f, `${c.name}.${f.name}`, fns, true);
    if (m.init.length) lowerFn({ name: '<init>', params: [], ret: VOID, body: m.init, throws: false, kind: 'fn', captures: [] }, '<init>', fns);
    return { file: m.file, fns };
  });
}

export function printMir(mods: { file: string; fns: MFunc[] }[]): string {
  const out: string[] = [];
  const v = (id: number) => `%${id}`;
  for (const m of mods) {
    out.push(`module ${m.file}`);
    for (const f of m.fns) {
      out.push(`  fn ${f.name}${f.sig}${f.note ? `  ; ${f.note}` : `  ; ${f.stats}`}`);
      for (const b of f.blocks) {
        out.push(`  bb${b.id}:${b.preds.length ? `  ; preds ${b.preds.map(p => 'bb' + p.id).join(', ')}` : ''}`);
        for (const p of b.phis) out.push(`    ${v(p.id)} = phi ${p.args.map((a, k) => `[bb${b.preds[k]?.id} ${v(a)}]`).join(' ')} : ${typeName(p.t)}  ; ${p.attr}`);
        for (const i of b.insts) {
          const rhs = i.op === 'const' ? `const ${i.attr}` : `${i.op}${i.attr !== undefined ? ` ${i.attr}` : ''}${i.args.length ? ' ' + i.args.map(v).join(', ') : ''}`;
          out.push(`    ${v(i.id)} = ${rhs} : ${typeName(i.t)}`);
        }
        const t = b.term;
        out.push(`    ${t.k === 'br' ? `br bb${t.to.id}` : t.k === 'cbr' ? `br ${v(t.c)} ? bb${t.a.id} : bb${t.b.id}` : t.k === 'ret' ? `ret${t.v !== undefined ? ' ' + v(t.v) : ''}` : t.k === 'invoke' ? `invoke -> bb${t.normal.id} catch bb${t.error.id}` : t.k === 'throw' ? `throw ${v(t.v)}${t.to ? ' catch bb' + t.to.id : ''}` : 'unreachable'}`);
      }
    }
  }
  return out.join('\n') + '\n';
}
void BOOL;

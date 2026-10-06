#include "frontend/modules.h"

#include <cstdio>
#include <cstdlib>
#include <map>

#include "frontend/desugar.h"
#include "frontend/diagnostics.h"
#include "frontend/dyn.h"
#include "frontend/inspect.h"
#include "frontend/parser.h"

namespace zn::frontend {
namespace {

std::string dirOf(const std::string& p) {
  std::size_t s = p.rfind('/');
  return s == std::string::npos ? "" : p.substr(0, s);
}

// "a/b/../c/./d" -> "a/c/d"
std::string normalize(const std::string& p) {
  std::vector<std::string> parts;
  std::size_t i = 0;
  bool abs = !p.empty() && p[0] == '/';
  while (i <= p.size()) {
    std::size_t j = p.find('/', i);
    if (j == std::string::npos) j = p.size();
    std::string seg = p.substr(i, j - i);
    if (seg == "..") { if (!parts.empty() && parts.back() != "..") parts.pop_back(); else if (!abs) parts.push_back(seg); }
    else if (!seg.empty() && seg != ".") parts.push_back(seg);
    i = j + 1;
  }
  std::string r = abs ? "/" : "";
  for (std::size_t k = 0; k < parts.size(); ++k) r += (k ? "/" : "") + parts[k];
  return r;
}

struct Loader {
  Program& prog;
  const ReadFile& read;
  std::map<std::string, std::uint32_t> done;   // path -> module index
  std::map<std::string, bool> visiting;
  std::vector<std::uint32_t> flat;             // the program's statements in module order

  Loader(Program& p, const ReadFile& r) : prog(p), read(r) {}

  void diag(const char* code, std::uint32_t file, std::uint32_t node, std::string detail) {
    prog.diags.push_back({code, node == kNone ? 0 : prog.ast.nodes[node].start, std::move(detail), file});
  }

  // The module index for an import of `spec` (with quotes) from file `fromFile`, loading it first; kNone on error.
  std::uint32_t resolve(std::uint32_t fromFile, std::uint32_t node, std::string_view quoted) {
    std::string spec(quoted.substr(1, quoted.size() - 2));
    if (spec.rfind("./", 0) != 0 && spec.rfind("../", 0) != 0) { diag(kZUnsupported, fromFile, node, "package imports ('" + spec + "')"); return kNone; }
    std::string base = normalize(dirOf(prog.files[fromFile].path) + (dirOf(prog.files[fromFile].path).empty() ? "" : "/") + spec);
    std::string text;
    for (const char* ext : {"", ".ts", ".tsx", "/index.ts"}) {
      std::string cand = base + ext;
      if (done.count(cand)) return done[cand];
      if (visiting.count(cand)) { diag(kZUnsupported, fromFile, node, "circular imports ('" + spec + "')"); return kNone; }
      if (read(cand, text)) return load(cand, std::move(text));
    }
    diag(kZModuleNotFound, fromFile, node, "'" + spec + "'");
    return kNone;
  }

  std::uint32_t load(const std::string& path, std::string text) {
    auto fi = static_cast<std::uint32_t>(prog.files.size());
    prog.files.push_back({path, std::move(text)});
    visiting[path] = true;
    ParseResult pr = parse(prog.files[fi].text);
    for (Diag& d : pr.diags) { d.file = fi; prog.diags.push_back(d); }
    std::uint32_t result = kNone;
    if (pr.ast.root != kNone && pr.diags.empty()) {
      Ast& A = prog.ast;
      auto off = static_cast<std::uint32_t>(A.nodes.size());
      for (Node& n : pr.ast.nodes) {
        n.file = fi;
        for (std::uint32_t& k : n.kids) if (k != kNone) k += off;
        A.nodes.push_back(std::move(n));
      }
      for (auto& [k, v] : pr.ast.tparams) { auto& d = A.tparams[k + off]; for (std::uint32_t x : v) d.push_back(x + off); }
      for (auto& [k, v] : pr.ast.targs) { auto& d = A.targs[k + off]; for (std::uint32_t x : v) d.push_back(x + off); }
      ModuleInfo mod;
      mod.path = path;
      mod.file = fi;
      for (std::uint32_t st : std::vector<std::uint32_t>(A.nodes[pr.ast.root + off].kids)) {
        const Node& x = A.nodes[st];
        switch (x.kind) {
          case N::Import: {
            std::uint32_t from = resolve(fi, st, x.text);
            if (from == kNone) break;
            for (std::uint32_t sp : std::vector<std::uint32_t>(x.kids)) mod.imports.push_back({from, A.nodes[sp].text, A.nodes[A.nodes[sp].kids[0]].text, sp});
            break;
          }
          case N::ExportAll: {
            std::uint32_t from = resolve(fi, st, x.text);
            if (from != kNone) mod.exports.push_back({{}, {}, from, true, st});
            break;
          }
          case N::ExportList: {
            std::uint32_t from = kNone;
            if (!x.text.empty()) { from = resolve(fi, st, x.text); if (from == kNone) break; }
            for (std::uint32_t sp : std::vector<std::uint32_t>(x.kids)) mod.exports.push_back({A.nodes[A.nodes[sp].kids[0]].text, A.nodes[sp].text, from, false, sp});
            break;
          }
          case N::Export: {
            std::uint32_t d = x.kids[0];
            const Node& dn = A.nodes[d];
            if (dn.kind == N::VarDecl) {
              for (std::uint32_t dc : std::vector<std::uint32_t>(dn.kids)) {
                if (A.nodes[dc].text.empty()) { diag(kZUnsupported, fi, dc, "export of a destructuring declaration"); continue; }
                mod.exports.push_back({A.nodes[dc].text, A.nodes[dc].text, kNone, false, dc});
              }
            } else mod.exports.push_back({dn.text, dn.text, kNone, false, d});
            mod.stmts.push_back(d);
            break;
          }
          default: mod.stmts.push_back(st);
        }
      }
      result = static_cast<std::uint32_t>(A.modules.size());
      for (std::uint32_t st : mod.stmts) flat.push_back(st);
      A.modules.push_back(std::move(mod));
    }
    visiting.erase(path);
    done[path] = result;
    return result;
  }
};

// The built-in classes of exceptions, written in Zinc and added when a program throws, catches or mentions them.
const char* kErrorPrelude = R"ZN(
class Error {
  message: string;
  name: string = 'Error';
  constructor(message: string) { this.message = message; }
  __errorString(): string { return this.message === '' ? this.name : this.name + ': ' + this.message; }
}
class TypeError extends Error { constructor(message: string) { super(message); this.name = 'TypeError'; } }
class RangeError extends Error { constructor(message: string) { super(message); this.name = 'RangeError'; } }
class SyntaxError extends Error { constructor(message: string) { super(message); this.name = 'SyntaxError'; } }
)ZN";

// Promises, timers and the microtask queue, written in Zinc: added when a program uses async functions, generators, Promise,
// setTimeout or queueMicrotask. Its top-level code (the queues) runs before the program; `__runLoop()` runs after it.
const char* kAsyncPrelude = R"ZN(
abstract class Job { abstract run(): void; }
class FnJob extends Job {
  constructor(public f: () => void) { super(); }
  run(): void { this.f(); }
}
class Timer {
  constructor(public at: f64, public seq: i32, public id: i32, public every: f64, public f: () => void) {}
}
let __jobs: Job[] = [];
let __jobHead: i32 = 0;
let __timers: Timer[] = [];
let __clock: f64 = 0;
let __timerSeq: i32 = 0;

function __enqueue(j: Job): void { __jobs.push(j); }
function queueMicrotask(f: () => void): void { __jobs.push(new FnJob(f)); }
let __cancelled: i32[] = [];
let __ids: i32 = 0;
function __addTimer(f: () => void, ms: f64, every: f64): i32 {
  __timerSeq++;
  __ids++;
  __timers.push(new Timer(__clock + (ms > 0 ? ms : 0), __timerSeq, __ids, every, f));
  return __ids;
}
function setTimeout(f: () => void, ms: f64): i32 { return __addTimer(f, ms, 0); }
function setInterval(f: () => void, ms: f64): i32 { return __addTimer(f, ms, ms > 1 ? ms : 1); }
function clearTimeout(id: i32): void {
  __cancelled.push(id);
  __timers = __timers.filter(t => t.id !== id);
}
function clearInterval(id: i32): void { clearTimeout(id); }
// Deterministic time: the clock only moves when the event loop jumps to the next timer.
class Date { static now(): f64 { return __clock; } }
class Performance { now(): f64 { return __clock; } }
const performance = new Performance();
function __drainJobs(): void {
  while (__jobHead < __jobs.length) {
    const j = __jobs[__jobHead];
    __jobHead++;
    j.run();
  }
  __jobs = [];
  __jobHead = 0;
}
function __runLoop(): void {
  __drainJobs();
  while (__timers.length > 0) {
    let best: i32 = 0;
    for (let i: i32 = 1; i < __timers.length; i++) {
      const a = __timers[i];
      const b = __timers[best];
      if (a.at < b.at || (a.at === b.at && a.seq < b.seq)) best = i;
    }
    const t = __timers[best];
    const rest: Timer[] = [];
    for (let i: i32 = 0; i < __timers.length; i++) if (i !== best) rest.push(__timers[i]);
    __timers = rest;
    if (t.at > __clock) __clock = t.at;
    t.f();
    if (t.every > 0 && __cancelled.indexOf(t.id) < 0) {
      __timerSeq++;
      __timers.push(new Timer(t.at + t.every, __timerSeq, t.id, t.every, t.f));
    }
    __drainJobs();
  }
}

class PromiseBase {
  state: i32 = 0;
  error: Error | null = null;
  waiters: Job[] = [];
  subscribe(j: Job): void {
    if (this.state === 0) this.waiters.push(j); else __enqueue(j);
  }
  settle(): void {
    for (const w of this.waiters) __enqueue(w);
    this.waiters = [];
  }
  rejectWith(e: Error): void {
    if (this.state !== 0) return;
    this.state = 2;
    this.error = e;
    this.settle();
  }
}
class Promise<T> extends PromiseBase {
  value: T[] = [];
  constructor(executor: (resolve: (value: T) => void) => void) {
    super();
    executor((v: T) => { this.resolveWith(v); });
  }
  resolveWith(v: T): void {
    if (this.state !== 0) return;
    this.state = 1;
    this.value = [v];
    this.settle();
  }
}

class PromiseV extends PromiseBase {
  constructor(executor: (resolve: () => void) => void) {
    super();
    executor(() => { this.resolveWith(); });
  }
  resolveWith(): void {
    if (this.state !== 0) return;
    this.state = 1;
    this.settle();
  }
}
class AwaitJob<T> extends Job {
  constructor(public p: Promise<T>, public k: (v: T) => void, public rej: (e: Error) => void) { super(); }
  run(): void {
    const err = this.p.error;
    if (err !== null) this.rej(err); else this.k(this.p.value[0]);
  }
}
function __await<T>(p: Promise<T>, k: (v: T) => void, rej: (e: Error) => void): void { p.subscribe(new AwaitJob<T>(p, k, rej)); }
class AwaitJobV extends Job {
  constructor(public p: PromiseV, public k: (v: i32) => void, public rej: (e: Error) => void) { super(); }
  run(): void {
    const err = this.p.error;
    if (err !== null) this.rej(err); else this.k(0);
  }
}
function __awaitV(p: PromiseV, k: (v: i32) => void, rej: (e: Error) => void): void { p.subscribe(new AwaitJobV(p, k, rej)); }

// Generators run as continuations: `cont` is the rest of the body, `next` runs it until it yields a value or ends.
class Generator<T> {
  done: boolean = false;
  value: T[] = [];
  cont: () => void = () => { };
  onClose: (() => void)[] = [];
  close(): void {  // abandon the generator: its continuation no longer holds it, and the loops it was in let go of themselves
    this.done = true;
    this.cont = () => { };
    const fs = this.onClose;
    this.onClose = [];
    for (const f of fs) f();
  }
  next(): boolean {
    this.value = [];
    while (!this.done && this.value.length === 0) {
      const c = this.cont;
      this.cont = () => { this.done = true; };
      c();
    }
    return this.value.length > 0;
  }
}
function __newPromise<T>(): Promise<T> { return new Promise<T>(r => { }); }
function __newPromiseV(): PromiseV { return new PromiseV(r => { }); }

// then: four flavours, by whether the promise and the callback result carry a value
class ThenJob<T, U> extends Job {
  constructor(public p: Promise<T>, public f: (v: T) => U, public r: Promise<U>) { super(); }
  run(): void {
    const err = this.p.error;
    if (err !== null) { this.r.rejectWith(err); return; }
    try { this.r.resolveWith(this.f(this.p.value[0])); } catch (e) { this.r.rejectWith(e); }
  }
}
function __then<T, U>(p: Promise<T>, f: (v: T) => U): Promise<U> {
  const r = __newPromise<U>();
  p.subscribe(new ThenJob<T, U>(p, f, r));
  return r;
}
class ThenJobV<T> extends Job {
  constructor(public p: Promise<T>, public f: (v: T) => void, public r: PromiseV) { super(); }
  run(): void {
    const err = this.p.error;
    if (err !== null) { this.r.rejectWith(err); return; }
    try { this.f(this.p.value[0]); this.r.resolveWith(); } catch (e) { this.r.rejectWith(e); }
  }
}
function __thenV<T>(p: Promise<T>, f: (v: T) => void): PromiseV {
  const r = __newPromiseV();
  p.subscribe(new ThenJobV<T>(p, f, r));
  return r;
}
class ThenJobFromV<U> extends Job {
  constructor(public p: PromiseV, public f: () => U, public r: Promise<U>) { super(); }
  run(): void {
    const err = this.p.error;
    if (err !== null) { this.r.rejectWith(err); return; }
    try { this.r.resolveWith(this.f()); } catch (e) { this.r.rejectWith(e); }
  }
}
function __thenFromV<U>(p: PromiseV, f: () => U): Promise<U> {
  const r = __newPromise<U>();
  p.subscribe(new ThenJobFromV<U>(p, f, r));
  return r;
}
class ThenJobVV extends Job {
  constructor(public p: PromiseV, public f: () => void, public r: PromiseV) { super(); }
  run(): void {
    const err = this.p.error;
    if (err !== null) { this.r.rejectWith(err); return; }
    try { this.f(); this.r.resolveWith(); } catch (e) { this.r.rejectWith(e); }
  }
}
function __thenVV(p: PromiseV, f: () => void): PromiseV {
  const r = __newPromiseV();
  p.subscribe(new ThenJobVV(p, f, r));
  return r;
}

// catch
class CatchJob<T> extends Job {
  constructor(public p: Promise<T>, public f: (e: Error) => T, public r: Promise<T>) { super(); }
  run(): void {
    const err = this.p.error;
    if (err === null) { this.r.resolveWith(this.p.value[0]); return; }
    try { this.r.resolveWith(this.f(err)); } catch (e) { this.r.rejectWith(e); }
  }
}
function __catch<T>(p: Promise<T>, f: (e: Error) => T): Promise<T> {
  const r = __newPromise<T>();
  p.subscribe(new CatchJob<T>(p, f, r));
  return r;
}
class CatchJobV extends Job {
  constructor(public p: PromiseV, public f: (e: Error) => void, public r: PromiseV) { super(); }
  run(): void {
    const err = this.p.error;
    if (err === null) { this.r.resolveWith(); return; }
    try { this.f(err); this.r.resolveWith(); } catch (e) { this.r.rejectWith(e); }
  }
}
function __catchV(p: PromiseV, f: (e: Error) => void): PromiseV {
  const r = __newPromiseV();
  p.subscribe(new CatchJobV(p, f, r));
  return r;
}

function __resolved<T>(v: T): Promise<T> {
  const p = __newPromise<T>();
  p.resolveWith(v);
  return p;
}
function __resolvedV(): PromiseV {
  const p = __newPromiseV();
  p.resolveWith();
  return p;
}

// all
class AllJob<T> extends Job {
  constructor(public p: Promise<T>, public all: AllState<T>) { super(); }
  run(): void {
    const err = this.p.error;
    if (err !== null) { this.all.result.rejectWith(err); return; }
    this.all.left--;
    if (this.all.left === 0) {
      const out: T[] = [];
      for (const q of this.all.items) out.push(q.value[0]);
      this.all.result.resolveWith(out);
    }
  }
}
class AllState<T> {
  left: i32 = 0;
  items: Promise<T>[] = [];
  result: Promise<T[]> = __newPromise<T[]>();
}
function __all<T>(ps: Promise<T>[]): Promise<T[]> {
  const st = new AllState<T>();
  st.items = ps;
  st.left = ps.length;
  if (ps.length === 0) { st.result.resolveWith([]); return st.result; }
  for (const p of ps) p.subscribe(new AllJob<T>(p, st));
  return st.result;
}
)ZN";

// Arenas hold per-frame memory in the AOT runtime; here an arena is a scope marker that releases nothing.
const char* kArenaPrelude = R"ZN(
class Arena {
  static frame(size: i32): Arena { return new Arena(); }
  [Symbol.dispose](): void {}
}
)ZN";

bool needsAsync(const Ast& A) {
  for (const Node& x : A.nodes) {
    if (x.kind == N::Await || x.kind == N::Yield) return true;
    if ((x.kind == N::Function || x.kind == N::FuncExpr || x.kind == N::Method) && (x.flags & (kFlagAsync | kFlagGenerator))) return true;
    if ((x.kind == N::Ident || x.kind == N::TypeRef) && (x.text == "Promise" || x.text == "queueMicrotask" || x.text == "setTimeout" || x.text == "clearTimeout" || x.text == "setInterval" || x.text == "clearInterval" || x.text == "Date" || x.text == "performance" || x.text == "Generator")) return true;
  }
  return false;
}

bool needsArena(const Ast& A) {
  for (const Node& x : A.nodes) if (x.kind == N::Ident && x.text == "Arena") return true;
  return false;
}

// Dyn: `any`, `unknown`, `undefined` and JSON.parse bring the classes and helpers of dyn.cpp (with the console.log and JSON helpers they use).
bool needsJson(const Ast& A) {
  for (const Node& x : A.nodes) {
    if ((x.kind == N::TypeRef && (x.text == "any" || x.text == "unknown")) || (x.kind == N::Ident && x.text == "undefined")) return true;
    if (x.kind == N::Member && x.text == "parse" && A.nodes[x.kids[0]].kind == N::Ident && A.nodes[x.kids[0]].text == "JSON") return true;
  }
  return false;
}

bool needsErrors(const Ast& A) {
  for (const Node& x : A.nodes) {
    if (x.kind == N::Try || x.kind == N::Throw || (x.kind == N::VarDecl && x.text == "using")) return true;
    if ((x.kind == N::Ident || x.kind == N::TypeRef) && (x.text == "Error" || x.text == "TypeError" || x.text == "RangeError")) return true;
  }
  return false;
}

}  // namespace

Program loadProgram(const std::string& entry, const ReadFile& read, bool strict) {
  Program p;
  std::string text;
  if (!read(entry, text)) { p.files.push_back({entry, ""}); p.diags.push_back({kZUnexpectedToken, 0, "cannot read " + entry, 0}); return p; }
  p.ast.strict = strict || text.substr(0, 400).find("zinc-profile: strict") != std::string::npos;
  Loader L(p, read);
  L.load(entry, std::move(text));
  bool async = p.diags.empty() && needsAsync(p.ast);
  bool json = p.diags.empty() && needsJson(p.ast);
  bool arena = p.diags.empty() && needsArena(p.ast);
  if (async) desugarAsync(p.ast, p.diags);
  if (!p.diags.empty()) return p;
  if (p.diags.empty() && (async || json || arena || needsErrors(p.ast))) {
    auto fi = static_cast<std::uint32_t>(p.files.size());
    p.files.push_back({"<prelude>", std::string(kErrorPrelude) + (async ? kAsyncPrelude : "") + (json ? std::string(inspectPrelude()) + jsonPrelude() + dynPrelude() : std::string()) + (arena ? kArenaPrelude : "")});
    ParseResult pr = parse(p.files[fi].text);
    if (pr.ast.root != kNone && pr.diags.empty()) {
      auto off = static_cast<std::uint32_t>(p.ast.nodes.size());
      for (Node& nd : pr.ast.nodes) {
        for (std::uint32_t& k : nd.kids) if (k != kNone) k += off;
        nd.file = fi;
        p.ast.nodes.push_back(std::move(nd));
      }
      for (auto& [k, v] : pr.ast.tparams) { auto& d = p.ast.tparams[k + off]; for (std::uint32_t x : v) d.push_back(x + off); }
      for (auto& [k, v] : pr.ast.targs) { auto& d = p.ast.targs[k + off]; for (std::uint32_t x : v) d.push_back(x + off); }
      p.ast.prelude = p.ast.nodes[pr.ast.root + off].kids;
      L.flat.insert(L.flat.begin(), p.ast.prelude.begin(), p.ast.prelude.end());
    }
  }
  if (async && !L.flat.empty()) {  // run the event loop once the program's own statements are done
    p.ast.generated.push_back("__runLoop();");
    ParseResult pr = parse(p.ast.generated.back());
    if (pr.ast.root != kNone && pr.diags.empty()) {
      auto off = static_cast<std::uint32_t>(p.ast.nodes.size());
      for (Node& nd : pr.ast.nodes) {
        for (std::uint32_t& k : nd.kids) if (k != kNone) k += off;
        nd.file = 0; nd.start = nd.end = 0;
        p.ast.nodes.push_back(std::move(nd));
      }
      std::uint32_t call = p.ast.nodes[pr.ast.root + off].kids[0];
      L.flat.push_back(call);
      if (!p.ast.modules.empty()) p.ast.modules.back().stmts.push_back(call);
    }
  }
  Node root{N::Program, 0, 0, {}, L.flat, 0, 0};
  p.ast.nodes.push_back(std::move(root));
  p.ast.root = static_cast<std::uint32_t>(p.ast.nodes.size() - 1);
  if (std::getenv("ZN_DUMP_AST")) std::fputs(dump(p.ast).c_str(), stderr);
  return p;
}

std::string formatDiag(const Program& p, const Diag& d) {
  const SourceFile& f = p.files[d.file < p.files.size() ? d.file : 0];
  return format(d, f.text, f.path);
}

}  // namespace zn::frontend

#include "dbg/dbg.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <iostream>
#include <unistd.h>

namespace zn::dbg {

using rt::Slot;

Debugger::Debugger(const zbc::Module& mod, std::vector<std::string> sources) : mod_(mod), sources_(std::move(sources)) {}

void Debugger::attach(rt::Machine& m) {
  m_ = &m;
  m.debugHook = hook;
  m.throwHook = throwHook;
  m.debugCtx = this;
  arm();
}

bool Debugger::hook(rt::Machine& m, const rt::Func* fn, const std::uint32_t* pc, Slot* base, std::uint32_t line) {
  return static_cast<Debugger*>(m.debugCtx)->onLine(fn, pc, base, line);
}
bool Debugger::throwHook(rt::Machine& m, const rt::Func* fn, const std::uint32_t* pc, Slot* base, Slot exc) {
  return static_cast<Debugger*>(m.debugCtx)->onThrow(fn, pc, base, exc);
}

void Debugger::setExceptionPause(int mode) {
  std::lock_guard<std::mutex> lock(mu_);
  excMode_ = mode;
}

bool Debugger::onThrow(const rt::Func* fn, const std::uint32_t* pc, Slot* base, Slot exc) {
  int mode;
  { std::lock_guard<std::mutex> lock(mu_); mode = excMode_; }
  if (mode == 0) return true;
  const rt::Obj* o = reinterpret_cast<const rt::Obj*>(exc);
  bool caught = false;   // the interpreter's unwinding, without unwinding: a handler of this frame or a caller's call that takes it
  const rt::Func* f = fn;
  const std::uint32_t* at = pc;
  for (rt::Frame* fp = m_->fp;;) {
    const std::uint32_t idx = static_cast<std::uint32_t>(at - f->code);
    for (std::uint32_t k = 0; k < f->nhandlers && !caught; ++k) caught = f->handlers[k].at == idx && rt::isSubclassRT(o->cls, f->handlers[k].cls);
    if (caught || fp == m_->frames.get()) break;
    const rt::Frame fr = *--fp;
    if (!fr.ret) break;   // the edge of an exec(): it ends the program there
    f = fr.fn; at = fr.ret - 1;
  }
  if (mode == 1 && caught) return true;
  fn_ = fn; pc_ = pc; base_ = base;
  const std::uint32_t fi = static_cast<std::uint32_t>(fn - m_->funcs.data());
  line_ = lineAt(fi, static_cast<std::size_t>(pc - fn->code) + 1);
  if (line_ == ~0u) return true;   // thrown by the engine's own code: its caller's frame stops at its next line instead
  exc_ = m_->exceptionText(const_cast<rt::Obj*>(o));
  { std::lock_guard<std::mutex> lock(mu_); reason_ = "exception"; hit_ = 0; first_ = false; pauseReq_ = false; }
  return pauseHere(line_);
}

std::size_t Debugger::depth() const { return static_cast<std::size_t>(m_->fp - m_->frames.get()); }

// ponytail: the interpreter reads these bytes without the lock (a stale one costs one call of the hook or one statement late), byte stores on every target
void Debugger::arm() {
  std::vector<std::uint8_t>& hot = m_->lineHot;
  const bool stepping = pauseReq_ || mode_ == Resume::StepInto || mode_ == Resume::StepOver || mode_ == Resume::StepOut;
  for (std::size_t i = 0; i < hot.size(); ++i) {
    bool on = stepping;
    for (const Bp& b : bps_) on = on || b.key == key(static_cast<std::uint32_t>(i));
    hot[i] = on;
  }
}

bool Debugger::onLine(const rt::Func* fn, const std::uint32_t* pc, Slot* base, std::uint32_t line) {
  const std::uint64_t k = key(line);
  const std::size_t d = depth();
  bool stepStop;
  int bp = 0;
  std::string cond, log;
  {
    std::lock_guard<std::mutex> lock(mu_);
    // a breakpoint, except the other statements of the line the program was paused on (the same statement again, a loop's next turn, stops)
    if (!(mode_ == Resume::Continue && k == startKey_ && d == startDepth_ && line != line_))
      for (const Bp& b : bps_) if (b.key == k) { bp = b.id; cond = b.cond; log = b.log; break; }
    stepStop = pauseReq_;
    if (mode_ == Resume::StepInto) stepStop = stepStop || k != startKey_ || d != startDepth_;
    else if (mode_ == Resume::StepOver) stepStop = stepStop || d < startDepth_ || (d == startDepth_ && k != startKey_);
    else if (mode_ == Resume::StepOut) stepStop = stepStop || d < startDepth_;
    if (!stepStop && !bp) return true;
  }
  fn_ = fn; pc_ = pc; base_ = base; line_ = line;   // the frame the conditions and messages read
  condErr_.clear();
  if (bp && !log.empty()) {   // a logpoint: its message, no stop
    if (logged) logged(interpolate(log));
    bp = 0;
  } else if (bp && !cond.empty()) {
    Local v;
    if (!evaluate(cond, 0, v, condErr_)) condErr_ = "the condition " + cond + ": " + condErr_;   // stops, saying why
    else if (!truthy(v)) bp = 0;
  }
  if (!stepStop && !bp) return true;
  {
    std::lock_guard<std::mutex> lock(mu_);
    hit_ = bp;
    reason_ = bp ? "breakpoint" : pauseReq_ ? "pause" : first_ ? "entry" : "step";
    first_ = false; pauseReq_ = false;
  }
  return pauseHere(line);
}

bool Debugger::pauseHere(std::uint32_t line) {
  const std::uint64_t k = key(line);
  const std::size_t d = depth();
  if (m_->out) m_->flushOut();   // what the program printed so far comes before the debugger's answers
  const Resume r = paused ? paused(*this) : Resume::Continue;
  if (r == Resume::Stop) return false;
  std::lock_guard<std::mutex> lock(mu_);
  mode_ = r; startKey_ = k; startDepth_ = d;
  arm();
  return true;
}

std::string Debugger::interpolate(const std::string& log) const {   // "total is {total}": each {expression} by its value
  std::string out;
  for (std::size_t i = 0; i < log.size();) {
    const std::size_t open = log.find('{', i);
    if (open == std::string::npos) { out += log.substr(i); break; }
    const std::size_t close = log.find('}', open);
    if (close == std::string::npos) { out += log.substr(i); break; }
    out += log.substr(i, open - i);
    Local v;
    std::string err;
    out += evaluate(log.substr(open + 1, close - open - 1), 0, v, err) ? (!v.value.empty() && v.value[0] == '"' && v.vt.cls == zbc::Cls::R ? v.value.substr(1, v.value.size() - 2) : v.value) : "<" + err + ">";
    i = close + 1;
  }
  return out;
}

void Debugger::runFirst() {
  std::lock_guard<std::mutex> lock(mu_);
  mode_ = Resume::Continue;
  if (m_) arm();
}

void Debugger::requestPause() {
  std::lock_guard<std::mutex> lock(mu_);
  pauseReq_ = true;
  if (m_) arm();
}

int Debugger::addBreakpoint(const std::string& file, std::uint32_t line, std::string& where, const std::string& cond, const std::string& log) {
  std::lock_guard<std::mutex> lock(mu_);
  auto matches = [&](const std::string& path) {
    if (path == file) return true;
    if (!file.empty() && file[0] == '/') return false;   // an absolute path (DAP) names one file
    return path.size() > file.size() && path.compare(path.size() - file.size(), file.size(), file) == 0 && path[path.size() - file.size() - 1] == '/';
  };
  std::uint32_t best = ~0u, at = 0;   // the first line with code at or after `line` in a matching file
  for (std::uint32_t i = 0; i < mod_.lines.size(); ++i) {
    const zbc::LineInfo& li = mod_.lines[i];
    if (li.line >= line && li.line < best && li.file < mod_.files.size() && matches(mod_.files[li.file])) { best = li.line; at = i; }
  }
  if (best == ~0u) return 0;
  bps_.push_back({nextId_, key(at), cond, log});
  where = this->where(at);
  if (m_) arm();
  return nextId_++;
}

bool Debugger::removeBreakpoint(int id) {
  std::lock_guard<std::mutex> lock(mu_);
  auto it = std::find_if(bps_.begin(), bps_.end(), [&](const Bp& b) { return b.id == id; });
  if (it == bps_.end()) return false;
  bps_.erase(it);
  if (m_) arm();
  return true;
}

std::uint32_t Debugger::lineAt(std::uint32_t fn, std::size_t pc) const {
  const std::vector<std::uint32_t>& code = mod_.functions[fn].code;
  std::uint32_t last = ~0u;
  for (std::size_t i = 0; i < pc && i < code.size(); i += instrLen(static_cast<Op>(opOf(code[i])))) {
    if (static_cast<Op>(opOf(code[i])) == Op::Line) last = axOf(code[i]);
  }
  return last;
}

std::vector<StackFrame> Debugger::stack() const {
  std::vector<StackFrame> s;
  if (!fn_) return s;
  s.push_back({static_cast<std::uint32_t>(fn_ - m_->funcs.data()), line_, base_});
  for (rt::Frame* f = m_->fp; f != m_->frames.get();) {
    --f;
    if (!f->ret || !f->fn) continue;   // where an exec() began: a call from native code
    const std::uint32_t fi = static_cast<std::uint32_t>(f->fn - m_->funcs.data());
    const std::uint32_t line = lineAt(fi, static_cast<std::size_t>(f->ret - f->fn->code));
    if (line != ~0u) s.push_back({fi, line, f->base});   // the engine's own functions have no lines: not shown
  }
  return s;
}

std::string Debugger::fnName(std::uint32_t fn) const {
  if (fn == 0) return "<top level>";
  if (fn >= mod_.functions.size()) return "?";
  const std::string& n = mod_.functions[fn].name;   // lambdaN: an arrow function, lambdaN:name one stored in `name`
  if (n.rfind("lambda", 0) != 0 || n.size() == 6 || !std::isdigit(static_cast<unsigned char>(n[6]))) return n;
  const std::size_t colon = n.find(':');
  return colon == std::string::npos ? "<anonymous>" : n.substr(colon + 1);
}

std::string Debugger::where(std::uint32_t line) const {
  if (line >= mod_.lines.size()) return "?";
  const zbc::LineInfo& li = mod_.lines[line];
  std::string f = li.file < mod_.files.size() ? mod_.files[li.file] : "?";
  if (std::size_t sl = f.rfind('/'); sl != std::string::npos) f = f.substr(sl + 1);
  return f + ":" + std::to_string(li.line);
}

std::string Debugger::sourceLine(std::uint32_t line) const {
  if (line >= mod_.lines.size() || mod_.lines[line].file >= sources_.size()) return "";
  const std::string& t = sources_[mod_.lines[line].file];
  std::size_t at = mod_.lines[line].offset;
  if (at > t.size()) return "";
  std::size_t b = t.rfind('\n', at == 0 ? 0 : at - 1);
  b = b == std::string::npos || at == 0 ? 0 : b + 1;
  std::size_t e = t.find('\n', at);
  std::string s = t.substr(b, e == std::string::npos ? std::string::npos : e - b);
  while (!s.empty() && (s.back() == '\r' || s.back() == ' ')) s.pop_back();
  return s;
}

// The source spelling of an IR type name: number, boolean, string, a class...
static std::string srcType(std::string t) {
  for (std::size_t at; (at = t.find("ref ")) != std::string::npos;) t.erase(at, 4);
  t.erase(std::remove(t.begin(), t.end(), '"'), t.end());   // the IR quotes names with spaces and punctuation
  if (t.rfind("cell ", 0) == 0) t.erase(0, 5);              // a captured variable that is reassigned lives in a cell: its value's type
  auto word = [&](const std::string& from, const std::string& to) {
    for (std::size_t at = t.find(from); at != std::string::npos; at = t.find(from, at)) {
      const bool l = at == 0 || !std::isalnum(static_cast<unsigned char>(t[at - 1])), r = at + from.size() >= t.size() || !std::isalnum(static_cast<unsigned char>(t[at + from.size()]));
      if (l && r) { t.replace(at, from.size(), to); at += to.size(); } else ++at;
    }
  };
  word("f64", "number"); word("str", "string"); word("bool", "boolean");
  return t;
}

static std::string quote(const char* p, std::size_t n) {
  std::string s = "\"";
  for (std::size_t i = 0; i < n && i < 200; ++i) {
    const char c = p[i];
    if (c == '"' || c == '\\') { s += '\\'; s += c; }
    else if (c == '\n') s += "\\n";
    else if (c == '\t') s += "\\t";
    else s += c;
  }
  return s + (n > 200 ? "...\"" : "\"");
}

std::string Debugger::format(Slot s, const zbc::VType& vt, const std::string& type, int depth) const {
  switch (vt.cls) {
    case zbc::Cls::None: return "undefined";
    case zbc::Cls::I:
      if (type == "bool") return s ? "true" : "false";
      if (type == "fx12" || type == "fx16") return rt::numberToString(static_cast<double>(static_cast<std::int32_t>(s)) / (type == "fx12" ? 4096.0 : 65536.0));
      if (!type.empty() && type[0] == 'u') return std::to_string(static_cast<std::uint64_t>(s));
      return std::to_string(static_cast<std::int64_t>(s));
    case zbc::Cls::S: { float f; std::uint32_t b = static_cast<std::uint32_t>(s); std::memcpy(&f, &b, 4); return rt::numberToString(f); }
    case zbc::Cls::D: { double v; std::memcpy(&v, &s, 8); return v == 0 && std::signbit(v) ? "-0" : rt::numberToString(v); }
    case zbc::Cls::R: break;
  }
  const rt::Obj* o = reinterpret_cast<const rt::Obj*>(s);
  if (!o) return "null";
  const std::uint32_t id = o->cls->id;
  const zbc::ClassInfo* ci = id < mod_.classes.size() ? &mod_.classes[id] : nullptr;
  switch (o->cls->kind) {
    case zbc::CKind::String: { const rt::StrObj* t = static_cast<const rt::StrObj*>(o); return quote(t->data(), t->len); }
    case zbc::CKind::Array: {
      const rt::ArrObj* a = static_cast<const rt::ArrObj*>(o);
      if (depth > 1 || !ci) return "Array(" + std::to_string(a->v.size()) + ")";
      std::string r = "[";
      const std::string et = type.size() > 2 && type.compare(type.size() - 2, 2, "[]") == 0 ? type.substr(0, type.size() - 2) : "";
      for (std::size_t i = 0; i < a->v.size() && i < 10; ++i) r += (i ? ", " : "") + format(a->v[i], ci->elem, et, depth + 1);
      return r + (a->v.size() > 10 ? ", ... (" + std::to_string(a->v.size()) + ")]" : "]");
    }
    case zbc::CKind::Map: return "Map(" + std::to_string(static_cast<const rt::MapObj*>(o)->t.live) + ")";
    case zbc::CKind::Set: return "Set(" + std::to_string(static_cast<const rt::MapObj*>(o)->t.live) + ")";
    case zbc::CKind::Object: break;
  }
  std::string name = srcType(o->cls->name);
  if (o->cls->name.rfind("cell ", 0) == 0 && ci && ci->fields.size() == 1) return format(const_cast<rt::Obj*>(o)->fields()[0], ci->fields[0], "", depth);   // the variable's value
  if (depth > 1 || !ci || ci->fieldNames.size() != ci->fields.size() || ci->fields.empty()) return name + (ci && !ci->fields.empty() ? " {...}" : " {}");
  std::string r = name + " { ";
  const Slot* f = const_cast<rt::Obj*>(o)->fields();
  for (std::size_t i = 0; i < ci->fields.size(); ++i) r += (i ? ", " : "") + ci->fieldNames[i] + ": " + format(f[i], ci->fields[i], i < ci->fieldTypes.size() ? ci->fieldTypes[i] : "", depth + 1);
  return r + " }";
}

Local Debugger::value(const std::string& name, Slot s, const zbc::VType& vt, const std::string& type) const {
  Local l;
  l.name = name; l.raw = s; l.vt = vt;
  const rt::Obj* o = vt.cls == zbc::Cls::R ? reinterpret_cast<const rt::Obj*>(s) : nullptr;
  if (o && o->cls->name.rfind("cell ", 0) == 0 && o->cls->id < mod_.classes.size() && mod_.classes[o->cls->id].fields.size() == 1) {   // a cell: its value
    l.raw = const_cast<rt::Obj*>(o)->fields()[0]; l.vt = mod_.classes[o->cls->id].fields[0];
  }
  l.rawType = type.empty() && l.vt.cls == zbc::Cls::R && l.raw ? reinterpret_cast<const rt::Obj*>(l.raw)->cls->name : type;
  if (l.raw != s) {   // a cell: the type of its value (`ref "cell f64"` holds an f64)
    std::string t = o->cls->name.substr(5);
    l.rawType = t;
  }
  l.type = srcType(l.rawType);
  l.value = format(s, vt, type, 0);
  return l;
}

std::vector<Local> Debugger::locals(std::size_t frame) const {
  std::vector<Local> out;
  std::vector<StackFrame> s = stack();
  if (frame >= s.size()) return out;
  for (const zbc::VarInfo& v : mod_.functions[s[frame].fn].vars) out.push_back(value(v.name, s[frame].base[v.reg], v.vt, v.type));
  return out;
}

std::vector<Local> Debugger::children(const Local& v) const {
  std::vector<Local> out;
  if (!v.expandable()) return out;
  const rt::Obj* o = reinterpret_cast<const rt::Obj*>(v.raw);
  const zbc::ClassInfo* ci = o->cls->id < mod_.classes.size() ? &mod_.classes[o->cls->id] : nullptr;
  if (!ci) return out;
  if (o->cls->kind == zbc::CKind::Array) {
    const rt::ArrObj* a = static_cast<const rt::ArrObj*>(o);
    const std::string& t = v.rawType;
    const std::string et = t.size() > 2 && t.compare(t.size() - 2, 2, "[]") == 0 ? t.substr(0, t.size() - 2) : "";
    for (std::size_t i = 0; i < a->v.size() && i < 100; ++i) out.push_back(value(std::to_string(i), a->v[i], ci->elem, et));
  } else if (o->cls->kind == zbc::CKind::Object && ci->fieldNames.size() == ci->fields.size()) {
    const Slot* f = const_cast<rt::Obj*>(o)->fields();
    for (std::size_t i = 0; i < ci->fields.size(); ++i) out.push_back(value(ci->fieldNames[i], f[i], ci->fields[i], i < ci->fieldTypes.size() ? ci->fieldTypes[i] : ""));
  }
  return out;
}

std::vector<Local> Debugger::closure(std::size_t frame) const {
  std::vector<Local> out;
  StackFrame f;
  if (!frameScope(frame, f)) return out;
  const zbc::Function& fn = mod_.functions[f.fn];
  if (fn.params.empty() || fn.params[0].cls != zbc::Cls::R || fn.params[0].ref >= mod_.classes.size()) return out;
  const zbc::ClassInfo& ci = mod_.classes[fn.params[0].ref];
  if (ci.name.rfind("lambda", 0) != 0 || ci.fieldNames.size() != ci.fields.size()) return out;   // an arrow function's first parameter is what it captured
  const rt::Obj* env = reinterpret_cast<const rt::Obj*>(f.base[0]);
  if (!env) return out;
  const Slot* fs = const_cast<rt::Obj*>(env)->fields();
  for (std::size_t i = 0; i < ci.fields.size(); ++i) out.push_back(value(ci.fieldNames[i], fs[i], ci.fields[i], i < ci.fieldTypes.size() ? ci.fieldTypes[i] : ""));
  return out;
}

std::vector<Local> Debugger::globals() const {
  std::vector<Local> out;
  for (std::size_t i = 0; i < mod_.globalNames.size() && i < m_->globals.size(); ++i)
    if (!mod_.globalNames[i].empty()) out.push_back(value(mod_.globalNames[i], m_->globals[i], mod_.globals[i], mod_.globalTypes[i]));
  return out;
}

bool Debugger::frameScope(std::size_t frame, StackFrame& out) const {
  std::vector<StackFrame> s = stack();
  if (frame >= s.size()) return false;
  out = s[frame];
  return true;
}

bool Debugger::truthy(const Local& v) {
  if (v.vt.cls == zbc::Cls::R) return v.value != "null" && v.value != "\"\"";
  return v.value != "0" && v.value != "false" && v.value != "-0" && v.value != "NaN" && !v.value.empty();
}

// ---------------------------------------------------------------- the command line
void commandLineLog(const std::string& message) { std::printf("%s\n", message.c_str()); std::fflush(stdout); }

Resume commandLine(Debugger& d) {
  const bool tty = isatty(0);
  static std::vector<std::string> watches;   // printed at every stop
  std::vector<StackFrame> st = d.stack();
  if (!st.empty()) {
    std::string why = d.hitBreakpoint() ? " (breakpoint " + std::to_string(d.hitBreakpoint()) + ")" : std::strcmp(d.reason(), "exception") == 0 ? " (exception: " + d.exception() + ")" : "";
    std::printf("paused at %s in %s%s\n", d.where(st[0].line).c_str(), d.fnName(st[0].fn).c_str(), why.c_str());
    std::printf("%s\n", d.sourceLine(st[0].line).c_str());
    if (!d.conditionError().empty()) std::printf("%s\n", d.conditionError().c_str());
    for (std::size_t i = 0; i < watches.size(); ++i) {
      Local v;
      std::string err;
      if (d.evaluate(watches[i], 0, v, err)) std::printf("watch %zu: %s: %s = %s\n", i + 1, watches[i].c_str(), v.type.c_str(), v.value.c_str());
      else std::printf("watch %zu: %s: error %s\n", i + 1, watches[i].c_str(), err.c_str());
    }
  }
  for (;;) {
    std::printf("(zdb) ");
    std::fflush(stdout);
    std::string line;
    if (!std::getline(std::cin, line)) {   // the end of the commands: the program runs to its end
      if (!tty) std::printf("\n");
      for (int id = 1; id < 1000; ++id) d.removeBreakpoint(id);
      return Resume::Continue;
    }
    if (!tty) std::printf("%s\n", line.c_str());
    std::string cmd = line.substr(0, line.find(' ')), arg = line.find(' ') == std::string::npos ? "" : line.substr(line.find(' ') + 1);
    while (!arg.empty() && arg.back() == ' ') arg.pop_back();
    if (cmd == "c" || cmd == "continue") return Resume::Continue;
    if (cmd == "n" || cmd == "next") return Resume::StepOver;
    if (cmd == "s" || cmd == "step") return Resume::StepInto;
    if (cmd == "o" || cmd == "out" || cmd == "finish") return Resume::StepOut;
    if (cmd == "q" || cmd == "quit") return Resume::Stop;
    if (cmd == "b" || cmd == "break" || cmd == "log") {   // b [file:]line [if condition] | log [file:]line message with {expressions}
      std::string at = arg.substr(0, arg.find(' ')), rest = arg.find(' ') == std::string::npos ? "" : arg.substr(arg.find(' ') + 1), cond, msg;
      if (cmd == "log") msg = rest;
      else if (rest.rfind("if ", 0) == 0) cond = rest.substr(3);
      std::size_t colon = at.rfind(':');
      std::string file = colon == std::string::npos ? "" : at.substr(0, colon), num = colon == std::string::npos ? at : at.substr(colon + 1);
      if (file.empty() && !st.empty()) { file = d.where(st[0].line); file = file.substr(0, file.rfind(':')); }   // a line of the file the program is in
      std::string where;
      const int id = num.empty() || (cmd == "log" && msg.empty()) ? 0 : d.addBreakpoint(file, static_cast<std::uint32_t>(std::strtoul(num.c_str(), nullptr, 10)), where, cond, msg);
      if (id) std::printf("%s %d at %s%s\n", cmd == "log" ? "logpoint" : "breakpoint", id, where.c_str(), cond.empty() ? "" : (" if " + cond).c_str());
      else std::printf("no code at %s\n", at.c_str());
    } else if (cmd == "catch") {   // catch [uncaught|all|none]: pause on exceptions
      const int mode = arg == "all" ? 2 : arg == "none" ? 0 : 1;
      d.setExceptionPause(mode);
      std::printf("pause on %s\n", mode == 2 ? "every exception" : mode == 1 ? "uncaught exceptions" : "no exception");
    } else if (cmd == "watch" || cmd == "w") {
      if (!arg.empty()) watches.push_back(arg);
      for (std::size_t i = 0; i < watches.size(); ++i) std::printf("watch %zu: %s\n", i + 1, watches[i].c_str());
    } else if (cmd == "closure" || cmd == "globals") {
      for (const Local& l : cmd == "globals" ? d.globals() : d.closure(arg.empty() ? 0 : std::strtoul(arg.c_str(), nullptr, 10))) std::printf("%s: %s = %s\n", l.name.c_str(), l.type.c_str(), l.value.c_str());
    } else if (cmd == "d" || cmd == "delete") {
      std::printf(d.removeBreakpoint(std::atoi(arg.c_str())) ? "deleted breakpoint %s\n" : "no breakpoint %s\n", arg.c_str());
    } else if (cmd == "bt" || cmd == "backtrace") {
      for (std::size_t i = 0; i < st.size(); ++i) std::printf("#%zu %s at %s\n", i, d.fnName(st[i].fn).c_str(), d.where(st[i].line).c_str());
    } else if (cmd == "locals" || cmd == "l") {
      for (const Local& l : d.locals(arg.empty() ? 0 : std::strtoul(arg.c_str(), nullptr, 10))) std::printf("%s: %s = %s\n", l.name.c_str(), l.type.c_str(), l.value.c_str());
    } else if (cmd == "p" || cmd == "print") {   // an expression in the frame where the program stopped
      Local v;
      std::string err;
      if (d.evaluate(arg, 0, v, err)) std::printf("%s: %s = %s\n", arg.c_str(), v.type.c_str(), v.value.c_str());
      else std::printf("error %s\n", err.c_str());
    } else if (cmd == "h" || cmd == "help") {
      std::printf("b [file:]line [if cond]  break | log [file:]line msg {expr} | d n  delete | catch [uncaught|all|none] | c  continue | n  next | s  step into | o  step out\n"
                  "bt  stack | locals [frame] | closure [frame] | globals | p expr | watch expr | q  quit\n");
    } else if (!cmd.empty()) std::printf("unknown command %s (help lists them)\n", cmd.c_str());
  }
}

}  // namespace zn::dbg

// Reads the IR text format back into a Module (docs/ir-format.md). The inverse of dump(): parse(dump(m)) dumps to the same text.
#include <cstdlib>
#include <map>
#include <stdexcept>
#include <string>
#include <unordered_map>

#include "ir/ir.h"

namespace zn::ir {
namespace {

using frontend::Num;

struct Bad : std::runtime_error { using std::runtime_error::runtime_error; };

struct Cur {
  std::string_view s;
  std::size_t p = 0;
  void ws() { while (p < s.size() && (s[p] == ' ' || s[p] == '\t')) ++p; }
  bool end() { ws(); return p >= s.size(); }
  bool peek(char c) { ws(); return p < s.size() && s[p] == c; }
  bool looking(std::string_view w) { ws(); return s.substr(p, w.size()) == w; }
  bool eat(char c) { if (peek(c)) { ++p; return true; } return false; }
  bool eatWord(std::string_view w) {  // a whole word: not followed by a name character
    if (!looking(w)) return false;
    std::size_t e = p + w.size();
    if (e < s.size() && (std::isalnum(static_cast<unsigned char>(s[e])) || s[e] == '_' || s[e] == '$')) return false;
    p = e;
    return true;
  }
  void need(char c) { if (!eat(c)) throw Bad(std::string("expected '") + c + "'"); }
  void needStr(std::string_view w) { ws(); if (s.substr(p, w.size()) != w) throw Bad("expected '" + std::string(w) + "'"); p += w.size(); }
  std::string word() {  // letters, digits and _ $ .
    ws();
    std::size_t b = p;
    while (p < s.size() && (std::isalnum(static_cast<unsigned char>(s[p])) || s[p] == '_' || s[p] == '$' || s[p] == '.')) ++p;
    if (p == b) throw Bad("expected a name");
    return std::string(s.substr(b, p - b));
  }
  std::string quoted() {
    need('"');
    std::string o;
    while (p < s.size() && s[p] != '"') {
      if (s[p] == '\\' && p + 1 < s.size()) { char c = s[++p]; o += c == 'n' ? '\n' : c == 't' ? '\t' : c; }
      else o += s[p];
      ++p;
    }
    if (p >= s.size()) throw Bad("unterminated string");
    ++p;
    return o;
  }
  std::string name() { ws(); return p < s.size() && s[p] == '"' ? quoted() : word(); }
  std::int64_t integer() {
    ws();
    std::size_t b = p;
    if (p < s.size() && s[p] == '-') ++p;
    while (p < s.size() && std::isdigit(static_cast<unsigned char>(s[p]))) ++p;
    if (p == b || (p == b + 1 && s[b] == '-')) throw Bad("expected an integer");
    return std::strtoll(std::string(s.substr(b, p - b)).c_str(), nullptr, 10);
  }
  std::string number() {  // an int or float literal as written
    ws();
    std::size_t b = p;
    while (p < s.size() && (std::isalnum(static_cast<unsigned char>(s[p])) || s[p] == '-' || s[p] == '+' || s[p] == '.')) ++p;
    if (p == b) throw Bad("expected a number");
    return std::string(s.substr(b, p - b));
  }
  ValueId value() { need('%'); return static_cast<ValueId>(integer()); }
  std::string selName() { std::string n = name(); if (p < s.size() && s[p] == '#') { ++p; n += "#" + std::to_string(integer()); } return n; }
};

const char* const kNumNames[] = {"f64", "f32", "fx12", "fx16", "i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "isize", "usize"};

struct Parser {
  Module& m;
  std::unordered_map<std::string, std::uint32_t> classIdx, funcIdx, selIdx, globalIdx;
  std::unordered_map<std::string, IrOp> ops;
  std::unordered_map<std::string, std::uint32_t> builtins, rts;
  std::vector<std::map<std::uint32_t, std::uint32_t>> vt;  // per class: selector id -> function, collected while reading
  int line = 0;

  explicit Parser(Module& mod) : m(mod) {
    for (int o = 0; o <= static_cast<int>(IrOp::Unreachable); ++o) ops[opName(static_cast<IrOp>(o))] = static_cast<IrOp>(o);
    for (std::uint32_t b = 0; b < static_cast<std::uint32_t>(Builtin::Count); ++b) builtins[builtinName(static_cast<Builtin>(b))] = b;
    for (std::uint32_t r = 0; r < static_cast<std::uint32_t>(zn::Rt::Count); ++r) rts[zn::kRtInfo[r].name] = r;
  }

  template <class T> std::uint32_t lookup(const std::unordered_map<std::string, T>& tab, const std::string& n, const char* what) {
    auto it = tab.find(n);
    if (it == tab.end()) throw Bad(std::string("unknown ") + what + " '" + n + "'");
    return it->second;
  }

  TypeId type(Cur& c) {
    TypeId t;
    if (c.eatWord("void")) t = m.voidT();
    else if (c.eatWord("bool")) t = m.boolT();
    else if (c.eatWord("str")) t = m.strT();
    else if (c.eatWord("ref")) t = m.refT(lookup(classIdx, c.name(), "class"));
    else if (c.eatWord("Map")) { c.need('<'); TypeId k = type(c); c.need(','); TypeId v = type(c); c.need('>'); t = m.mapT(k, v); }
    else if (c.eatWord("Set")) { c.need('<'); TypeId e = type(c); c.need('>'); t = m.setT(e); }
    else {
      t = kNoValue;
      for (int i = 0; i < 14; ++i) if (c.eatWord(kNumNames[i])) { t = m.numT(static_cast<Num>(i)); break; }
      if (t == kNoValue) throw Bad("expected a type");
    }
    while (c.looking("[]")) { c.needStr("[]"); t = m.arrayT(t); }
    return t;
  }

  Edge edge(Cur& c) {
    Edge e;
    c.needStr("bb");
    e.to = static_cast<BlockId>(c.integer());
    if (c.eat('(')) {
      if (!c.eat(')')) { do e.args.push_back(c.value()); while (c.eat(',')); c.need(')'); }
    }
    return e;
  }

  void args(Cur& c, Inst& i, bool parens) {
    if (parens) {
      c.need('(');
      if (c.eat(')')) return;
      do i.args.push_back(c.value()); while (c.eat(','));
      c.need(')');
    } else if (c.peek('%')) {
      do i.args.push_back(c.value()); while (c.eat(','));
    }
  }

  void define(Function& f, ValueId id, TypeId t) {
    if (f.valueTypes.size() <= id) f.valueTypes.resize(id + 1, 0);
    f.valueTypes[id] = t;
  }

  Inst inst(Cur& c, Function& f) {
    Inst i;
    bool hasRes = c.peek('%');
    if (hasRes) {
      i.res = c.value();
      c.need(':');
      i.ty = type(c);
      c.need('=');
      define(f, i.res, i.ty);
    } else i.ty = m.voidT();
    std::string op = c.word();
    auto it = ops.find(op);
    if (it == ops.end()) throw Bad("unknown instruction '" + op + "'");
    i.op = it->second;
    const Type rt = m.types[i.ty];
    switch (i.op) {
      case IrOp::Const:
        if (c.eatWord("null")) i.imm = rt.k == Type::K::Ref ? 0 : kNullConst;
        else if (c.peek('"')) { m.strings.push_back(c.quoted()); i.imm = static_cast<std::int64_t>(m.strings.size() - 1); }
        else if (c.eatWord("true")) i.imm = 1;
        else if (c.eatWord("false")) i.imm = 0;
        else {
          std::string n = c.number();
          if (rt.k == Type::K::Num && (rt.num == Num::f64 || rt.num == Num::f32 || rt.num == Num::fx12 || rt.num == Num::fx16)) i.fimm = std::strtod(n.c_str(), nullptr);
          else i.imm = std::strtoll(n.c_str(), nullptr, 10);
        }
        return i;
      case IrOp::Call: {
        c.need('@');
        i.sym = lookup(funcIdx, c.name(), "function");
        args(c, i, true);
        if (c.eatWord("unwind")) i.edges.push_back(edge(c));
        return i;
      }
      case IrOp::CallVirt: {
        c.need('.');
        i.sym = lookup(selIdx, c.selName(), "selector");
        args(c, i, true);
        if (c.eatWord("unwind")) i.edges.push_back(edge(c));
        return i;
      }
      case IrOp::Builtin: {
        c.ws();
        std::size_t b = c.p;
        while (c.p < c.s.size() && c.s[c.p] != '(') ++c.p;
        i.sym = lookup(builtins, std::string(c.s.substr(b, c.p - b)), "builtin");
        args(c, i, true);
        return i;
      }
      case IrOp::Rt: {
        c.ws();
        std::size_t b = c.p;
        while (c.p < c.s.size() && c.s[c.p] != '(') ++c.p;
        i.sym = lookup(rts, std::string(c.s.substr(b, c.p - b)), "runtime call");
        args(c, i, true);
        return i;
      }
      case IrOp::New: case IrOp::InstOf: i.sym = lookup(classIdx, c.name(), "class"); args(c, i, false); return i;
      case IrOp::GetField: case IrOp::SetField: c.need('.'); i.sym = static_cast<std::uint32_t>(c.integer()); args(c, i, false); return i;
      case IrOp::GetGlobal: case IrOp::SetGlobal: c.needStr("@@"); i.sym = lookup(globalIdx, c.name(), "global"); args(c, i, false); return i;
      case IrOp::ArrNew: type(c); args(c, i, false); return i;
      case IrOp::Br: i.edges.push_back(edge(c)); return i;
      case IrOp::CondBr: i.args.push_back(c.value()); c.need(','); i.edges.push_back(edge(c)); c.need(','); i.edges.push_back(edge(c)); return i;
      default: args(c, i, false); return i;
    }
  }

  static std::vector<std::string_view> split(std::string_view t) {
    std::vector<std::string_view> r;
    std::size_t b = 0;
    while (b <= t.size()) {
      std::size_t e = t.find('\n', b);
      if (e == std::string_view::npos) { if (b < t.size()) r.push_back(t.substr(b)); break; }
      r.push_back(t.substr(b, e - b));
      b = e + 1;
    }
    return r;
  }

  void run(std::string_view text) {
    auto lines = split(text);
    if (lines.empty() || lines[0].substr(0, 3) != "zir")
      throw Bad("line 1: no version line: dumps written before text version 1 start with their classes and cannot be read; write the file again with `zinc --emit=ir`");
    {
      Cur c{lines[0], 3};
      std::int64_t v = 0;
      try { v = c.integer(); } catch (const Bad&) { throw Bad("line 1: malformed version line"); }
      if (v != kTextVersion) throw Bad("line 1: IR text version " + std::to_string(v) + " is not supported (this build reads version " + std::to_string(kTextVersion) + ")");
    }
    // pass 1: the names (classes, functions, selectors and globals may be used before they are declared)
    for (std::size_t n = 1; n < lines.size(); ++n) {
      line = static_cast<int>(n + 1);
      Cur c{lines[n]};
      try {
        if (c.eatWord("selector")) { c.need('.'); selIdx[c.selName()] = static_cast<std::uint32_t>(selIdx.size()); }
        else if (c.eatWord("class") || c.eatWord("interface") || (c.eatWord("abstract") && c.eatWord("class"))) { std::string nm = c.name(); classIdx[nm] = static_cast<std::uint32_t>(classIdx.size()); }
        else if (c.eatWord("global")) { c.needStr("@@"); globalIdx[c.name()] = static_cast<std::uint32_t>(globalIdx.size()); }
        else if (c.eatWord("func")) { c.need('@'); funcIdx[c.name()] = static_cast<std::uint32_t>(funcIdx.size()); }
      } catch (const Bad& e) { throw Bad("line " + std::to_string(line) + ": " + e.what()); }
    }
    m.classes.resize(classIdx.size());
    vt.resize(classIdx.size());
    m.selectors.resize(selIdx.size());
    m.functions.resize(funcIdx.size());
    // pass 2
    std::uint32_t nSel = 0, nCls = 0, nGlob = 0, nFunc = 0;
    Function* f = nullptr;
    std::size_t blockAt = 0;
    for (std::size_t n = 1; n < lines.size(); ++n) {
      line = static_cast<int>(n + 1);
      Cur c{lines[n]};
      try {
        if (c.end()) continue;
        if (f) {  // inside a function
          if (c.peek('}')) { f = nullptr; continue; }
          if (c.looking("bb") && lines[n].find(':') != std::string_view::npos && lines[n][0] != ' ') {
            c.needStr("bb");
            std::size_t id = static_cast<std::size_t>(c.integer());
            if (id != f->blocks.size()) throw Bad("blocks must be numbered in order");
            Block b;
            if (id == 0) b.params = f->params;  // the entry block takes the function's parameters
            if (c.eat('(')) {
              if (id == 0) throw Bad("the entry block has no parameters here");
              do { ValueId p = c.value(); c.need(':'); TypeId t = type(c); define(*f, p, t); b.params.push_back(p); } while (c.eat(','));
              c.need(')');
            }
            c.need(':');
            f->blocks.push_back(std::move(b));
            blockAt = id;
            continue;
          }
          if (f->blocks.empty()) throw Bad("an instruction before the first block");
          f->blocks[blockAt].insts.push_back(inst(c, *f));
          continue;
        }
        if (c.eatWord("selector")) {
          Selector& sel = m.selectors[nSel++];
          c.need('.');
          sel.name = c.selName();
          if (auto h = sel.name.rfind('#'); h != std::string::npos && h > 0 && sel.name.find_first_not_of("0123456789", h + 1) == std::string::npos) sel.name.resize(h);
          c.need('(');
          if (!c.eat(')')) { do sel.params.push_back(type(c)); while (c.eat(',')); c.need(')'); }
          c.needStr("->");
          sel.ret = type(c);
        } else if (c.eatWord("global")) {
          Global g;
          c.needStr("@@");
          g.name = c.name();
          c.need(':');
          g.type = type(c);
          m.globals.push_back(std::move(g));
          ++nGlob;
        } else if (c.eatWord("func")) {
          f = &m.functions[nFunc++];
          c.need('@');
          f->name = c.name();
          c.need('(');
          if (!c.eat(')')) {
            do { ValueId p = c.value(); c.need(':'); TypeId t = type(c); define(*f, p, t); f->params.push_back(p); } while (c.eat(','));
            c.need(')');
          }
          c.needStr("->");
          f->ret = type(c);
          c.need('{');
        } else if (c.eatWord("sel")) {
          if (nCls == 0) throw Bad("`sel` outside a class");
          Class& cl = m.classes[nCls - 1];
          c.need('.');
          std::uint32_t sid = lookup(selIdx, c.selName(), "selector");
          cl.selectors.push_back(sid);
          if (c.looking("->")) { c.needStr("->"); c.need('@'); vt[nCls - 1][sid] = lookup(funcIdx, c.name(), "function"); }
        } else {  // a class
          Class& cl = m.classes[nCls++];
          if (c.eatWord("interface")) cl.isInterface = true;
          else { if (c.eatWord("abstract")) cl.isAbstract = true; if (!c.eatWord("class")) throw Bad("expected a declaration"); }
          cl.name = c.name();
          if (c.eat(':')) cl.parent = lookup(classIdx, c.name(), "class");
          if (c.eatWord("implements")) { do cl.implements.push_back(lookup(classIdx, c.name(), "class")); while (c.eat(',')); }
          if (c.eat('{')) {
            if (!c.eat('}')) {
              do { Field fl; fl.name = c.name(); c.need(':'); fl.type = type(c); cl.fields.push_back(std::move(fl)); } while (c.eat(','));
              c.need('}');
            }
          }
        }
        if (!c.end() && !f) throw Bad("unexpected text at the end of the line");
      } catch (const Bad& e) { throw Bad("line " + std::to_string(line) + ": " + e.what()); }
    }
    if (f) throw Bad("line " + std::to_string(line) + ": the last function is not closed");
    if (nSel != m.selectors.size() || nCls != m.classes.size() || nFunc != m.functions.size() || nGlob != m.globals.size()) throw Bad("internal: a declaration was skipped");
    for (std::size_t k = 0; k < m.classes.size(); ++k) {
      Class& cl = m.classes[k];
      if (cl.isInterface) continue;
      if (!cl.isAbstract || !vt[k].empty()) {
        cl.vtable.assign(m.selectors.size(), kNoClass);
        for (auto& [s, fn] : vt[k]) cl.vtable[s] = fn;
      }
    }
  }
};

}  // namespace

bool parse(std::string_view text, Module& out, std::string& err) {
  out = Module{};
  Parser p(out);
  try {
    p.run(text);
  } catch (const Bad& e) {
    err = e.what();
    if (err.rfind("line ", 0) != 0) err = "line " + std::to_string(p.line) + ": " + err;
    return false;
  }
  return true;
}

}  // namespace zn::ir

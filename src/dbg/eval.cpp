// The debugger's expressions (ZN-371.05): watches, hovers, breakpoint conditions and logpoint messages, evaluated in a frame of the paused
// program. The text is parsed by the frontend's parser; names are the frame's locals, its closure's captures and the program's globals, typed
// by their declarations (the debug build's IR type names), so the errors are the checker's: Z0101, Z0106, Z0107. Calls and assignments are
// not run: a watch never changes the program (D87).
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <functional>

#include "dbg/dbg.h"
#include "frontend/parser.h"
#include "zn/diagnostics.h"

namespace zn::dbg {
namespace {

using frontend::N;

struct Err { std::string text; };

std::string diag(const char* code, const std::string& detail) {
  const DiagInfo* d = findDiag(code);
  return std::string(code) + ": " + (d ? d->title : "") + (detail.empty() ? "" : ": " + detail);
}

// A value: numbers, booleans and strings in C++; null and the program's objects and arrays by their slot. `type` is the IR type name.
struct EV {
  enum K { Num, Bool, Str, Null, Ref } k = Null;
  double n = 0;
  bool isInt = false, b = false;
  std::string s, type;
  rt::Slot ref = 0;
  zbc::VType vt;
};

std::string src(const std::string& t) {   // the source spelling of a type, for messages
  if (t == "f64" || t == "f32" || t == "i8" || t == "i16" || t == "i32" || t == "i64" || t == "u8" || t == "u16" || t == "u32" || t == "u64" || t == "isize" || t == "usize") return t == "f64" ? "number" : t;
  if (t == "bool") return "boolean";
  if (t == "str") return "string";
  std::string o = t.rfind("ref ", 0) == 0 ? t.substr(4) : t;
  if (o.size() > 1 && o.front() == '"' && o.back() == '"') o = o.substr(1, o.size() - 2);
  return o;
}

EV fromSlot(rt::Slot s, const zbc::VType& vt, const std::string& type) {
  EV v;
  v.type = type; v.vt = vt;
  switch (vt.cls) {
    case zbc::Cls::None: v.k = EV::Null; return v;
    case zbc::Cls::I:
      if (type == "bool") { v.k = EV::Bool; v.b = s != 0; return v; }
      v.k = EV::Num;
      if (type == "fx12" || type == "fx16") { v.n = static_cast<double>(static_cast<std::int32_t>(s)) / (type == "fx12" ? 4096.0 : 65536.0); return v; }
      v.isInt = true;
      v.n = !type.empty() && type[0] == 'u' ? static_cast<double>(static_cast<std::uint64_t>(s)) : static_cast<double>(static_cast<std::int64_t>(s));
      return v;
    case zbc::Cls::S: { float f; std::uint32_t b = static_cast<std::uint32_t>(s); std::memcpy(&f, &b, 4); v.k = EV::Num; v.n = f; return v; }
    case zbc::Cls::D: { std::memcpy(&v.n, &s, 8); v.k = EV::Num; return v; }
    case zbc::Cls::R: break;
  }
  const rt::Obj* o = reinterpret_cast<const rt::Obj*>(s);
  if (!o) { v.k = EV::Null; return v; }
  if (o->cls->kind == zbc::CKind::String) { const rt::StrObj* t = static_cast<const rt::StrObj*>(o); v.k = EV::Str; v.s.assign(t->data(), t->len); v.type = "str"; return v; }
  v.k = EV::Ref; v.ref = s;
  if (v.type.empty()) v.type = o->cls->name;
  return v;
}

std::string typeOf(const EV& v) {
  switch (v.k) {
    case EV::Num: return v.isInt ? (v.type.empty() || v.type == "f64" ? "i32" : v.type) : "number";
    case EV::Bool: return "boolean";
    case EV::Str: return "string";
    case EV::Null: return v.type.empty() ? "null" : src(v.type);
    case EV::Ref: return src(v.type);
  }
  return "?";
}
bool holds(const EV& v) {   // JavaScript truthiness
  switch (v.k) {
    case EV::Num: return v.n != 0 && !std::isnan(v.n);
    case EV::Bool: return v.b;
    case EV::Str: return !v.s.empty();
    case EV::Null: return false;
    case EV::Ref: return true;
  }
  return false;
}
EV num(double n, bool isInt) { EV v; v.k = EV::Num; v.n = n; v.isInt = isInt && std::floor(n) == n; v.type = v.isInt ? "i32" : "f64"; return v; }
EV boolean(bool b) { EV v; v.k = EV::Bool; v.b = b; v.type = "bool"; return v; }
EV str(std::string s) { EV v; v.k = EV::Str; v.s = std::move(s); v.type = "str"; return v; }
std::string text(const EV& v) {   // a number or a boolean as a string concatenation writes it
  if (v.k == EV::Num) return v.isInt ? std::to_string(static_cast<long long>(v.n)) : rt::numberToString(v.n);
  if (v.k == EV::Bool) return v.b ? "true" : "false";
  if (v.k == EV::Str) return v.s;
  if (v.k == EV::Null) return "null";
  return "[object]";
}

std::string unquote(std::string_view t) {   // a string literal's body with the common escapes
  std::string o;
  for (std::size_t i = 1; i + 1 < t.size(); ++i) {
    if (t[i] != '\\' || i + 2 >= t.size()) { o += t[i]; continue; }
    const char c = t[++i];
    o += c == 'n' ? '\n' : c == 't' ? '\t' : c == 'r' ? '\r' : c == '0' ? '\0' : c;
  }
  return o;
}

}  // namespace

bool Debugger::evaluate(const std::string& expr, std::size_t frame, Local& out, std::string& err) const {
  StackFrame f;
  if (!frameScope(frame, f)) { err = "no such frame"; return false; }
  const std::string code = "(" + expr + "\n);";
  frontend::ParseResult pr = frontend::parse(code);
  if (!pr.diags.empty() || pr.ast.root == frontend::kNone || pr.ast.nodes[pr.ast.root].kids.size() != 1) {
    err = !pr.diags.empty() ? diag(pr.diags[0].code, pr.diags[0].detail) : diag(kZUnexpectedToken, "one expression");
    return false;
  }
  const frontend::Ast& a = pr.ast;
  const std::uint32_t stmt = a.nodes[a.root].kids[0];
  if (a.nodes[stmt].kind != N::ExprStmt) { err = diag(kZUnexpectedToken, "one expression"); return false; }
  const zbc::Function& fn = mod_.functions[f.fn];

  auto lookup = [&](const std::string& name) -> EV {
    for (const zbc::VarInfo& v : fn.vars) if (v.name == name) { Local l = value(name, f.base[v.reg], v.vt, v.type); return fromSlot(l.raw, l.vt, l.rawType); }
    for (const Local& l : closure(frame)) if (l.name == name) return fromSlot(l.raw, l.vt, l.rawType);
    for (std::size_t i = 0; i < mod_.globalNames.size() && i < m_->globals.size(); ++i)
      if (mod_.globalNames[i] == name) { Local l = value(name, m_->globals[i], mod_.globals[i], mod_.globalTypes[i]); return fromSlot(l.raw, l.vt, l.rawType); }
    throw Err{diag(kZCannotFindName, "'" + name + "'")};
  };
  // `o.name`: a field of the declared class (an object's own class may add fields: the declaration is what the checker read), .length
  auto member = [&](const EV& o, const std::string& name, bool optional) -> EV {
    if (o.k == EV::Null) { if (optional) return EV{}; throw Err{"TypeError: reading '" + name + "' of null"}; }
    if (o.k == EV::Str && name == "length") {   // UTF-16 units, as JavaScript counts
      std::size_t u = 0;
      for (unsigned char c : o.s) u += (c & 0xC0) != 0x80 ? (c >= 0xF0 ? 2 : 1) : 0;
      return num(static_cast<double>(u), true);
    }
    if (o.k == EV::Ref) {
      const rt::Obj* obj = reinterpret_cast<const rt::Obj*>(o.ref);
      if (obj->cls->kind == zbc::CKind::Array && name == "length") return num(static_cast<double>(static_cast<const rt::ArrObj*>(obj)->v.size()), true);
      if ((obj->cls->kind == zbc::CKind::Map || obj->cls->kind == zbc::CKind::Set) && name == "size") return num(static_cast<double>(static_cast<const rt::MapObj*>(obj)->t.live), true);
      const std::uint32_t cls = o.vt.cls == zbc::Cls::R && o.vt.ref < mod_.classes.size() ? o.vt.ref : obj->cls->id;
      const zbc::ClassInfo& ci = mod_.classes[cls];
      for (std::size_t i = 0; i < ci.fieldNames.size() && i < ci.fields.size(); ++i)
        if (ci.fieldNames[i] == name) return fromSlot(const_cast<rt::Obj*>(obj)->fields()[i], ci.fields[i], i < ci.fieldTypes.size() ? ci.fieldTypes[i] : "");
    }
    throw Err{diag(kZNoSuchProperty, "'" + name + "' on type '" + typeOf(o) + "'")};
  };

  std::function<EV(std::uint32_t)> ev = [&](std::uint32_t i) -> EV {
    const frontend::Node& x = a.nodes[i];
    switch (x.kind) {
      case N::Ident: return lookup(std::string(x.text));
      case N::This: return lookup("this");
      case N::Number: {
        std::string t;
        for (char c : x.text) if (c != '_') t += c;
        const bool hex = t.size() > 2 && t[0] == '0' && (t[1] == 'x' || t[1] == 'X');
        const double n = hex ? static_cast<double>(std::strtoll(t.c_str(), nullptr, 16)) : std::strtod(t.c_str(), nullptr);
        return num(n, false);   // a literal is a number (f64), as the checker types it: 5 / 2 is 2.5
      }
      case N::String: return str(unquote(x.text));
      case N::Literal: { if (x.text == "null") return EV{}; return boolean(x.text == "true"); }
      case N::As: case N::NonNull: return ev(x.kids[0]);
      case N::Member: return member(ev(x.kids[0]), std::string(x.text), (x.flags & frontend::kFlagOptional) != 0);
      case N::Index: {
        const EV o = ev(x.kids[0]), k = ev(x.kids[1]);
        if (k.k != EV::Num) throw Err{diag(kZNotIndexable, "an index of type '" + typeOf(k) + "'")};
        if (o.k == EV::Str) { const std::size_t at = static_cast<std::size_t>(k.n); if (at >= o.s.size()) throw Err{"RangeError: index " + text(k) + " out of range"}; return str(o.s.substr(at, 1)); }
        if (o.k == EV::Ref && reinterpret_cast<const rt::Obj*>(o.ref)->cls->kind == zbc::CKind::Array) {
          const rt::ArrObj* arr = reinterpret_cast<const rt::ArrObj*>(o.ref);
          const zbc::ClassInfo& ci = mod_.classes[arr->cls->id];
          if (k.n < 0 || static_cast<std::size_t>(k.n) >= arr->v.size()) throw Err{"RangeError: index " + text(k) + " out of range (length " + std::to_string(arr->v.size()) + ")"};
          const std::string et = o.type.size() > 2 && o.type.compare(o.type.size() - 2, 2, "[]") == 0 ? o.type.substr(0, o.type.size() - 2) : "";
          return fromSlot(arr->v[static_cast<std::size_t>(k.n)], ci.elem, et);
        }
        throw Err{diag(kZNotIndexable, "'" + typeOf(o) + "'")};
      }
      case N::Unary: {
        const EV v = ev(x.kids[0]);
        if (x.text == "!") return boolean(!holds(v));
        if (v.k != EV::Num) throw Err{diag(kZBadOperand, "'" + std::string(x.text) + "' on '" + typeOf(v) + "'")};
        if (x.text == "-") return num(-v.n, v.isInt);
        if (x.text == "+") return v;
        if (x.text == "~") return num(static_cast<double>(~static_cast<std::int32_t>(v.n)), true);
        throw Err{diag(kZUnsupported, "'" + std::string(x.text) + "' in the debugger")};
      }
      case N::Cond: return holds(ev(x.kids[0])) ? ev(x.kids[1]) : ev(x.kids[2]);
      case N::Binary: {
        const std::string op(x.text);
        if (op == "&&") { EV l = ev(x.kids[0]); return holds(l) ? ev(x.kids[1]) : l; }
        if (op == "||") { EV l = ev(x.kids[0]); return holds(l) ? l : ev(x.kids[1]); }
        if (op == "??") { EV l = ev(x.kids[0]); return l.k == EV::Null ? ev(x.kids[1]) : l; }
        const EV l = ev(x.kids[0]), r = ev(x.kids[1]);
        auto bad = [&]() -> Err { return Err{diag(kZBadOperand, "'" + op + "' on '" + typeOf(l) + "' and '" + typeOf(r) + "'")}; };
        if (op == "+") {
          if (l.k == EV::Num && r.k == EV::Num) return num(l.n + r.n, l.isInt && r.isInt);
          if ((l.k == EV::Str && r.k != EV::Ref) || (r.k == EV::Str && l.k != EV::Ref)) return str(text(l) + text(r));
          throw bad();
        }
        if (op == "-" || op == "*" || op == "/" || op == "%" || op == "**") {
          if (l.k != EV::Num || r.k != EV::Num) throw bad();
          if (op == "-") return num(l.n - r.n, l.isInt && r.isInt);
          if (op == "*") return num(l.n * r.n, l.isInt && r.isInt);
          if (op == "**") return num(std::pow(l.n, r.n), l.isInt && r.isInt && r.n >= 0);
          if (l.isInt && r.isInt && r.n == 0) throw Err{"RangeError: integer division by zero"};
          if (op == "/") return l.isInt && r.isInt ? num(std::trunc(l.n / r.n), true) : num(l.n / r.n, false);
          return num(std::fmod(l.n, r.n), l.isInt && r.isInt);
        }
        if (op == "&" || op == "|" || op == "^" || op == "<<" || op == ">>" || op == ">>>") {
          if (l.k != EV::Num || r.k != EV::Num) throw bad();
          const std::int32_t a1 = static_cast<std::int32_t>(l.n), b1 = static_cast<std::int32_t>(r.n);
          const double v = op == "&" ? a1 & b1 : op == "|" ? a1 | b1 : op == "^" ? a1 ^ b1 : op == "<<" ? static_cast<std::int32_t>(static_cast<std::uint32_t>(a1) << (b1 & 31)) : op == ">>" ? a1 >> (b1 & 31) : static_cast<double>(static_cast<std::uint32_t>(a1) >> (b1 & 31));
          return num(v, true);
        }
        if (op == "<" || op == "<=" || op == ">" || op == ">=") {
          int c;
          if (l.k == EV::Num && r.k == EV::Num) { if (std::isnan(l.n) || std::isnan(r.n)) return boolean(false); c = l.n < r.n ? -1 : l.n > r.n ? 1 : 0; }
          else if (l.k == EV::Str && r.k == EV::Str) c = l.s.compare(r.s);
          else throw bad();
          return boolean(op == "<" ? c < 0 : op == "<=" ? c <= 0 : op == ">" ? c > 0 : c >= 0);
        }
        if (op == "===" || op == "==" || op == "!==" || op == "!=") {
          const bool neg = op[0] == '!';
          bool eq;
          if (l.k == EV::Null || r.k == EV::Null) eq = l.k == r.k;   // a reference against null
          else if (l.k != r.k) throw bad();
          else if (l.k == EV::Num) eq = l.n == r.n;
          else if (l.k == EV::Bool) eq = l.b == r.b;
          else if (l.k == EV::Str) eq = l.s == r.s;
          else eq = l.ref == r.ref;
          return boolean(eq != neg);
        }
        throw Err{diag(kZUnsupported, "'" + op + "' in the debugger")};
      }
      case N::Call: case N::New: case N::Assign: case N::UpdatePre: case N::UpdatePost:
        throw Err{"the debugger does not run calls or assignments: a watch never changes the program"};
      default: throw Err{diag(kZUnsupported, "this expression in the debugger")};
    }
  };
  try {
    const EV v = ev(a.nodes[stmt].kids[0]);
    out = Local{};
    out.name = expr;
    out.type = typeOf(v);
    switch (v.k) {
      case EV::Num: out.value = v.isInt ? std::to_string(static_cast<long long>(v.n)) : (v.n == 0 && std::signbit(v.n) ? "-0" : rt::numberToString(v.n)); out.vt.cls = v.isInt ? zbc::Cls::I : zbc::Cls::D; out.rawType = v.isInt ? "i32" : "f64"; break;
      case EV::Bool: out.value = v.b ? "true" : "false"; out.vt.cls = zbc::Cls::I; out.rawType = "bool"; break;
      case EV::Str: { std::string s = "\""; for (char c : v.s) { if (c == '"' || c == '\\') s += '\\'; if (c == '\n') { s += "\\n"; continue; } s += c; } out.value = s + "\""; out.vt.cls = zbc::Cls::R; out.rawType = "str"; break; }
      case EV::Null: out.value = "null"; out.vt.cls = zbc::Cls::R; out.rawType = v.type; break;
      case EV::Ref: { const Local l = value(expr, v.ref, v.vt.cls == zbc::Cls::R ? v.vt : zbc::VType{zbc::Cls::R, static_cast<std::uint16_t>(reinterpret_cast<const rt::Obj*>(v.ref)->cls->id)}, v.type); out = l; out.type = typeOf(v); break; }
    }
    return true;
  } catch (const Err& e) {
    err = e.text;
    return false;
  }
}

}  // namespace zn::dbg

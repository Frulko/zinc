#include "frontend/native_gen.h"

#include <algorithm>
#include <cctype>
#include <map>
#include <vector>

#include "frontend/parser.h"
#include "zn/native_sig.h"

namespace zn::frontend {
namespace {

struct Gen {
  const std::string& text;
  const Ast& a;
  std::string err;
  std::map<std::string, std::uint32_t> aliases;  // `type X = ...` of the file: the type it stands for
  int depth = 0;

  const Node& n(std::uint32_t i) const { return a.nodes[i]; }
  std::string src(std::uint32_t i) const { return text.substr(n(i).start, n(i).end - n(i).start); }

  // The zrt type of a TypeScript type (the table of the prototype's emit-cpp.ts); empty with `err` when it has none.
  std::string cpp(std::uint32_t t, bool promiseArg = false) {
    if (t == kNone) return "void";
    const Node& x = n(t);
    static const std::map<std::string, std::string> kNum = {{"f64", "double"}, {"number", "double"}, {"f32", "float"}, {"i8", "int8_t"}, {"i16", "int16_t"}, {"i32", "int32_t"}, {"i64", "int64_t"},
      {"u8", "uint8_t"}, {"u16", "uint16_t"}, {"u32", "uint32_t"}, {"u64", "uint64_t"}, {"isize", "zrt::isize"}, {"usize", "zrt::usize"}, {"fx12", "zrt::fx12"}, {"fx16", "zrt::fx16"}};
    switch (x.kind) {
      case N::TypeArray: { std::string e = cpp(x.kids[0]); return e.empty() ? e : "zrt::Array<" + e + ">"; }
      case N::TypeFunc: {
        std::string r = cpp(x.kids[0]);
        std::string ps;
        for (std::size_t k = 1; k < x.kids.size(); ++k) {
          std::string p = n(x.kids[k]).kids.empty() ? "" : cpp(n(x.kids[k]).kids[0]);
          if (p.empty()) return "";
          ps += (k > 1 ? ", " : "") + p;
        }
        return r.empty() ? r : "zrt::Fn<" + r + "(" + ps + ")>";
      }
      case N::TypeRef: {
        std::string nm(x.text);
        auto it = kNum.find(nm);
        if (it != kNum.end() && x.kids.empty()) return it->second;
        if (nm == "boolean") return "bool";
        if (nm == "string") return "zrt::String";
        if (nm == "void") return promiseArg ? "zrt::Unit" : "void";
        if (nm == "null") return "decltype(nullptr)";
        if (nm == "any" || nm == "unknown") return "zrt::Dyn";
        auto args = [&](std::size_t want) { std::vector<std::string> v; if (x.kids.size() != want) return v; for (std::uint32_t k : x.kids) { v.push_back(cpp(k)); if (v.back().empty()) return std::vector<std::string>{}; } return v; };
        if (nm == "Array" || nm == "Set") { auto v = args(1); return v.empty() ? "" : "zrt::" + nm + "<" + v[0] + ">"; }
        if (nm == "Map") { auto v = args(2); return v.empty() ? "" : "zrt::Map<" + v[0] + ", " + v[1] + ">"; }
        if (nm == "DynFunction" && x.kids.empty()) return "zrt::Fn<zrt::Dyn(zrt::Array<zrt::Dyn>)>";  // lib/zinc.d.ts: (...args) => unknown
        if (nm == "Promise" && x.kids.size() == 1) { std::string e = cpp(x.kids[0], true); return e.empty() ? e : "zrt::Promise<" + e + ">"; }
        auto al = aliases.find(nm);
        if (al != aliases.end() && x.kids.empty() && depth < 8) { ++depth; std::string r = cpp(al->second, promiseArg); --depth; return r; }
        err = "the type '" + src(t) + "' is a record or class: native-gen writes scalars, strings, arrays, Map, Set, callbacks, Promise and any (a record needs the prototype's namespaces; use scalars or arrays)";
        return "";
      }
      default: err = "the type '" + src(t) + "' has no C++ form here"; return "";
    }
  }

  // The letter of the C ABI for a type (include/zn/native_sig.h), or 0.
  char letter(std::uint32_t t) const {
    if (t == kNone) return 'n';
    if (n(t).kind == N::TypeRef && n(t).kids.empty()) { auto al = aliases.find(std::string(n(t).text)); if (al != aliases.end()) return letter(al->second); }
    std::string s;
    for (char c : src(t)) if (!std::isspace(static_cast<unsigned char>(c))) s += c;
    static const std::map<std::string, char> k = {{"i32", 'i'}, {"u32", 'u'}, {"boolean", 'b'}, {"f64", 'd'}, {"number", 'd'}, {"string", 's'}, {"u8[]", 'B'}, {"i32[]", 'I'}, {"f64[]", 'D'}, {"string[]", 'S'}, {"void", 'n'}};
    auto it = k.find(s);
    return it == k.end() ? 0 : it->second;
  }
};

}  // namespace

bool generateNative(const std::string& specFile, const std::string& text, NativeGen& out, std::string& err) {
  ParseResult pr = parse(text);
  if (pr.ast.root == kNone || !pr.diags.empty()) { err = "the spec does not parse"; return false; }
  Gen g{text, pr.ast, {}, {}, 0};
  for (std::uint32_t st : pr.ast.nodes[pr.ast.root].kids) {
    std::uint32_t d = st;
    if (pr.ast.nodes[d].kind == N::Export && !pr.ast.nodes[d].kids.empty()) d = pr.ast.nodes[d].kids[0];
    if (pr.ast.nodes[d].kind == N::TypeAlias && !pr.ast.nodes[d].kids.empty()) g.aliases[std::string(pr.ast.nodes[d].text)] = pr.ast.nodes[d].kids[0];
  }
  std::size_t at = text.find("requireNative<");
  if (at == std::string::npos) { err = "a native spec must `export default requireNative<Spec>('Name')`"; return false; }
  std::size_t q = at + 14, e = q;
  while (e < text.size() && (std::isalnum(static_cast<unsigned char>(text[e])) || text[e] == '_')) ++e;
  std::string specName = text.substr(q, e - q);
  std::size_t lp = text.find('(', e);
  std::size_t qa = lp == std::string::npos ? lp : text.find_first_of("'\"", lp);
  std::size_t qb = qa == std::string::npos ? qa : text.find(text[qa], qa + 1);
  if (qb == std::string::npos) { err = "requireNative needs the module name as a string"; return false; }
  out.name = text.substr(qa + 1, qb - qa - 1);
  std::uint32_t iface = kNone;
  for (std::uint32_t st : pr.ast.nodes[pr.ast.root].kids) {
    std::uint32_t d = st;
    if (pr.ast.nodes[d].kind == N::Export && !pr.ast.nodes[d].kids.empty()) d = pr.ast.nodes[d].kids[0];
    if (pr.ast.nodes[d].kind == N::Interface && pr.ast.nodes[d].text == specName) iface = d;
  }
  if (iface == kNone) { err = "requireNative needs an interface type argument ('" + specName + "' is not declared in the file)"; return false; }

  std::string base = specFile.substr(specFile.find_last_of('/') == std::string::npos ? 0 : specFile.find_last_of('/') + 1);
  std::string lower = out.name;
  for (char& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  std::string h = "// Generated by zinc codegen from " + base + ". Implement per target.\n#pragma once\n#include \"zrt.h\"\n#include \"mod/native.h\"\n\n";
  h += "struct Native" + out.name + " : zrt::Object {\n";
  std::string cdecl, ctable, cfail, texports, tfuncs, tfail;
  for (std::size_t k = 1; k < pr.ast.nodes[iface].kids.size(); ++k) {
    const Node& m = pr.ast.nodes[pr.ast.nodes[iface].kids[k]];
    std::string mname(m.text);
    if (m.kind == N::Method) {
      std::string ps, sig, tsig, targs;
      bool tOk = true;
      char rl = g.letter(m.kids.empty() ? kNone : m.kids[0]);
      bool cOk = rl != 0;
      for (std::size_t j = 2; j < m.kids.size(); ++j) {
        const Node& p = pr.ast.nodes[m.kids[j]];
        std::string t = p.kids.empty() ? "" : g.cpp(p.kids[0]);
        if (t.empty()) { err = "member '" + mname + "': " + (g.err.empty() ? "a parameter has no type" : g.err); return false; }
        ps += (j > 2 ? ", " : "") + t + " " + std::string(p.text);
        char l = p.kids.empty() ? 0 : g.letter(p.kids[0]);
        if (!l || l == 'n') cOk = false; else sig += l;
        std::string idx = std::to_string(j - 2), ex;  // ex: the C++ expression that builds the parameter from a[idx]
        const Node* pt = p.kids.empty() ? nullptr : &pr.ast.nodes[p.kids[0]];
        switch (l) {
          case 'i': ex = "static_cast<int32_t>(a[" + idx + "].i)"; break;
          case 'u': ex = "static_cast<uint32_t>(a[" + idx + "].i)"; break;
          case 'b': ex = "a[" + idx + "].i != 0"; break;
          case 'd': ex = "a[" + idx + "].d"; break;
          case 's': ex = "zn::compat::str(a[" + idx + "])"; break;
          case 'B': ex = "zn::compat::arr<uint8_t>(a[" + idx + "])"; break;
          case 'I': ex = "zn::compat::arr<int32_t>(a[" + idx + "])"; break;
          case 'D': ex = "zn::compat::arr<double>(a[" + idx + "])"; break;
          case 'S': ex = "zn::compat::arrStr(a[" + idx + "])"; break;
          default: break;
        }
        if (ex.empty() && pt && pt->kind == N::TypeFunc && g.letter(pt->kids[0]) == 'n') {  // a callback returning void: queued on the engine's thread
          std::string cs, ctypes, cputs;
          bool fok = true;
          for (std::size_t q = 1; q < pt->kids.size() && fok; ++q) {
            const Node& cp = pr.ast.nodes[pt->kids[q]];
            char cl = cp.kids.empty() ? 0 : g.letter(cp.kids[0]);
            if (!cl || cl == 'n') { fok = false; break; }
            cs += cl;
            ctypes += (q > 1 ? ", " : "") + g.cpp(cp.kids[0]) + " x" + std::to_string(q - 1);
            cputs += "zn::compat::put(v[" + std::to_string(q - 1) + "], x" + std::to_string(q - 1) + "); ";
          }
          if (fok) {
            ex = t + "([cb = H->cb_retain(a[" + idx + "].h)](" + ctypes + ") { ZnVal v[" + std::to_string(std::max<std::size_t>(pt->kids.size() - 1, 1)) + "]; " + cputs + "H->cb_post(cb, \"" + cs + "\", v, " + std::to_string(pt->kids.size() - 1) + "); })";
            tsig += "c(" + cs + ">n)";
          }
        } else if (!ex.empty()) tsig += l;
        if (ex.empty()) tOk = false; else targs += (j > 2 ? ", " : "") + ex;
      }
      std::string r = g.cpp(m.kids.empty() ? kNone : m.kids[0]);
      if (r.empty()) { err = "member '" + mname + "': " + g.err; return false; }
      h += "  virtual " + r + " " + mname + "(" + ps + ") = 0;\n";
      if (rl == 0 || !tOk) { if (tfail.empty()) tfail = "member '" + mname + "' uses a type the thunk cannot carry yet (scalars, strings, arrays, callbacks returning void)"; }
      else {
        std::string call = "zn_" + out.name + "->" + mname + "(" + targs + ")";
        std::string body = rl == 'n' ? call + ";" : (rl == 'd' ? "r->d = " + call + ";" : (rl == 's' || rl == 'B' || rl == 'I' || rl == 'D') ? "zn::compat::ret(H, cx, r, " + call + ");" : "r->i = " + call + ";");
        tfuncs += "static int32_t t_" + mname + "(void*, ZnCtx* cx, const ZnVal* a, ZnVal* r) {\n  (void)a; (void)r;\n  " + body + "\n  return zn::compat::done(H, cx);\n}\n";
        texports += "  {\"" + mname + "\", \"" + tsig + ">" + rl + "\", t_" + mname + ", 0},\n";
      }
      if (cOk) {
        cdecl += "int32_t zn_" + lower + "_" + mname + "(void* self, ZnCtx* cx, const ZnVal* args, ZnVal* ret);\n";
        ctable += std::string(ctable.empty() ? "" : ",\n") + "  {\"" + mname + "\", \"" + sig + ">" + rl + "\", zn_" + lower + "_" + mname + ", 0}";
      } else if (cfail.empty()) cfail = "member '" + mname + "' uses a type the C ABI cannot carry yet (include/zn/native_sig.h)";
    } else if (m.kind == N::Field) {
      std::string t = g.cpp(m.kids.empty() ? kNone : m.kids[0]);
      if (t.empty()) { err = "member '" + mname + "': " + g.err; return false; }
      h += "  " + t + " " + mname + "{};\n";
      if (cfail.empty()) cfail = "member '" + mname + "' is a property";
    }
  }
  h += "};\nNative" + out.name + "* zinc_create_" + out.name + "();\nstatic Native" + out.name + "* zn_" + out.name + ";\n";
  out.cppHeader = h;
  if (cfail.empty()) {
    out.cHeader = "/* Generated by zinc native-gen from " + base + ". Implement the functions, then register the module (include/zn/native.h). */\n#pragma once\n#include \"zn/native.h\"\n\n#ifdef __cplusplus\nextern \"C\" {\n#endif\n" + cdecl +
                  "\n#" "define ZN_" + lower + "_EXPORTS \\\n" + [&] { std::string s = ctable; std::string o; for (char c : s) { if (c == '\n') o += " \\\n"; else o += c; } return o; }() + "\n#ifdef __cplusplus\n}\n#endif\n";
  } else out.cNote = cfail;
  if (!tfail.empty()) out.thunkNote = tfail;
  else {
    out.thunk = "// Generated by zinc native-gen --thunk from " + base + ": the native module " + out.name + " over the NativeX of its header (src/native/zrt_compat.h).\n#include \"zinc_native_" + lower + ".h\"\n#include \"native/zrt_compat.h\"\n\n"
                "static const ZnHostApi* H;\n" + tfuncs + "\nstatic const ZnExport kExports[] = {\n" + texports + "};\n"
                "static int32_t t_init(const ZnHostApi* host, void** self) { H = host; *self = nullptr; zn_" + out.name + " = zinc_create_" + out.name + "(); return ZN_OK; }\n"
                "static void t_poll(void*, uint64_t) { zrt::poll_pollers(); }\n"
                "extern \"C\" const ZnModule* zn_module_" + out.name + "(void) {\n  static ZnModule m;\n  m.abi = ZN_ABI_VERSION;\n  m.size = static_cast<uint32_t>(sizeof m);\n  m.name = \"" + out.name + "\";\n"
                "  m.exports = kExports;\n  m.nexports = static_cast<uint32_t>(sizeof kExports / sizeof kExports[0]);\n  m.flags = ZN_THREADS;\n  m.init = t_init;\n  m.poll = t_poll;\n  return &m;\n}\n";
  }
  return true;
}

}  // namespace zn::frontend

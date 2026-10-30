#include "frontend/native_gen.h"

#include <algorithm>
#include <cctype>
#include <cstring>
#include <map>
#include <set>
#include <vector>

#include "frontend/parser.h"
#include "zn/native_sig.h"

namespace zn::frontend {
namespace {

// Records of a spec (ZN-850, include/zn/rec.h): the interfaces and type aliases of the file, and the schema text of a type that holds one.
struct Records {
  const Ast& a;
  const std::string& text;
  std::map<std::string, std::uint32_t> ifaces, aliases;
  std::string err;
  std::vector<std::string> order;   // the records reached, nested ones first (the order of the generated C++ structs)
  Records(const Ast& ast, const std::string& t) : a(ast), text(t) {
    if (a.root == kNone) return;
    for (std::uint32_t st : a.nodes[a.root].kids) {
      std::uint32_t d = st;
      if (a.nodes[d].kind == N::Export && !a.nodes[d].kids.empty()) d = a.nodes[d].kids[0];
      if (a.nodes[d].kind == N::Interface) ifaces[std::string(a.nodes[d].text)] = d;
      else if (a.nodes[d].kind == N::TypeAlias && !a.nodes[d].kids.empty()) aliases[std::string(a.nodes[d].text)] = a.nodes[d].kids[0];
    }
  }
  bool isNull(std::uint32_t t) const { return a.nodes[t].kind == N::TypeRef && (a.nodes[t].text == "null" || a.nodes[t].text == "undefined"); }
  // Whether the type mentions a record of the file (through arrays, unions, aliases and Array<T>).
  bool holds(std::uint32_t t, int depth = 0) const {
    if (t == kNone || depth > 16) return false;
    const Node& x = a.nodes[t];
    if (x.kind == N::TypeArray || x.kind == N::TypeUnion) { for (std::uint32_t k : x.kids) if (holds(k, depth + 1)) return true; return false; }
    if (x.kind != N::TypeRef) return false;
    std::string nm(x.text);
    if (nm == "Array" || nm == "Promise") return x.kids.size() == 1 && holds(x.kids[0], depth + 1);
    if (x.kids.empty() && aliases.count(nm)) return holds(aliases.at(nm), depth + 1);
    return x.kids.empty() && ifaces.count(nm) && nm != "NativeModule";
  }
  std::string fail(std::uint32_t t, const std::string& why) { if (err.empty()) err = "the type '" + text.substr(a.nodes[t].start, a.nodes[t].end - a.nodes[t].start) + "' " + why; return ""; }
  std::string type(std::uint32_t t, int depth = 0) {
    if (depth > 16) return fail(t, "nests records too deep (a record that holds itself has no wire form)");
    const Node& x = a.nodes[t];
    if (x.kind == N::TypeArray) {
      if (a.nodes[x.kids[0]].kind == N::TypeRef && a.nodes[x.kids[0]].text == "u8") return "B";
      std::string e = type(x.kids[0], depth + 1);
      return e.empty() ? e : "*" + e;
    }
    if (x.kind == N::TypeUnion) {   // T | null
      std::uint32_t one = kNone;
      int n = 0, nulls = 0;
      for (std::uint32_t k : x.kids) { if (isNull(k)) ++nulls; else { one = k; ++n; } }
      if (n != 1 || nulls == 0) return fail(t, "is a union: a record field is T or T | null");
      std::string e = type(one, depth + 1);
      return e.empty() ? e : "?" + e;
    }
    if (x.kind != N::TypeRef) return fail(t, "has no record form (number, i32, u32, boolean, string, u8[], arrays, T | null and records)");
    std::string nm(x.text);
    static const std::map<std::string, std::string> kScalar = {{"number", "d"}, {"f64", "d"}, {"i32", "i"}, {"u32", "u"}, {"boolean", "b"}, {"string", "s"}};
    if (x.kids.empty()) { auto it = kScalar.find(nm); if (it != kScalar.end()) return it->second; }
    if (nm == "Array" && x.kids.size() == 1) {
      if (a.nodes[x.kids[0]].kind == N::TypeRef && a.nodes[x.kids[0]].text == "u8") return "B";
      std::string e = type(x.kids[0], depth + 1);
      return e.empty() ? e : "*" + e;
    }
    if (x.kids.empty() && aliases.count(nm)) return type(aliases.at(nm), depth + 1);
    if (!x.kids.empty() || !ifaces.count(nm)) return fail(t, "has no record form (number, i32, u32, boolean, string, u8[], arrays, T | null and interfaces of the spec file)");
    const Node& in = a.nodes[ifaces.at(nm)];
    if (!in.kids.empty() && in.kids[0] != kNone) return fail(t, "extends another interface: a record lists all its fields");
    std::string s = "{";
    for (std::size_t k = 1; k < in.kids.size(); ++k) {
      const Node& f = a.nodes[in.kids[k]];
      if (f.kind != N::Field || f.kids.empty() || f.kids[0] == kNone) return fail(t, "has a member '" + std::string(f.text) + "' that is not a typed field (a record holds data only)");
      std::string ft = type(f.kids[0], depth + 1);
      if (ft.empty()) return "";
      if ((f.flags & kFlagOptional) && ft[0] != '?') ft = "?" + ft;
      s += (k > 1 ? "," : "") + std::string(f.text) + ":" + ft;
    }
    if (std::find(order.begin(), order.end(), nm) == order.end()) order.push_back(nm);
    return s + "}";
  }
  // The C++ type of a field of a generated record struct (include/zn/rec.h put and get); the type was checked by type().
  std::string cpp(std::uint32_t t) const {
    const Node& x = a.nodes[t];
    if (x.kind == N::TypeArray) { const Node& e = a.nodes[x.kids[0]]; return e.kind == N::TypeRef && e.text == "u8" ? "std::vector<uint8_t>" : "std::vector<" + cpp(x.kids[0]) + ">"; }
    if (x.kind == N::TypeUnion) { for (std::uint32_t k : x.kids) if (!isNull(k)) return "std::optional<" + cpp(k) + ">"; }
    std::string nm(x.text);
    static const std::map<std::string, std::string> kScalar = {{"number", "double"}, {"f64", "double"}, {"i32", "int32_t"}, {"u32", "uint32_t"}, {"boolean", "bool"}, {"string", "std::string"}};
    if (auto it = kScalar.find(nm); it != kScalar.end()) return it->second;
    if (nm == "Array" && x.kids.size() == 1) { const Node& e = a.nodes[x.kids[0]]; return e.kind == N::TypeRef && e.text == "u8" ? "std::vector<uint8_t>" : "std::vector<" + cpp(x.kids[0]) + ">"; }
    if (aliases.count(nm)) return cpp(aliases.at(nm));
    return nm;
  }
  // A field's name in C++: one that is a keyword of C++ but a fine property name in TypeScript (auto, new, delete, default...) gets a
  // trailing underscore, as the C++ Core Guidelines spell it. The wire has no names, so both sides still agree.
  static std::string cppName(std::string_view n) {
    static const std::set<std::string_view> kCpp = {"alignas", "alignof", "and", "and_eq", "asm", "auto", "bitand", "bitor", "bool", "break", "case",
      "catch", "char", "char8_t", "char16_t", "char32_t", "class", "compl", "concept", "const", "consteval", "constexpr", "constinit", "const_cast",
      "continue", "co_await", "co_return", "co_yield", "decltype", "default", "delete", "do", "double", "dynamic_cast", "else", "enum", "explicit",
      "export", "extern", "false", "float", "for", "friend", "goto", "if", "inline", "int", "long", "mutable", "namespace", "new", "noexcept", "not",
      "not_eq", "nullptr", "operator", "or", "or_eq", "private", "protected", "public", "register", "reinterpret_cast", "requires", "return", "short",
      "signed", "sizeof", "static", "static_assert", "static_cast", "struct", "switch", "template", "this", "thread_local", "throw", "true", "try",
      "typedef", "typeid", "typename", "union", "unsigned", "using", "virtual", "void", "volatile", "wchar_t", "while", "xor", "xor_eq"};
    return kCpp.count(n) ? std::string(n) + "_" : std::string(n);
  }
  // The structs of the records reached by type(), nested ones first: plain data with encode and decode, for any thread (no zrt type).
  std::string structs() const {
    std::string h;
    for (const std::string& nm : order) {
      const Node& in = a.nodes[ifaces.at(nm)];
      std::string fs, puts, gets;
      for (std::size_t k = 1; k < in.kids.size(); ++k) {
        const Node& f = a.nodes[in.kids[k]];
        std::string ct = cpp(f.kids[0]), fn = cppName(f.text);
        if ((f.flags & kFlagOptional) && ct.rfind("std::optional<", 0) != 0) ct = "std::optional<" + ct + ">";
        const bool scalar = ct == "double" || ct == "int32_t" || ct == "uint32_t" || ct == "bool";
        fs += "  " + ct + " " + fn + (scalar ? ct == "bool" ? " = false" : " = 0" : "") + ";\n";
        puts += " zn::rec::put(zn_w, this->" + fn + ");";
        gets += ", v." + fn;
      }
      h += "struct " + nm + " {\n" + fs + "  void encode(zn::rec::Writer& zn_w) const { std::size_t zn_at = zn_w.begin();" + puts + " zn_w.end(zn_at); }\n"
           "  static bool decode(zn::rec::Reader& r, " + nm + "& v) { zn::rec::Reader b; return r.record(b) && zn::rec::fields(b" + gets + "); }\n};\n";
    }
    return h;
  }
};

struct Gen {
  const std::string& text;
  const Ast& a;
  std::string err;
  std::map<std::string, std::uint32_t> aliases;  // `type X = ...` of the file: the type it stands for
  int depth = 0;
  const Records* recs = nullptr;   // a record type crosses as its bytes (ZN-850): zrt::Array<uint8_t>, the letter B

  bool record(std::uint32_t t) const { return recs && t != kNone && recs->holds(t) && !(n(t).kind == N::TypeRef && n(t).text == "Promise"); }
  const Node& n(std::uint32_t i) const { return a.nodes[i]; }
  std::string src(std::uint32_t i) const { return text.substr(n(i).start, n(i).end - n(i).start); }

  // The zrt type of a TypeScript type (the table of the prototype's emit-cpp.ts); empty with `err` when it has none.
  std::string cpp(std::uint32_t t, bool promiseArg = false) {
    if (t == kNone) return "void";
    if (record(t)) return "zrt::Array<uint8_t>";
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
    if (record(t)) return 'B';
    if (n(t).kind == N::TypeRef && n(t).kids.empty()) { auto al = aliases.find(std::string(n(t).text)); if (al != aliases.end()) return letter(al->second); }
    std::string s;
    for (char c : src(t)) if (!std::isspace(static_cast<unsigned char>(c))) s += c;
    static const std::map<std::string, char> k = {{"i32", 'i'}, {"u32", 'u'}, {"boolean", 'b'}, {"f64", 'd'}, {"number", 'd'}, {"string", 's'}, {"u8[]", 'B'}, {"i32[]", 'I'}, {"u32[]", 'U'}, {"f64[]", 'D'}, {"number[]", 'D'}, {"string[]", 'S'}, {"void", 'n'}};
    auto it = k.find(s);
    return it == k.end() ? 0 : it->second;
  }
};

// The phone glue of a spec (zinc native-gen --android / --ios): one entry per member, the letters i u b d s (and n for a void result); a
// parameter may also be a callback returning void whose parameters are letters, cb.
struct MobileParam { std::string name; char l = 0; std::string cb; std::string cpp; };
struct MobileMethod { std::string name; char ret = 0; std::string retCpp; std::vector<MobileParam> params; };

const char* javaType(char l) { return l == 'i' || l == 'u' ? "int" : l == 'b' ? "boolean" : l == 'd' ? "double" : l == 's' ? "String" : "void"; }
const char* jniSig(char l) { return l == 'i' || l == 'u' ? "I" : l == 'b' ? "Z" : l == 'd' ? "D" : l == 's' ? "Ljava/lang/String;" : "V"; }
const char* objcType(char l) { return l == 'i' ? "int32_t" : l == 'u' ? "uint32_t" : l == 'b' ? "BOOL" : l == 'd' ? "double" : l == 's' ? "NSString*" : "void"; }
const char* swiftType(char l) { return l == 'i' ? "Int32" : l == 'u' ? "UInt32" : l == 'b' ? "Bool" : l == 'd' ? "Double" : l == 's' ? "String" : "Void"; }

void mobileGlue(Gen& g, const Ast& a, std::uint32_t iface, const std::string& base, const std::string& lower, NativeGen& out) {
  std::vector<MobileMethod> ms;
  for (std::size_t k = 1; k < a.nodes[iface].kids.size(); ++k) {
    const Node& m = a.nodes[a.nodes[iface].kids[k]];
    MobileMethod mm;
    mm.name = std::string(m.text);
    auto fail = [&](const std::string& why) { out.mobileNote = "member '" + mm.name + "': " + why + " (the phone glue carries i32, u32, f64, number, boolean, string and callbacks returning void)"; };
    if (m.kind != N::Method) { fail("a property"); return; }
    const std::uint32_t rt = m.kids.empty() ? kNone : m.kids[0];
    mm.ret = g.letter(rt);
    if (!mm.ret || !std::strchr("niubds", mm.ret)) { fail("its result type"); return; }
    mm.retCpp = g.cpp(rt);
    for (std::size_t j = 2; j < m.kids.size(); ++j) {
      const Node& p = a.nodes[m.kids[j]];
      MobileParam mp;
      mp.name = std::string(p.text);
      if (p.kids.empty()) { fail("a parameter without a type"); return; }
      mp.cpp = g.cpp(p.kids[0]);
      const Node& t = a.nodes[p.kids[0]];
      if (t.kind == N::TypeFunc) {
        if (g.letter(t.kids[0]) != 'n') { fail("a callback that returns a value"); return; }
        for (std::size_t q = 1; q < t.kids.size(); ++q) {
          const Node& cp = a.nodes[t.kids[q]];
          const char cl = cp.kids.empty() ? 0 : g.letter(cp.kids[0]);
          if (!cl || !std::strchr("iubds", cl)) { fail("a callback parameter's type"); return; }
          mp.cb += cl;
        }
        mp.l = 'c';
      } else {
        mp.l = g.letter(p.kids[0]);
        if (!mp.l || !std::strchr("iubds", mp.l)) { fail("the type of '" + mp.name + "'"); return; }
      }
      mm.params.push_back(mp);
    }
    ms.push_back(mm);
  }
  const std::string& nm = out.name;
  out.javaPackage = "dev.zinc.plugins." + lower;
  out.javaName = nm + "Spec";
  out.objcName = "Zinc" + nm + "Spec";
  const std::string gen = "Generated by zinc native-gen from " + base + ": do not edit.";
  // Java: the interface, and the JNI bridge that implements Native<Name> over an instance of ZN_NATIVE_CLASS
  std::string j = "// " + gen + "\npackage " + out.javaPackage + ";\n\nimport dev.zinc.app.ZincCallback;\n\n"
                  "/** The native module " + nm + " on Android: implement it in Java or Kotlin (a public class with a constructor without parameters) and name the class\n"
                  " *  in plugin.json targets.android.class. Its methods run on the program's thread (UI work goes through runOnUiThread); a ZincCallback may be called\n"
                  " *  from any thread, with the values in the order of the spec (Integer, Double, Boolean, String). */\npublic interface " + out.javaName + " {\n";
  std::string b = "// " + gen + "\n// Native" + nm + " over the Java class ZN_NATIVE_CLASS (plugin.json targets.android.class), through JNI (src/app/mobile_bridge.h).\n"
                  "#include \"zinc_native_" + lower + ".h\"\n#include \"app/mobile_bridge.h\"\n\nnamespace {\n";
  std::string cbs, members, mids;
  int ncb = 0;
  for (const MobileMethod& m : ms) {
    std::string jp, sig = "(", cargs, decl, pre, post;
    for (const MobileParam& p : m.params) {
      jp += std::string(jp.empty() ? "" : ", ") + (p.l == 'c' ? "ZincCallback" : javaType(p.l)) + " " + p.name;
      sig += p.l == 'c' ? "Ldev/zinc/app/ZincCallback;" : jniSig(p.l);
      decl += std::string(decl.empty() ? "" : ", ") + p.cpp + " " + p.name;
      if (p.l == 's') { pre += "jstring j_" + p.name + " = zn_jni_string(e, " + p.name + ".ptr(), " + p.name + ".bytes());\n    "; post += "e->DeleteLocalRef(j_" + p.name + ");\n    "; cargs += ", j_" + p.name; }
      else if (p.l == 'c') {
        const std::string cn = "Cb" + std::to_string(ncb++);
        std::string call;
        for (std::size_t q = 0; q < p.cb.size(); ++q) {
          const char cl = p.cb[q];
          const std::string at = "a, " + std::to_string(q);
          call += std::string(q ? ", " : "") + (cl == 's' ? "str(e, " + at + ")" : cl == 'd' ? "zn_jni_arg_double(e, " + at + ")" : cl == 'b' ? "zn_jni_arg_bool(e, " + at + ")" : cl == 'u' ? "static_cast<uint32_t>(zn_jni_arg_int(e, " + at + "))" : "zn_jni_arg_int(e, " + at + ")");
        }
        cbs += "struct " + cn + " : ZnJavaCallback {\n  " + p.cpp + " f;\n  explicit " + cn + "(" + p.cpp + " x) : f(x) {}\n  void call(JNIEnv* e, jobjectArray a) override { (void)e; (void)a; f(" + call + "); }\n};\n";
        pre += "jobject j_" + p.name + " = zn_jni_callback(e, new " + cn + "(" + p.name + "));   // ponytail: kept for the program's life (a callback is registered once)\n    drain.held = true;\n    ";
        post += "e->DeleteLocalRef(j_" + p.name + ");\n    ";
        cargs += ", j_" + p.name;
      } else cargs += std::string(", (") + (p.l == 'b' ? "jboolean" : p.l == 'd' ? "jdouble" : "jint") + ")" + p.name;
    }
    sig += std::string(")") + jniSig(m.ret);
    j += "    " + std::string(javaType(m.ret)) + " " + m.name + "(" + jp + ");\n";
    mids += "    m_" + m.name + " = e->GetMethodID(c, \"" + m.name + "\", \"" + sig + "\");\n";
    const char* callFn = m.ret == 'n' ? "CallVoidMethod" : m.ret == 'b' ? "CallBooleanMethod" : m.ret == 'd' ? "CallDoubleMethod" : m.ret == 's' ? "CallObjectMethod" : "CallIntMethod";
    std::string call = std::string("e->") + callFn + "(impl, m_" + m.name + cargs + ")";
    std::string body = std::string("if (!impl) return") + (m.ret == 'n' ? "" : " {}") + ";   // the class is missing (logged once by bind)\n    JNIEnv* e = zn_jni_env();\n    " + pre;
    if (m.ret == 'n') body += call + ";\n    zn_jni_check(e, \"" + nm + "." + m.name + "\");\n    " + post;
    else if (m.ret == 's') body += "jstring r = static_cast<jstring>(" + call + ");\n    zn_jni_check(e, \"" + nm + "." + m.name + "\");\n    " + post + "zrt::String s = str(e, r);\n    if (r) e->DeleteLocalRef(r);\n    return s;";
    else body += "auto r = " + call + ";\n    zn_jni_check(e, \"" + nm + "." + m.name + "\");\n    " + post + "return static_cast<" + m.retCpp + ">(r);";
    while (!body.empty() && (body.back() == ' ' || body.back() == '\n')) body.pop_back();
    members += "  jmethodID m_" + m.name + " = nullptr;\n  " + m.retCpp + " " + m.name + "(" + decl + ") override {\n    " + body + "\n  }\n";
  }
  j += "}\n";
  b += "zrt::String str(JNIEnv* e, jstring s) { size_t n = 0; char* p = zn_jni_utf8(e, s, &n); zrt::String r = zrt::String::from(p ? p : \"\", static_cast<uint32_t>(n)); zn_jni_free(p); return r; }\n"
       "zrt::String str(JNIEnv* e, jobjectArray a, int i) { jstring s = static_cast<jstring>(e->GetObjectArrayElement(a, i)); zrt::String r = str(e, s); if (s) e->DeleteLocalRef(s); return r; }\n" + cbs +
       "// the calls of the ZincCallbacks, queued by Java from any thread, made on the program's thread; the loop stays alive once one exists\nstruct Drain : zrt::Poller {\n  bool held = false;\n  bool poll() override { zn_jni_drain(zn_jni_env()); return held; }\n};\n"
       "struct Java" + nm + " : Native" + nm + " {\n  jobject impl = nullptr;\n  Drain drain;\n" + members + "  void bind(JNIEnv* e) {\n    zrt::add_poller(&drain);\n    impl = zn_jni_new(e, ZN_NATIVE_CLASS);\n    if (!impl) return;\n    jclass c = e->GetObjectClass(impl);\n" + mids + "    e->DeleteLocalRef(c);\n  }\n};\n}  // namespace\n\n"
       "Native" + nm + "* zinc_create_" + nm + "() {\n  static Java" + nm + " m;\n  m.rc = zrt::IMMORTAL;\n  m.bind(zn_jni_env());\n  return &m;\n}\n";
  out.java = j;
  out.jniBridge = b;
  // Objective-C and Swift: the protocol (the Swift one for a Swift class to conform to; the selectors are the same), and the bridge over ZN_NATIVE_CLASS
  std::string h = "// " + gen + "\n// The native module " + nm + " on iOS: a class that answers these selectors (plugin.json targets.ios.class; a Swift class conforms to\n"
                  "// " + out.objcName + ".swift and is named with @objc(Name)). Its methods run on the program's thread, the main thread; a block may be called from any thread.\n"
                  "#import <Foundation/Foundation.h>\n\n@protocol " + out.objcName + " <NSObject>\n";
  std::string sw = "// " + gen + "\nimport Foundation\n\n/// The native module " + nm + " on iOS: conform a class to it, name the class with @objc(Name) and in plugin.json targets.ios.class.\n@objc public protocol " + out.objcName + " {\n";
  std::string ob = "// " + gen + "\n// Native" + nm + " over the Objective-C or Swift class ZN_NATIVE_CLASS (plugin.json targets.ios.class).\n#import <Foundation/Foundation.h>\n#include \"zinc_native_" + lower + ".h\"\n#import \"" + out.objcName + ".h\"\n\n"
                   "namespace {\nNSString* ns(zrt::String s) { return [[NSString alloc] initWithBytes:s.ptr() length:s.bytes() encoding:NSUTF8StringEncoding] ?: @\"\"; }\n"
                   "zrt::String zs(NSString* s) { const char* p = s.UTF8String ?: \"\"; return zrt::String::from(p, static_cast<uint32_t>(strlen(p))); }\n"
                   "struct Objc" + nm + " : Native" + nm + " {\n  id<" + out.objcName + "> impl = nil;\n";
  for (const MobileMethod& m : ms) {
    std::string sel, swp, msg, pre, decl;
    for (std::size_t q = 0; q < m.params.size(); ++q) {
      const MobileParam& p = m.params[q];
      std::string ot, st, arg;
      if (p.l == 'c') {
        std::string bp, sp, fwd;
        for (std::size_t r = 0; r < p.cb.size(); ++r) {
          const char cl = p.cb[r];
          const std::string an = "a" + std::to_string(r);
          bp += std::string(r ? ", " : "") + objcType(cl) + " " + an;
          sp += std::string(r ? ", " : "") + swiftType(cl);
          fwd += std::string(r ? ", " : "") + (cl == 's' ? "zs(" + an + ")" : cl == 'b' ? an + " != NO" : an);
        }
        ot = std::string("void (^)(") + (bp.empty() ? "void" : bp) + ")";
        st = "@escaping (" + sp + ") -> Void";
        arg = "^(" + bp + ") { dispatch_async(dispatch_get_main_queue(), ^{ (*f_" + p.name + ")(" + fwd + "); }); }";   // the program's values are made on its thread
        pre += "auto* f_" + p.name + " = new " + p.cpp + "(" + p.name + ");   // ponytail: kept for the program's life (a callback is registered once)\n    ";
      } else {
        ot = objcType(p.l);
        st = swiftType(p.l);
        arg = p.l == 's' ? "ns(" + p.name + ")" : p.l == 'b' ? "(" + p.name + " ? YES : NO)" : p.name;
      }
      sel += (q == 0 ? std::string(":") : " " + p.name + ":") + "(" + ot + ")" + p.name;   // - (r)name:(T)a second:(U)b, as Swift's func name(_ a: T, second b: U)
      swp += (q == 0 ? "_ " : ", ") + p.name + ": " + st;
      msg += (q == 0 ? ":" : " " + p.name + ":") + arg;
      decl += std::string(q ? ", " : "") + p.cpp + " " + p.name;
    }
    h += "- (" + std::string(objcType(m.ret)) + ")" + m.name + sel + ";\n";
    sw += "  func " + m.name + "(" + swp + ")" + (m.ret == 'n' ? "" : std::string(" -> ") + swiftType(m.ret)) + "\n";
    const std::string send = "[impl " + m.name + msg + "]";
    std::string body = pre;
    if (m.ret == 'n') body += send + ";";
    else if (m.ret == 's') body += "return zs(" + send + ");";
    else if (m.ret == 'b') body += "return " + send + " != NO;";
    else body += "return " + send + ";";
    ob += "  " + m.retCpp + " " + m.name + "(" + decl + ") override {\n    " + body + "\n  }\n";
  }
  h += "@end\n";
  sw += "}\n";
  ob += "};\n}  // namespace\n\nNative" + nm + "* zinc_create_" + nm + "() {\n  static Objc" + nm + " m;\n  m.rc = zrt::IMMORTAL;\n  Class c = NSClassFromString(@ZN_NATIVE_CLASS);\n"
        "  if (!c) NSLog(@\"zinc: the class %@ of " + nm + " (plugin.json targets.ios.class) is not in the app\", @ZN_NATIVE_CLASS);\n  m.impl = [c new];\n  return &m;\n}\n";
  out.objcHeader = h;
  out.swiftProtocol = sw;
  out.objcBridge = ob;
}

}  // namespace

std::string recordSchema(const Ast& a, const std::string& text, std::uint32_t ty, std::string& err) {
  Records r(a, text);
  if (!r.holds(ty)) return "";
  std::string s = r.type(ty);
  err = r.err;
  return s;
}

std::string recordSchemasForJs(const std::string& text) {
  std::size_t at = text.find("requireNative<");
  if (at == std::string::npos) return text;
  ParseResult pr = parse(text);
  if (pr.ast.root == kNone || !pr.diags.empty()) return text;
  Records recs(pr.ast, text);
  std::size_t q = at + 14, e = q;
  while (e < text.size() && (std::isalnum(static_cast<unsigned char>(text[e])) || text[e] == '_' || text[e] == '$')) ++e;
  auto it = recs.ifaces.find(text.substr(q, e - q));
  std::size_t lp = text.find('(', e), qa = lp == std::string::npos ? lp : text.find_first_of("'\"", lp);
  std::size_t qb = qa == std::string::npos ? qa : text.find(text[qa], qa + 1);
  if (it == recs.ifaces.end() || qb == std::string::npos || text.compare(qb + 1, 1, ")") != 0) return text;
  std::string table;
  const Node& in = pr.ast.nodes[it->second];
  for (std::size_t k = 1; k < in.kids.size(); ++k) {
    const Node& m = pr.ast.nodes[in.kids[k]];
    if (m.kind != N::Method) continue;
    std::string row;
    bool any = false;
    auto one = [&](std::uint32_t t) { std::string err, s = t == kNone ? "" : recordSchema(pr.ast, text, t, err); any = any || !s.empty(); row += std::string(row.empty() ? "" : ",") + "'" + s + "'"; };
    for (std::size_t j = 2; j < m.kids.size(); ++j) one(pr.ast.nodes[m.kids[j]].kids.empty() ? kNone : pr.ast.nodes[m.kids[j]].kids[0]);
    std::uint32_t rt = m.kids.empty() ? kNone : m.kids[0];
    if (rt != kNone && pr.ast.nodes[rt].kind == N::TypeRef && pr.ast.nodes[rt].text == "Promise" && pr.ast.nodes[rt].kids.size() == 1) rt = pr.ast.nodes[rt].kids[0];
    one(rt);
    if (any) table += std::string(table.empty() ? "" : ", ") + std::string(m.text) + ": [" + row + "]";
  }
  return table.empty() ? text : text.substr(0, qb + 1) + ", { " + table + " }" + text.substr(qb + 1);
}

std::string schemaOfType(const std::string& decls, const std::string& type) {
  const std::string text = decls + "\ntype __ZnMessage = " + type + ";\n";
  ParseResult pr = parse(text);
  if (pr.ast.root == kNone || !pr.diags.empty()) return "";
  Records r(pr.ast, text);
  auto it = r.aliases.find("__ZnMessage");
  if (it == r.aliases.end()) return "";
  std::string s = r.type(it->second);
  return r.err.empty() ? s : "";
}

std::string nativeLetter(const Ast& a, const std::string& text, std::uint32_t ty, bool result, bool dyn) {
  if (ty == kNone) return "n";
  const Node& x = a.nodes[ty];
  std::string s;
  for (std::size_t k = x.start; k < x.end; ++k) if (!std::isspace(static_cast<unsigned char>(text[k]))) s += text[k];
  static const std::map<std::string, std::string> kLetters = {{"i32", "i"}, {"u32", "u"}, {"boolean", "b"}, {"f64", "d"}, {"number", "d"}, {"string", "s"}, {"u8[]", "B"}, {"i32[]", "I"}, {"u32[]", "U"}, {"f64[]", "D"}, {"number[]", "D"}, {"string[]", "S"}, {"void", "n"}};
  auto it = kLetters.find(s);
  if (it != kLetters.end()) return it->second;
  if (dyn && (s == "unknown" || s == "unknown[]")) return "s";
  if (dyn && s == "DynFunction" && !result) return "c(s>s)";
  if (x.kind == N::TypeFunc) {
    std::string params;
    for (std::size_t k = 1; k < x.kids.size(); ++k) {
      const Node& p = a.nodes[x.kids[k]];
      std::string l = p.kids.empty() ? "" : nativeLetter(a, text, p.kids[0], false, dyn);
      if (l.size() != 1 || l == "n" || l == "S" || !std::strchr("siubdBID", l[0])) return "";
      params += l;
    }
    std::string r = nativeLetter(a, text, x.kids[0], false, dyn);
    if (r.size() != 1 || !std::strchr("nsiubd", r[0])) return "";
    return "c(" + params + ">" + r + ")";
  }
  if (result && x.kind == N::TypeRef && x.text == "Promise" && x.kids.size() == 1) {
    std::string l = nativeLetter(a, text, x.kids[0], false, dyn);
    return l.size() == 1 && l != "S" ? "P" + l : "";
  }
  return "";
}

bool generateNative(const std::string& specFile, const std::string& text, NativeGen& out, std::string& err) {
  ParseResult pr = parse(text);
  if (pr.ast.root == kNone || !pr.diags.empty()) { err = "the spec does not parse"; return false; }
  Records recs(pr.ast, text);
  Gen g{text, pr.ast, {}, {}, 0, &recs};
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
  for (std::size_t k = 1; k < pr.ast.nodes[iface].kids.size(); ++k) {   // the records of the members (ZN-850): checked, and their structs written first
    const Node& m = pr.ast.nodes[pr.ast.nodes[iface].kids[k]];
    std::vector<std::uint32_t> ts;
    if (!m.kids.empty() && m.kids[0] != kNone) { const Node& r = pr.ast.nodes[m.kids[0]]; ts.push_back(r.kind == N::TypeRef && r.text == "Promise" && r.kids.size() == 1 ? r.kids[0] : m.kids[0]); }
    for (std::size_t j = 2; m.kind == N::Method && j < m.kids.size(); ++j) if (!pr.ast.nodes[m.kids[j]].kids.empty()) ts.push_back(pr.ast.nodes[m.kids[j]].kids[0]);
    for (std::uint32_t t : ts) if (t != kNone && recs.holds(t)) { recs.type(t); if (!recs.err.empty()) { err = "member '" + std::string(m.text) + "': " + recs.err; return false; } }
  }
  // records use the standard library (include/zn/rec.h): its placement new, not zrt.h's, so this header comes before any other include of zrt.h
  const std::string hosted = recs.order.empty() ? "" : "#ifndef ZRT_HOSTED_CPP\n#define ZRT_HOSTED_CPP   // the records' std types: the standard library's placement new, not zrt.h's\n#endif\n";
  std::string h = "// Generated by zinc codegen from " + base + ". Implement per target.\n#pragma once\n" + hosted + "#include \"zrt.h\"\n#include \"mod/native.h\"\n\n";
  if (!recs.order.empty())
    h += "// The records of the spec (include/zn/rec.h): a member's record crosses as its bytes, zn::rec::encode(value) and zn::rec::decode(p, n, value),\n"
         "// which a worker thread may call; zn::rec::array and zn::rec::read turn them into the engine's array on the program's thread.\n#include \"zn/rec.h\"\n"
         "#ifndef ZN_REC_ZRT\n#define ZN_REC_ZRT\nnamespace zn::rec {\n"
         "inline zrt::Array<uint8_t> array(const std::vector<uint8_t>& v) { auto r = zrt::Array<uint8_t>::with_cap(static_cast<int32_t>(v.size())); if (!v.empty()) memcpy(r.a->data, v.data(), v.size()); r.a->len = static_cast<int32_t>(v.size()); return r; }\n"
         "template <class T> bool read(const zrt::Array<uint8_t>& a, T& out) { return decode(a.a ? a.a->data : nullptr, a.a ? static_cast<size_t>(a.a->len) : 0, out); }\n"
         "}  // namespace zn::rec\n#endif\n" + recs.structs() + "\n";
  h += "struct Native" + out.name + " : zrt::Object {\n";
  std::string cdecl, ctable, cfail, texports, tfuncs, tfail;
  for (std::size_t k = 1; k < pr.ast.nodes[iface].kids.size(); ++k) {
    const Node& m = pr.ast.nodes[pr.ast.nodes[iface].kids[k]];
    std::string mname(m.text);
    if (m.kind == N::Method) {
      std::string ps, sig, tsig, targs, tpre, tpost;
      bool tOk = true;
      char rl = g.letter(m.kids.empty() ? kNone : m.kids[0]);
      char promiseOf = 0;   // a Promise<T> result: the letter of T (n for void)
      if (!m.kids.empty() && m.kids[0] != kNone && pr.ast.nodes[m.kids[0]].kind == N::TypeRef && pr.ast.nodes[m.kids[0]].text == "Promise" && pr.ast.nodes[m.kids[0]].kids.size() == 1) {
        promiseOf = g.letter(pr.ast.nodes[m.kids[0]].kids[0]);
        if (promiseOf && std::strchr("nsiubdB", promiseOf)) rl = 'P'; else promiseOf = 0;
      }
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
          case 'B': case 'I': case 'U': case 'D': {   // an array: the plugin may fill it (an out parameter); a change is copied back for the engine after the call
            const char* et = l == 'B' ? "uint8_t" : l == 'I' ? "int32_t" : l == 'U' ? "uint32_t" : "double";
            tpre += std::string("static zrt::Array<") + et + "> kv" + idx + ";\n  auto av" + idx + " = zn::compat::arr<" + et + ">(a[" + idx + "], kv" + idx + ");\n  ";
            tpost += "zn::compat::back(H, cx, const_cast<ZnVal&>(a[" + idx + "]), av" + idx + ");\n  ";
            ex = "av" + idx;
            break;
          }
          case 'S': ex = "zn::compat::arrStr(a[" + idx + "])"; break;
          default: break;
        }
        if (ex.empty() && pt && pt->kind == N::TypeFunc) {  // a callback: a result of void is queued on the engine's thread (cb_post), a value is asked for at once (cb_call)
          std::string cs, ctypes, cputs;
          bool fok = true;
          char cr = g.letter(pt->kids[0]);
          if (!cr || !std::strchr("nsiubd", cr)) fok = false;
          for (std::size_t q = 1; q < pt->kids.size() && fok; ++q) {
            const Node& cp = pr.ast.nodes[pt->kids[q]];
            char cl = cp.kids.empty() ? 0 : g.letter(cp.kids[0]);
            if (!cl || !std::strchr("siubdBID", cl)) { fok = false; break; }
            cs += cl;
            ctypes += (q > 1 ? ", " : "") + g.cpp(cp.kids[0]) + " x" + std::to_string(q - 1);
            cputs += "zn::compat::put(v[" + std::to_string(q - 1) + "], x" + std::to_string(q - 1) + "); ";
          }
          if (fok) {
            std::string nv = std::to_string(std::max<std::size_t>(pt->kids.size() - 1, 1)), na = std::to_string(pt->kids.size() - 1);
            std::string capture = "[cb = H->cb_retain(a[" + idx + "].h)](" + ctypes + ")";
            if (cr == 'n') ex = t + "(" + capture + " { ZnVal v[" + nv + "]; " + cputs + "H->cb_post(cb, \"" + cs + "\", v, " + na + "); })";
            else {
              std::string cppRet = g.cpp(pt->kids[0]);
              std::string get = cr == 'd' ? "r.d" : cr == 's' ? "zrt::String::from(r.s.p, r.s.n)" : cr == 'b' ? "r.i != 0" : "static_cast<" + cppRet + ">(r.i)";
              ex = t + "(" + capture + " -> " + cppRet + " { ZnVal v[" + nv + "]; " + cputs + "ZnVal r; r.u = 0; H->cb_call(cb, v, " + na + ", &r); return " + get + "; })";
            }
            tsig += "c(" + cs + ">" + std::string(1, cr) + ")";
          }
        } else if (!ex.empty()) tsig += l;
        if (ex.empty()) tOk = false; else targs += (j > 2 ? ", " : "") + ex;
      }
      std::string r = g.cpp(m.kids.empty() ? kNone : m.kids[0]);
      if (r.empty()) { err = "member '" + mname + "': " + g.err; return false; }
      h += "  virtual " + r + " " + mname + "(" + ps + ") = 0;\n";
      if (rl == 'P') {   // a zrt::Promise: the export takes the engine's promise, and the zrt promise's settling completes it (the poll turns drain zrt's microtasks)
        std::string call = "zn_" + out.name + "->" + mname + "(" + targs + ")";
        std::string ok = promiseOf == 'n' ? "H->promise_resolve(id, \"n\", nullptr);" : promiseOf == 'd' ? "ZnVal v; v.d = pr.p->val; H->promise_resolve(id, \"d\", &v);" : promiseOf == 's' ? "ZnVal v; zn::compat::put(v, pr.p->val); H->promise_resolve(id, \"s\", &v);" : promiseOf == 'b' ? "ZnVal v; v.i = pr.p->val; H->promise_resolve(id, \"b\", &v);" : promiseOf == 'B' ? "ZnVal v; zn::compat::put(v, pr.p->val); H->promise_resolve(id, \"B\", &v);" : "ZnVal v; v.i = pr.p->val; H->promise_resolve(id, \"" + std::string(1, promiseOf) + "\", &v);";
        tfuncs += "static int32_t t_" + mname + "(void*, ZnCtx* cx, const ZnVal* a, ZnVal* r) {\n  (void)a; (void)r;\n  " + tpre + "auto pr = " + call + ";\n  " + tpost + "uint64_t id = H->promise_take(cx);\n"
                  "  pr.p->on_settle(zrt::Fn<void()>([pr, id]() {\n    if (pr.p->st == 1) { " + ok + " }\n    else { char m[256]; uint32_t n = pr.p->err.p ? (pr.p->err->message.bytes() < 255 ? pr.p->err->message.bytes() : 255) : 0; if (n) __builtin_memcpy(m, pr.p->err->message.ptr(), n); else { __builtin_memcpy(m, \"rejected\", 8); n = 8; } m[n] = 0; H->promise_reject(id, m); }\n  }));\n"
                  "  zrt::drain_microtasks();\n  return ZN_PENDING;\n}\n";
        texports += "  {\"" + mname + "\", \"" + tsig + ">P" + std::string(1, promiseOf) + "\", t_" + mname + ", 0},\n";
      } else if (rl == 0 || !tOk) { if (tfail.empty()) tfail = "member '" + mname + "' uses a type the thunk cannot carry yet (scalars, strings, arrays, callbacks returning void)"; }
      else {
        std::string call = "zn_" + out.name + "->" + mname + "(" + targs + ")";
        std::string store = rl == 'd' ? "r->d = rv;" : (rl == 's' || rl == 'B' || rl == 'I' || rl == 'D') ? "zn::compat::ret(H, cx, r, rv);" : "r->i = rv;";
        std::string body = rl == 'n' ? call + ";\n  " + tpost : "auto rv = " + call + ";\n  " + tpost + store;
        tfuncs += "static int32_t t_" + mname + "(void*, ZnCtx* cx, const ZnVal* a, ZnVal* r) {\n  (void)a; (void)r;\n  " + tpre + body + "\n  return zn::compat::done(H, cx);\n}\n";
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
                "static bool t_held = false;   // keeps the loop alive while a Poller of the plugin is active (a child process, an open socket)\n"
                "static void t_poll(void*, uint64_t) { bool active = zrt::poll_pollers(); if (active && !t_held) { H->loop_ref(); t_held = true; } else if (!active && t_held) { H->loop_unref(); t_held = false; } }\n"
                "extern \"C\" const ZnModule* zn_module_" + out.name + "(void) {\n  static ZnModule m;\n  m.abi = ZN_ABI_VERSION;\n  m.size = static_cast<uint32_t>(sizeof m);\n  m.name = \"" + out.name + "\";\n"
                "  m.exports = kExports;\n  m.nexports = static_cast<uint32_t>(sizeof kExports / sizeof kExports[0]);\n  m.flags = ZN_THREADS;\n  m.init = t_init;\n  m.poll = t_poll;\n  return &m;\n}\n";
  }
  mobileGlue(g, pr.ast, iface, base, lower, out);
  return true;
}

}  // namespace zn::frontend

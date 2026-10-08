#include "lsp/lsp.h"

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <memory>
#include <set>
#include <sstream>

#include "frontend/check.h"
#include "frontend/modules.h"
#include "yyjson.h"

namespace fs = std::filesystem;
using namespace zn::frontend;

namespace zn::lsp {
namespace {

std::string quote(const std::string& t) {
  std::string q = "\"";
  for (char c : t) {
    if (c == '"' || c == '\\') { q += '\\'; q += c; }
    else if (c == '\n') q += "\\n";
    else if (c == '\t') q += "\\t";
    else if (static_cast<unsigned char>(c) < 32) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); q += b; }
    else q += c;
  }
  return q + "\"";
}

std::string uriToPath(const std::string& uri) {
  if (uri.rfind("file://", 0) != 0) return uri;
  std::string p = uri.substr(7), out;
  for (std::size_t i = 0; i < p.size(); ++i) {
    if (p[i] == '%' && i + 2 < p.size()) { out += static_cast<char>(std::strtol(p.substr(i + 1, 2).c_str(), nullptr, 16)); i += 2; }
    else out += p[i];
  }
  return out;
}
std::string pathToUri(const std::string& path) {
  std::string out = "file://";
  for (unsigned char c : path) {
    if (std::isalnum(c) || c == '/' || c == '-' || c == '_' || c == '.' || c == '~') out += static_cast<char>(c);
    else { char b[4]; std::snprintf(b, sizeof b, "%%%02X", c); out += b; }
  }
  return out;
}

// byte offsets <-> LSP positions (line, UTF-16 column)
struct Lines {
  std::vector<std::size_t> starts;
  explicit Lines(const std::string& t) { starts.push_back(0); for (std::size_t i = 0; i < t.size(); ++i) if (t[i] == '\n') starts.push_back(i + 1); }
  void pos(const std::string& t, std::size_t off, int& line, int& ch) const {
    off = std::min(off, t.size());
    auto it = std::upper_bound(starts.begin(), starts.end(), off);
    line = static_cast<int>(it - starts.begin()) - 1;
    ch = 0;
    for (std::size_t i = starts[line]; i < off;) {
      unsigned char c = static_cast<unsigned char>(t[i]);
      const int len = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4;
      ch += len == 4 ? 2 : 1;
      i += len;
    }
  }
  std::size_t offset(const std::string& t, int line, int ch) const {
    if (line < 0) return 0;
    if (line >= static_cast<int>(starts.size())) return t.size();
    std::size_t i = starts[line];
    int col = 0;
    while (i < t.size() && t[i] != '\n' && col < ch) {
      unsigned char c = static_cast<unsigned char>(t[i]);
      const int len = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4;
      col += len == 4 ? 2 : 1;
      i += len;
    }
    return i;
  }
};

struct Analysis {
  Program prog;
  Checked checked;
  bool checkedOk = false;
  std::vector<Diag> diags;
};

struct Doc { std::string text; int version = 0; std::shared_ptr<Analysis> last; };

class Server {
 public:
  explicit Server(std::string stdRoot) : stdRoot_(std::move(stdRoot)) {}
  int run();

 private:
  std::string stdRoot_;
  std::map<std::string, Doc> docs_;   // uri -> text
  bool shutdown_ = false;

  bool read(const std::string& path, std::string& out) {
    auto it = docs_.find(pathToUri(path));
    if (it != docs_.end()) { out = it->second.text; return true; }
    std::ifstream f(path, std::ios::binary);
    if (!f) return false;
    std::stringstream ss; ss << f.rdbuf(); out = ss.str();
    return true;
  }
  std::shared_ptr<Analysis> analyze(const std::string& path, const std::string* override = nullptr) {
    auto a = std::make_shared<Analysis>();
    ReadFile rf = [&](const std::string& p, std::string& out) {
      if (override && p == path) { out = *override; return true; }
      return read(p, out);
    };
    a->prog = loadProgram(path, rf, false, stdRoot_);
    a->diags = a->prog.diags;
    if (a->diags.empty()) { a->checked = check(a->prog.ast); a->checkedOk = true; a->diags = a->checked.diags; }
    return a;
  }

  static void send(const std::string& json) { std::printf("Content-Length: %zu\r\n\r\n%s", json.size(), json.c_str()); std::fflush(stdout); }
  static void reply(const std::string& id, const std::string& result) { send("{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"result\":" + result + "}"); }
  static void notify(const std::string& method, const std::string& params) { send("{\"jsonrpc\":\"2.0\",\"method\":" + quote(method) + ",\"params\":" + params + "}"); }

  std::string range(const std::string& text, std::size_t a, std::size_t b) {
    Lines L(text);
    int l1, c1, l2, c2;
    L.pos(text, a, l1, c1);
    L.pos(text, b, l2, c2);
    return "{\"start\":{\"line\":" + std::to_string(l1) + ",\"character\":" + std::to_string(c1) + "},\"end\":{\"line\":" + std::to_string(l2) + ",\"character\":" + std::to_string(c2) + "}}";
  }

  void publish(const std::string& uri, Doc& d) {
    const std::string path = uriToPath(uri);
    d.last = analyze(path);
    std::string items;
    int n = 0;
    for (const Diag& dg : d.last->diags) {
      if (dg.file >= d.last->prog.files.size() || d.last->prog.files[dg.file].path != path) continue;
      const std::string line = formatDiag(d.last->prog, dg);   // file:line:col: error Zxxxx: message
      std::size_t a = line.find(':'), b = line.find(':', a + 1), c = line.find(':', b + 1);
      const int ln = std::atoi(line.c_str() + a + 1) - 1, col = std::atoi(line.c_str() + b + 1) - 1;
      std::size_t m = line.find(": error ", c);
      std::string message = m == std::string::npos ? line.substr(c + 1) : line.substr(line.find(": ", m + 8) + 2);
      items += std::string(n++ ? "," : "") + "{\"range\":{\"start\":{\"line\":" + std::to_string(ln) + ",\"character\":" + std::to_string(col) + "},\"end\":{\"line\":" + std::to_string(ln) + ",\"character\":" + std::to_string(col + 1) + "}},\"severity\":1,\"code\":" + quote(dg.code) + ",\"source\":\"zinc\",\"message\":" + quote(message) + "}";
    }
    notify("textDocument/publishDiagnostics", "{\"uri\":" + quote(uri) + ",\"diagnostics\":[" + items + "]}");
  }

  // the innermost node of file 0 around `off` that satisfies `pred`
  template <class P>
  static std::uint32_t innermost(const Ast& ast, std::uint32_t file, std::size_t off, P pred) {
    std::uint32_t best = kNone;
    std::size_t bestLen = ~std::size_t{0};
    for (std::uint32_t i = 0; i < ast.nodes.size(); ++i) {
      const Node& n = ast.nodes[i];
      if (n.file != file || off < n.start || off > n.end || !pred(n)) continue;
      if (n.end - n.start <= bestLen) { best = i; bestLen = n.end - n.start; }
    }
    return best;
  }
  static std::size_t fileIndex(const Analysis& a, const std::string& path) { for (std::size_t i = 0; i < a.prog.files.size(); ++i) if (a.prog.files[i].path == path) return i; return 0; }

  std::string hover(const std::string& uri, Doc& d, int line, int ch) {
    if (!d.last || !d.last->checkedOk) return "null";
    const std::string path = uriToPath(uri);
    const Analysis& a = *d.last;
    const std::uint32_t file = static_cast<std::uint32_t>(fileIndex(a, path));
    const std::string& text = a.prog.files[file].text;
    const std::size_t off = Lines(text).offset(text, line, ch);
    std::uint32_t id = innermost(a.prog.ast, file, off, [&](const Node& n) {
      return n.kind == N::Ident || n.kind == N::Declarator || n.kind == N::Param || n.kind == N::Function || n.kind == N::Method || n.kind == N::Field || n.kind == N::Member || n.kind == N::Call || n.kind == N::Class;
    });
    if (id == kNone) return "null";
    const Node& n = a.prog.ast.nodes[id];
    TypeId t = id < a.checked.nodeType.size() ? a.checked.nodeType[id] : kNoType;
    if (n.kind == N::Ident && id < a.checked.nodeSym.size() && a.checked.nodeSym[id] != kNone) t = a.checked.syms[a.checked.nodeSym[id]].type;
    if (t == kNoType) return "null";
    const std::string label = n.kind == N::Call ? std::string("call") : n.text.empty() ? std::string("expression") : std::string(n.text);
    const std::string md = "```ts\n" + label + ": " + typeName(a.checked, t) + "\n```";
    return "{\"contents\":{\"kind\":\"markdown\",\"value\":" + quote(md) + "},\"range\":" + range(text, n.start, n.end) + "}";
  }

  std::string definition(const std::string& uri, Doc& d, int line, int ch) {
    if (!d.last || !d.last->checkedOk) return "null";
    const std::string path = uriToPath(uri);
    const Analysis& a = *d.last;
    const std::uint32_t file = static_cast<std::uint32_t>(fileIndex(a, path));
    const std::string& text = a.prog.files[file].text;
    const std::size_t off = Lines(text).offset(text, line, ch);
    std::uint32_t id = innermost(a.prog.ast, file, off, [](const Node& n) { return n.kind == N::Ident; });
    if (id == kNone || id >= a.checked.nodeSym.size() || a.checked.nodeSym[id] == kNone) return "null";
    const Symbol& s = a.checked.syms[a.checked.nodeSym[id]];
    if (s.decl == kNone || s.decl >= a.prog.ast.nodes.size()) return "null";
    const Node& dn = a.prog.ast.nodes[s.decl];
    if (dn.file >= a.prog.files.size()) return "null";
    const SourceFile& sf = a.prog.files[dn.file];
    // the name inside the declaration node, not the whole declaration
    std::size_t at = sf.text.find(std::string(dn.text), dn.start);
    const std::size_t from = !dn.text.empty() && at != std::string::npos && at < dn.end ? at : dn.start;
    const std::size_t to = !dn.text.empty() && from != dn.start ? from + dn.text.size() : dn.end;
    return "{\"uri\":" + quote(pathToUri(sf.path)) + ",\"range\":" + range(sf.text, from, to) + "}";
  }

  std::string symbols(const std::string& uri, Doc& d) {
    if (!d.last) return "[]";
    const std::string path = uriToPath(uri);
    const Analysis& a = *d.last;
    const std::uint32_t file = static_cast<std::uint32_t>(fileIndex(a, path));
    const std::string& text = a.prog.files[file].text;
    const Ast& ast = a.prog.ast;
    std::string out;
    int count = 0;
    auto add = [&](std::string& dst, int& n, const Node& node, const std::string& name, int kind, const std::string& children) {
      dst += std::string(n++ ? "," : "") + "{\"name\":" + quote(name) + ",\"kind\":" + std::to_string(kind) + ",\"range\":" + range(text, node.start, node.end) + ",\"selectionRange\":" + range(text, node.start, node.end) + ",\"children\":[" + children + "]}";
    };
    auto members = [&](const Node& cls) {
      std::string kids;
      int k = 0;
      for (std::size_t i = cls.kind == N::Class ? kClassMembersFrom : 1; i < cls.kids.size(); ++i) {
        const Node& m = ast.nodes[cls.kids[i]];
        if (m.kind == N::Method) add(kids, k, m, std::string(m.text), m.text == "constructor" ? 9 : 6, "");
        else if (m.kind == N::Field) add(kids, k, m, std::string(m.text), 8, "");
      }
      return kids;
    };
    std::vector<std::uint32_t> stmts;
    if (!ast.modules.empty()) { for (const ModuleInfo& m : ast.modules) if (m.file == file) stmts = m.stmts; }
    else if (ast.root != kNone) stmts = ast.nodes[ast.root].kids;
    for (std::uint32_t s : stmts) {
      const Node* n = &ast.nodes[s];
      if (n->kind == N::Export && !n->kids.empty()) n = &ast.nodes[n->kids[0]];
      switch (n->kind) {
        case N::Function: add(out, count, *n, std::string(n->text), 12, ""); break;
        case N::Class: add(out, count, *n, std::string(n->text), 5, members(*n)); break;
        case N::Interface: add(out, count, *n, std::string(n->text), 11, members(*n)); break;
        case N::Enum: add(out, count, *n, std::string(n->text), 10, ""); break;
        case N::TypeAlias: add(out, count, *n, std::string(n->text), 26, ""); break;
        case N::VarDecl: for (std::uint32_t k : n->kids) { const Node& dcl = ast.nodes[k]; if (dcl.kind == N::Declarator && !dcl.text.empty()) add(out, count, dcl, std::string(dcl.text), n->text == "const" ? 14 : 13, ""); } break;
        default: break;
      }
    }
    return "[" + out + "]";
  }

  std::string completion(const std::string& uri, Doc& d, int line, int ch) {
    const std::string path = uriToPath(uri);
    const std::string& text = d.text;
    const std::size_t off = Lines(text).offset(text, line, ch);
    std::string items;
    int n = 0;
    auto add = [&](const std::string& label, int kind, const std::string& detail) { items += std::string(n++ ? "," : "") + "{\"label\":" + quote(label) + ",\"kind\":" + std::to_string(kind) + ",\"detail\":" + quote(detail) + "}"; };
    // module specifier: inside the quotes of `from '...'` / `import '...'`
    {
      std::size_t ls = text.rfind('\n', off == 0 ? 0 : off - 1);
      ls = ls == std::string::npos ? 0 : ls + 1;
      const std::string head = text.substr(ls, off - ls);
      const std::size_t q1 = head.rfind('\''), q2 = head.rfind('"');
      const std::size_t q = q1 == std::string::npos ? q2 : q2 == std::string::npos ? q1 : std::max(q1, q2);
      if (q != std::string::npos && (head.find("import") != std::string::npos || head.find("from") != std::string::npos) && std::count(head.begin(), head.end(), head[q]) % 2 == 1) {
        const std::string prefix = head.substr(q + 1);
        std::set<std::string> specs = {"zinc:gfx", "zinc:sys", "zinc:fs", "zinc:storage", "zinc:assets", "zinc:os", "zinc:events", "zinc:gpio", "zinc:osc", "zinc:net", "zinc:telemetry", "zinc:platform", "zinc:process", "zinc:script", "zinc:web", "zinc:ui", "zinc:ui/solid", "zinc:ui/react", "zinc:ui/kit", "zinc:system", "zinc:devtools", "zinc:assert"};
        std::error_code ec;
        for (const auto& e : fs::directory_iterator(stdRoot_, ec)) if (e.path().extension() == ".ts") specs.insert("zinc:" + e.path().stem().string());
        for (const std::string& s : specs) if (s.rfind(prefix, 0) == 0) add(s, 9, "module");
        return "{\"isIncomplete\":false,\"items\":[" + items + "]}";
      }
    }
    // member access: parse the text with a placeholder name after the dot, then list the members of the object's type
    if (off > 0 && text[off - 1] == '.') {
      std::string patched = text;
      patched.insert(off, "__zn_complete__");
      auto a = analyze(path, &patched);
      const std::uint32_t file = static_cast<std::uint32_t>(fileIndex(*a, path));
      std::uint32_t id = innermost(a->prog.ast, file, off + 1, [](const Node& nd) { return nd.kind == N::Member && nd.text == "__zn_complete__"; });
      if (id != kNone && a->checkedOk) {
        const Node& mem = a->prog.ast.nodes[id];
        TypeId t = mem.kids.empty() ? kNoType : a->checked.nodeType[mem.kids[0]];
        if (t != kNoType && t < a->checked.types.size()) {
          const Type& ty = a->checked.types[t];
          if (ty.k == TK::Object && ty.obj < a->checked.objs.size()) {
            std::set<std::uint32_t> seen;
            for (std::uint32_t o = ty.obj; o != 0xFFFFFFFFu && o < a->checked.objs.size() && seen.insert(o).second; o = a->checked.objs[o].parent)
              for (const Member& m : a->checked.objs[o].members) if (m.access == 0) add(m.name, m.method ? 2 : 5, typeName(a->checked, m.type));
          } else if (ty.k == TK::Str) { for (const char* s : {"length", "charAt", "charCodeAt", "indexOf", "slice", "split", "toUpperCase", "toLowerCase", "trim", "startsWith", "endsWith", "includes", "replace", "padStart", "padEnd", "at"}) add(s, 6, "string"); }
          else if (ty.k == TK::Array) { for (const char* s : {"length", "push", "pop", "shift", "unshift", "slice", "splice", "indexOf", "includes", "map", "filter", "reduce", "forEach", "join", "sort", "reverse", "find", "some", "every", "at"}) add(s, 6, "array"); }
        }
      }
      return "{\"isIncomplete\":false,\"items\":[" + items + "]}";
    }
    // names in scope: the symbols of the last analysis whose name starts with the typed prefix, plus the keywords
    std::size_t b = off;
    while (b > 0 && (std::isalnum(static_cast<unsigned char>(text[b - 1])) || text[b - 1] == '_' || text[b - 1] == '$')) --b;
    const std::string prefix = text.substr(b, off - b);
    std::set<std::string> seen;
    if (d.last && d.last->checkedOk) {
      for (const Symbol& s : d.last->checked.syms) {
        const std::string name(s.name);
        if (name.empty() || name.rfind(prefix, 0) != 0 || name.rfind("__", 0) == 0 || !seen.insert(name).second) continue;
        add(name, s.kind == SymKind::Func || s.kind == SymKind::GenericFunc ? 3 : s.kind == SymKind::Class || s.kind == SymKind::GenericClass ? 7 : 6, typeName(d.last->checked, s.type));
      }
    }
    for (const char* kw : {"const", "let", "function", "class", "interface", "type", "enum", "return", "if", "else", "for", "while", "switch", "import", "export", "new", "this", "true", "false", "null", "async", "await", "try", "catch", "throw"})
      if (std::string(kw).rfind(prefix, 0) == 0 && seen.insert(kw).second) add(kw, 14, "keyword");
    return "{\"isIncomplete\":false,\"items\":[" + items + "]}";
  }
};

bool readMessage(std::string& body) {
  std::size_t len = 0;
  std::string line;
  bool any = false;
  while (true) {
    line.clear();
    int c;
    while ((c = std::getchar()) != EOF && c != '\n') line += static_cast<char>(c);
    if (c == EOF && line.empty()) return false;
    any = true;
    if (!line.empty() && line.back() == '\r') line.pop_back();
    if (line.empty()) break;
    if (line.rfind("Content-Length:", 0) == 0) len = static_cast<std::size_t>(std::atol(line.c_str() + 15));
  }
  (void)any;
  body.assign(len, '\0');
  return std::fread(body.data(), 1, len, stdin) == len;
}

int Server::run() {
  std::string body;
  while (readMessage(body)) {
    yyjson_doc* doc = yyjson_read(body.c_str(), body.size(), 0);
    if (!doc) continue;
    yyjson_val* root = yyjson_doc_get_root(doc);
    yyjson_val* mv = yyjson_obj_get(root, "method");
    yyjson_val* idv = yyjson_obj_get(root, "id");
    yyjson_val* params = yyjson_obj_get(root, "params");
    const std::string method = mv && yyjson_is_str(mv) ? yyjson_get_str(mv) : "";
    std::string id;
    if (idv) id = yyjson_is_str(idv) ? quote(yyjson_get_str(idv)) : std::to_string(static_cast<long long>(yyjson_get_sint(idv)));
    auto str = [&](yyjson_val* v, const char* k) { yyjson_val* x = v ? yyjson_obj_get(v, k) : nullptr; return x && yyjson_is_str(x) ? std::string(yyjson_get_str(x)) : std::string(); };
    yyjson_val* td = params ? yyjson_obj_get(params, "textDocument") : nullptr;
    const std::string uri = str(td, "uri");
    yyjson_val* pos = params ? yyjson_obj_get(params, "position") : nullptr;
    const int line = pos ? static_cast<int>(yyjson_get_sint(yyjson_obj_get(pos, "line"))) : 0;
    const int ch = pos ? static_cast<int>(yyjson_get_sint(yyjson_obj_get(pos, "character"))) : 0;

    if (method == "initialize") {
      reply(id, "{\"capabilities\":{\"textDocumentSync\":1,\"hoverProvider\":true,\"definitionProvider\":true,\"documentSymbolProvider\":true,\"completionProvider\":{\"triggerCharacters\":[\".\",\"'\",\"\\\"\",\"/\"]}},\"serverInfo\":{\"name\":\"zinc\",\"version\":\"0.0.1\"}}");
    } else if (method == "shutdown") { shutdown_ = true; reply(id, "null"); }
    else if (method == "exit") { yyjson_doc_free(doc); return shutdown_ ? 0 : 1; }
    else if (method == "textDocument/didOpen") {
      yyjson_val* v = td ? yyjson_obj_get(td, "text") : nullptr;
      Doc& d = docs_[uri];
      d.text = v && yyjson_is_str(v) ? yyjson_get_str(v) : "";
      d.version = td ? static_cast<int>(yyjson_get_sint(yyjson_obj_get(td, "version"))) : 0;
      publish(uri, d);
    } else if (method == "textDocument/didChange") {
      yyjson_val* changes = params ? yyjson_obj_get(params, "contentChanges") : nullptr;
      if (changes && yyjson_arr_size(changes) > 0) {
        yyjson_val* last = yyjson_arr_get(changes, yyjson_arr_size(changes) - 1);   // full document sync
        yyjson_val* v = yyjson_obj_get(last, "text");
        Doc& d = docs_[uri];
        d.text = v && yyjson_is_str(v) ? yyjson_get_str(v) : d.text;
        publish(uri, d);
      }
    } else if (method == "textDocument/didClose") {
      docs_.erase(uri);
      notify("textDocument/publishDiagnostics", "{\"uri\":" + quote(uri) + ",\"diagnostics\":[]}");
    } else if (!id.empty() && docs_.count(uri)) {
      Doc& d = docs_[uri];
      if (method == "textDocument/hover") reply(id, hover(uri, d, line, ch));
      else if (method == "textDocument/definition") reply(id, definition(uri, d, line, ch));
      else if (method == "textDocument/documentSymbol") reply(id, symbols(uri, d));
      else if (method == "textDocument/completion") reply(id, completion(uri, d, line, ch));
      else reply(id, "null");
    } else if (!id.empty()) reply(id, "null");
    yyjson_doc_free(doc);
  }
  return shutdown_ ? 0 : 1;
}

}  // namespace

int serve(const std::string& stdRoot) { Server s(stdRoot); return s.run(); }

}  // namespace zn::lsp

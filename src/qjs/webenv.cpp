// The web environment of the QuickJS engine (ZN-568): the window, document, events, frame callbacks, storage and network a JavaScript library written
// for a browser expects around WebGL. The environment is JavaScript (lib/std/webenv.js, read only when a program asks: ZINC_WEB=1, or "web" in its
// zinc.json); this file starts it and gives it what JavaScript cannot do alone, over host rows that exist. A program that does not ask pays nothing.
#include "qjs/qjs.h"

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <initializer_list>
#include <sstream>
#include <vector>

#ifndef ZN_ENGINE_MODULE   // the engine modules (src/engine) build the Node-API part only
extern "C" {
#include "../../third_party/quickjs-ng/quickjs.h"
}
#endif
#include "qjs/napi_util.h"
#include "zn/js_ext.h"

#ifndef ZN_ENGINE_MODULE
#include "frontend/project.h"
#endif
#include "zn/limits.h"
#include "res/codec.h"
#include "zn/host.h"
#include "zn/runtime.h"

namespace zn::qjs {
void installCanvas2d(napi_env env, napi_value native, const std::string& stdRoot);   // canvas2d.cpp: native.c2d, what a 2D context draws with
namespace {
using namespace zn::napi;

bool readText(const std::string& path, std::string& out) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return false;
  std::stringstream ss;
  ss << in.rdbuf();
  out = ss.str();
  return true;
}

#ifndef ZN_ENGINE_MODULE
// ---- engine services: what only the engine itself can do, so each engine gives its own (ZN-773: here QuickJS's)
// structuredClone(value) through QuickJS's own serializer: it keeps cycles, Map, Set, Date, RegExp, typed arrays and array buffers, and refuses a
// function (a browser's DataCloneError)
JSValue js_structuredClone(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  size_t n = 0;
  uint8_t* buf = JS_WriteObject(c, &n, argc > 0 ? argv[0] : JS_UNDEFINED, JS_WRITE_OBJ_REFERENCE);
  if (!buf) return JS_EXCEPTION;
  JSValue v = JS_ReadObject(c, buf, n, JS_READ_OBJ_REFERENCE);
  js_free(c, buf);
  return v;
}
#endif

// ---- files and the network, over the host's rows (so the program's permissions hold): what JavaScript cannot get through `__host_*` is bytes,
// since a row's string result becomes a JavaScript string
using zn::host::HostArg;
HostArg sys(zn::Rt id, std::initializer_list<HostArg> args = {}) {
  HostArg r;
  if (zn::host::hostSys) zn::host::hostSys(static_cast<int>(id), args.begin(), &r);
  return r;
}
struct Text {   // a JavaScript string as a row's string argument
  std::string s;
  bool ok;
  Text(napi_env env, napi_value v) : ok(zn::napi::text(env, v, s)) {}
  HostArg arg() const { HostArg a; a.p = s.data(); a.n = static_cast<std::uint32_t>(s.size()); return a; }
};
HostArg num(std::int64_t i) { HostArg a; a.i = i; a.d = static_cast<double>(i); return a; }
napi_value bytes(napi_env c, const HostArg& r) { return arrayBufferCopy(c, r.p, r.n); }
napi_value text(napi_env c, const HostArg& r) { return string(c, static_cast<const char*>(r.p), r.n); }

// read(path): the file's bytes as an ArrayBuffer, undefined when it cannot be read
napi_value js_read(napi_env c, napi_callback_info info) {
  Args<1> A(c, info);
  if (A.argc < 1) return nullptr;
  Text path(c, A.argv[0]);
  const HostArg r = sys(zn::Rt::HostFsReadText, {path.arg()});   // the row hands the bytes as they are
  if (sys(zn::Rt::HostFsFailed).i) return nullptr;
  return bytes(c, r);
}
// httpFetch(url, method, headerLines, body): a request on the host's loop, its handle (0: refused, httpError says why)
napi_value js_httpFetch(napi_env c, napi_callback_info info) {
  Args<4> A(c, info);
  if (A.argc < 4) return int32v(c, 0);
  Text url(c, A.argv[0]), method(c, A.argv[1]), lines(c, A.argv[2]), body(c, A.argv[3]);
  return int32v(c, static_cast<int32_t>(sys(zn::Rt::HostHttpFetch, {url.arg(), method.arg(), lines.arg(), body.arg(), num(0), num(0)}).i));
}
napi_value js_httpError(napi_env c, napi_callback_info) { return text(c, sys(zn::Rt::HostHttpError)); }
// httpPoll(ms): lets the host's loop work for up to ms, then its next event ("handle\x1fkind\x1fdata": 40 done, 41 failed) or undefined
napi_value js_httpPoll(napi_env c, napi_callback_info info) {
  Args<1> A(c, info);
  double ms = 0;
  if (A.argc > 0) number(c, A.argv[0], ms);
  HostArg wait; wait.d = ms;
  sys(zn::Rt::HostLoopWait, {wait});
  if (!sys(zn::Rt::HostEvReady).i) return nullptr;
  return text(c, sys(zn::Rt::HostEvNext));
}
// httpTake(handle): { status, head, url, body: ArrayBuffer } of a finished request, which is then freed
napi_value js_httpTake(napi_env c, napi_callback_info info) {
  Args<1> A(c, info);
  int32_t h = 0;
  if (A.argc > 0) int32(c, A.argv[0], h);
  napi_value o;
  napi_create_object(c, &o);
  set(c, o, "status", int32v(c, static_cast<int32_t>(sys(zn::Rt::HostHttpStatus, {num(h)}).i)));
  set(c, o, "head", text(c, sys(zn::Rt::HostHttpHead, {num(h)})));
  set(c, o, "url", text(c, sys(zn::Rt::HostHttpUrl, {num(h)})));
  set(c, o, "body", bytes(c, sys(zn::Rt::HostHttpBody, {num(h)})));
  sys(zn::Rt::HostHttpFree, {num(h)});
  return o;
}
// The bytes [at, at + n) of an ArrayBuffer argument (offset and length optional); nullptr with an exception pending when they are not there.
const uint8_t* slice(napi_env c, Args<3>& A, const char* what, std::size_t& len) {
  void* data = nullptr;
  std::size_t size = 0;
  bool is = false;
  if (A.argc < 1 || napi_is_arraybuffer(c, A.argv[0], &is) != napi_ok || !is || napi_get_arraybuffer_info(c, A.argv[0], &data, &size) != napi_ok) {
    napi_throw_type_error(c, nullptr, (std::string(what) + ": not an ArrayBuffer").c_str());
    return nullptr;
  }
  std::int64_t at = 0, n = static_cast<std::int64_t>(size);
  if (A.argc > 1) int64(c, A.argv[1], at);
  if (A.argc > 2) int64(c, A.argv[2], n);
  if (at < 0 || n < 0 || static_cast<std::uint64_t>(at) + static_cast<std::uint64_t>(n) > size) { throwRange(c, std::string(what) + ": outside the buffer"); return nullptr; }
  len = static_cast<std::size_t>(n);
  return static_cast<const uint8_t*>(data) + at;
}
// decode(buffer, offset, length): UTF-8 bytes as a string (the TextDecoder of every context is JavaScript, a byte at a time)
napi_value js_decode(napi_env c, napi_callback_info info) {
  Args<3> A(c, info);
  std::size_t n = 0;
  const uint8_t* p = slice(c, A, "decode", n);
  return p ? string(c, reinterpret_cast<const char*>(p), n) : nullptr;
}
// ponytail: one image size limit for every program (zn::kMaxImagePixels, include/zn/limits.h); a zinc.json key if a program ever needs more
// decodeImage(buffer, offset, length): the pixels of an image file through the engine's codec (src/res/codec.h: PNG, JPEG, BMP, the first frame
// of a GIF, WebP) as { data: ArrayBuffer of RGBA8 rows from the top, alpha not premultiplied, width, height }. undefined when the bytes are
// not such an image; a RangeError when it is larger than kMaxImagePixels. The buffer is the decoder's own storage, handed over, not copied.
napi_value js_decodeImage(napi_env c, napi_callback_info info) {
  Args<3> A(c, info);
  std::size_t n = 0;
  const uint8_t* p = slice(c, A, "decodeImage", n);
  if (!p) return nullptr;
  int w = 0, h = 0;
  if (!zn::res::imageSize(p, n, w, h) || w <= 0 || h <= 0) return nullptr;
  if (static_cast<std::int64_t>(w) * h > kMaxImagePixels)
    return throwRange(c, "an image of " + std::to_string(w) + " x " + std::to_string(h) + " pixels is larger than the " + std::to_string(static_cast<long long>(kMaxImagePixels)) + " the web environment decodes");
  auto* px = new std::vector<uint8_t>();
  if (!zn::res::decodeRgba(p, n, w, h, *px) || px->size() != static_cast<size_t>(w) * h * 4) { delete px; return nullptr; }
  napi_value o, data;
  if (napi_create_external_arraybuffer(c, px->data(), px->size(), [](napi_env, void*, void* hint) { delete static_cast<std::vector<uint8_t>*>(hint); }, px, &data) != napi_ok) {
    data = arrayBufferCopy(c, px->data(), px->size());   // an engine that cannot hand memory over (V8's sandbox): one copy
    delete px;
  }
  napi_create_object(c, &o);
  set(c, o, "data", data);
  set(c, o, "width", int32v(c, w));
  set(c, o, "height", int32v(c, h));
  return o;
}
// run(text, name): a classic script, run as the global code it is (its functions and vars become the window's), under its file's name in stack traces
napi_value js_run(napi_env c, napi_callback_info info) {
  Args<2> A(c, info);
  if (A.argc < 2) return nullptr;
  napi_value code, r = nullptr;
  std::string name;
  if (napi_coerce_to_string(c, A.argv[0], &code) != napi_ok || !zn::napi::text(c, A.argv[1], name)) return nullptr;
  napi_run_script(c, code, name.c_str(), &r);
  return r;
}
#ifndef ZN_ENGINE_MODULE
// module(name): the namespace of a module, loaded and run now: `new URL()` cannot wait for an import. A module that imports it and leaves the
// namespace on the global object is evaluated here; QuickJS runs a module's body at once (only its promise settles later), so one with no
// top-level await has left it when JS_Eval returns. The import goes through the engine's own loader.
JSValue js_module(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  if (argc < 1) return JS_UNDEFINED;
  const char* chars = JS_ToCString(c, argv[0]);
  if (!chars) return JS_EXCEPTION;
  const std::string name = chars;
  JS_FreeCString(c, chars);
  if (name.find_first_of("'\\\n") != std::string::npos) return JS_ThrowTypeError(c, "module: not a module name");
  const std::string src = "import * as m from '" + name + "'; globalThis.__zincWebModule = m;";
  JSValue p = JS_Eval(c, src.data(), src.size(), "zinc:webenv/import", JS_EVAL_TYPE_MODULE);
  if (JS_IsException(p)) return p;
  if (JS_PromiseState(c, p) == JS_PROMISE_REJECTED) { JSValue err = JS_PromiseResult(c, p); JS_PromiseMarkAsHandled(c, p); JS_FreeValue(c, p); return JS_Throw(c, err); }
  JS_FreeValue(c, p);
  JSValue g = JS_GetGlobalObject(c), m = JS_GetPropertyStr(c, g, "__zincWebModule");
  JSAtom key = JS_NewAtom(c, "__zincWebModule");
  JS_DeleteProperty(c, g, key, 0);
  JS_FreeAtom(c, key);
  JS_FreeValue(c, g);
  if (JS_IsUndefined(m)) return JS_ThrowInternalError(c, "module %s did not run to its end", name.c_str());
  return m;
}
#endif

}  // namespace

#ifndef ZN_ENGINE_MODULE
std::string webMode(const std::string& entry) {
  if (const char* v = std::getenv("ZINC_WEB"); v && *v) return std::strcmp(v, "0") ? v : "";   // ZINC_WEB=0 turns a project's "web" off, ZINC_WEB=trace names the window members a library misses
  const std::string projectFile = zn::frontend::findProjectFile(entry);
  std::string text;
  zn::frontend::Project project;
  std::string err;
  return !projectFile.empty() && readText(projectFile, text) && zn::frontend::parseProject(text, project, err) && project.web ? "1" : "";
}

std::string webBase(const std::string& entry) {   // the page's directory, what relative URLs resolve against: the project's (where zinc.json is, as index.html would be), else the entry's
  const std::string projectFile = zn::frontend::findProjectFile(entry);
  return std::filesystem::path(projectFile.empty() ? entry : projectFile).parent_path().string();
}
#endif

bool webEnv(napi_env env, const std::string& stdRoot, const std::string& mode, const std::string& base, void (*services)(napi_env env, napi_value web)) {
  const std::string path = stdRoot + "/webenv.js";
  std::string js;
  if (!readText(path, js)) { std::fprintf(stderr, "zinc: the web environment is missing (%s)\n", path.c_str()); return false; }
  napi_value g, n, code, r;
  napi_get_global(env, &g);
  napi_create_object(env, &n);
  method(env, n, "read", js_read);
  method(env, n, "httpFetch", js_httpFetch);
  method(env, n, "httpError", js_httpError);
  method(env, n, "httpPoll", js_httpPoll);
  method(env, n, "httpTake", js_httpTake);
  method(env, n, "decode", js_decode);
  method(env, n, "decodeImage", js_decodeImage);
  method(env, n, "run", js_run);
  set(env, n, "base", string(env, base));
  set(env, n, "trace", boolean(env, mode == "trace"));
  installCanvas2d(env, n, stdRoot);
  services(env, n);   // structuredClone and module, the engine's own
  set(env, g, "__zincWeb", n);   // the environment takes it and removes it
  napi_create_string_utf8(env, js.data(), js.size(), &code);
  if (napi_run_script(env, code, "zinc:webenv", &r) == napi_ok) return true;
  napi_value ex, st;
  napi_get_and_clear_last_exception(env, &ex);
  std::string s = "exception", stack;
  zn::napi::text(env, ex, s);
  napi_valuetype t = napi_undefined;
  napi_typeof(env, ex, &t);
  if (t == napi_object && napi_get_named_property(env, ex, "stack", &st) == napi_ok && isString(env, st)) zn::napi::text(env, st, stack);
  std::fprintf(stderr, "zinc: the web environment failed: %s\n%s", s.c_str(), stack.c_str());
  return false;
}

#ifndef ZN_ENGINE_MODULE
bool webEnv(JSContext* ctx, const std::string& stdRoot, const std::string& entry) {
  const std::string mode = webMode(entry);
  if (mode.empty()) return true;
  return webEnv(napiEnv(ctx), stdRoot, mode, webBase(entry), [](napi_env env, napi_value web) {   // QuickJS's serializer and module loader
    JSContext* c = contextOf(env);
    set(env, web, "structuredClone", zn_napi_inline::push(env, JS_NewCFunction(c, js_structuredClone, "structuredClone", 1)));
    set(env, web, "module", zn_napi_inline::push(env, JS_NewCFunction(c, js_module, "module", 1)));
  });
}
#endif

}  // namespace zn::qjs

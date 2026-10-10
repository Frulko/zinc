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

extern "C" {
#include "../../third_party/quickjs-ng/quickjs.h"
}

#include "frontend/project.h"
#include "zn/host.h"
#include "zn/runtime.h"

namespace zn::qjs {
namespace {

bool readText(const std::string& path, std::string& out) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return false;
  std::stringstream ss;
  ss << in.rdbuf();
  out = ss.str();
  return true;
}

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

// ---- files and the network, over the host's rows (so the program's permissions hold): what JavaScript cannot get through `__host_*` is bytes,
// since a row's string result becomes a JavaScript string
using zn::host::HostArg;
HostArg sys(zn::Rt id, std::initializer_list<HostArg> args = {}) {
  HostArg r;
  if (zn::host::hostSys) zn::host::hostSys(static_cast<int>(id), args.begin(), &r);
  return r;
}
struct Text {   // a JavaScript string as a row's string argument
  JSContext* c; size_t n = 0; const char* p;
  Text(JSContext* ctx, JSValueConst v) : c(ctx), p(JS_ToCStringLen(ctx, &n, v)) {}
  ~Text() { if (p) JS_FreeCString(c, p); }
  HostArg arg() const { HostArg a; a.p = p ? p : ""; a.n = static_cast<std::uint32_t>(p ? n : 0); return a; }
};
HostArg num(std::int64_t i) { HostArg a; a.i = i; a.d = static_cast<double>(i); return a; }
JSValue bytes(JSContext* c, const HostArg& r) { return JS_NewArrayBufferCopy(c, static_cast<const uint8_t*>(r.p), r.n); }
JSValue text(JSContext* c, const HostArg& r) { return JS_NewStringLen(c, static_cast<const char*>(r.p), r.n); }

// read(path): the file's bytes as an ArrayBuffer, undefined when it cannot be read
JSValue js_read(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  if (argc < 1) return JS_UNDEFINED;
  Text path(c, argv[0]);
  const HostArg r = sys(zn::Rt::HostFsReadText, {path.arg()});   // the row hands the bytes as they are
  if (sys(zn::Rt::HostFsFailed).i) return JS_UNDEFINED;
  return bytes(c, r);
}
// httpFetch(url, method, headerLines, body): a request on the host's loop, its handle (0: refused, httpError says why)
JSValue js_httpFetch(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  if (argc < 4) return JS_NewInt32(c, 0);
  Text url(c, argv[0]), method(c, argv[1]), lines(c, argv[2]), body(c, argv[3]);
  return JS_NewInt32(c, static_cast<int32_t>(sys(zn::Rt::HostHttpFetch, {url.arg(), method.arg(), lines.arg(), body.arg(), num(0), num(0)}).i));
}
JSValue js_httpError(JSContext* c, JSValueConst, int, JSValueConst*) { return text(c, sys(zn::Rt::HostHttpError)); }
// httpPoll(ms): lets the host's loop work for up to ms, then its next event ("handle\x1fkind\x1fdata": 40 done, 41 failed) or undefined
JSValue js_httpPoll(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  double ms = 0;
  if (argc > 0) JS_ToFloat64(c, &ms, argv[0]);
  HostArg wait; wait.d = ms;
  sys(zn::Rt::HostLoopWait, {wait});
  if (!sys(zn::Rt::HostEvReady).i) return JS_UNDEFINED;
  return text(c, sys(zn::Rt::HostEvNext));
}
// httpTake(handle): { status, head, url, body: ArrayBuffer } of a finished request, which is then freed
JSValue js_httpTake(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  int32_t h = 0;
  if (argc > 0) JS_ToInt32(c, &h, argv[0]);
  JSValue o = JS_NewObject(c);
  JS_SetPropertyStr(c, o, "status", JS_NewInt32(c, static_cast<int32_t>(sys(zn::Rt::HostHttpStatus, {num(h)}).i)));
  JS_SetPropertyStr(c, o, "head", text(c, sys(zn::Rt::HostHttpHead, {num(h)})));
  JS_SetPropertyStr(c, o, "url", text(c, sys(zn::Rt::HostHttpUrl, {num(h)})));
  JS_SetPropertyStr(c, o, "body", bytes(c, sys(zn::Rt::HostHttpBody, {num(h)})));
  sys(zn::Rt::HostHttpFree, {num(h)});
  return o;
}
// decode(buffer, offset, length): UTF-8 bytes as a string (the TextDecoder of every context is JavaScript, a byte at a time)
JSValue js_decode(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  size_t size = 0;
  const uint8_t* p = argc > 0 ? JS_GetArrayBuffer(c, &size, argv[0]) : nullptr;
  if (!p) return JS_EXCEPTION;
  std::int64_t at = 0, n = static_cast<std::int64_t>(size);
  if (argc > 1) JS_ToInt64(c, &at, argv[1]);
  if (argc > 2) JS_ToInt64(c, &n, argv[2]);
  if (at < 0 || n < 0 || static_cast<std::uint64_t>(at) + static_cast<std::uint64_t>(n) > size) return JS_ThrowRangeError(c, "decode: outside the buffer");
  return JS_NewStringLen(c, reinterpret_cast<const char*>(p) + at, static_cast<size_t>(n));
}
// run(text, name): a classic script, run as the global code it is (its functions and vars become the window's), under its file's name in stack traces
JSValue js_run(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  if (argc < 2) return JS_UNDEFINED;
  Text code(c, argv[0]), name(c, argv[1]);
  if (!code.p || !name.p) return JS_EXCEPTION;
  return JS_Eval(c, code.p, code.n, name.p, JS_EVAL_TYPE_GLOBAL);
}
// module(name): the namespace of a module, loaded and run now: `new URL()` cannot wait for an import. A module that imports it and leaves the
// namespace on the global object is evaluated here; QuickJS runs a module's body at once (only its promise settles later), so one with no
// top-level await has left it when JS_Eval returns. The import goes through the engine's own loader.
JSValue js_module(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  if (argc < 1) return JS_UNDEFINED;
  Text name(c, argv[0]);
  if (!name.p || std::strpbrk(name.p, "'\\\n")) return JS_ThrowTypeError(c, "module: not a module name");
  const std::string src = "import * as m from '" + std::string(name.p) + "'; globalThis.__zincWebModule = m;";
  JSValue p = JS_Eval(c, src.data(), src.size(), "zinc:webenv/import", JS_EVAL_TYPE_MODULE);
  if (JS_IsException(p)) return p;
  if (JS_PromiseState(c, p) == JS_PROMISE_REJECTED) { JSValue err = JS_PromiseResult(c, p); JS_PromiseMarkAsHandled(c, p); JS_FreeValue(c, p); return JS_Throw(c, err); }
  JS_FreeValue(c, p);
  JSValue g = JS_GetGlobalObject(c), m = JS_GetPropertyStr(c, g, "__zincWebModule");
  JSAtom key = JS_NewAtom(c, "__zincWebModule");
  JS_DeleteProperty(c, g, key, 0);
  JS_FreeAtom(c, key);
  JS_FreeValue(c, g);
  if (JS_IsUndefined(m)) return JS_ThrowInternalError(c, "module %s did not run to its end", name.p);
  return m;
}

}  // namespace

bool webEnv(JSContext* ctx, const std::string& stdRoot, const std::string& entry) {
  namespace fs = std::filesystem;
  // the page's directory, what relative URLs resolve against: the project's (where zinc.json is, as index.html would be), else the entry's
  const std::string projectFile = zn::frontend::findProjectFile(entry);
  std::string mode;
  if (const char* v = std::getenv("ZINC_WEB"); v && *v) mode = v;   // ZINC_WEB=0 turns a project's "web" off, ZINC_WEB=trace names the window members a library misses
  else if (std::string text; !projectFile.empty() && readText(projectFile, text)) {
    zn::frontend::Project project;
    std::string err;
    if (zn::frontend::parseProject(text, project, err) && project.web) mode = "1";
  }
  if (mode.empty() || mode == "0") return true;
  const std::string path = stdRoot + "/webenv.js";
  std::string js;
  if (!readText(path, js)) { std::fprintf(stderr, "zinc: the web environment is missing (%s)\n", path.c_str()); return false; }
  const std::string base = fs::path(projectFile.empty() ? entry : projectFile).parent_path().string();
  JSValue g = JS_GetGlobalObject(ctx), n = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, n, "structuredClone", JS_NewCFunction(ctx, js_structuredClone, "structuredClone", 1));
  JS_SetPropertyStr(ctx, n, "read", JS_NewCFunction(ctx, js_read, "read", 1));
  JS_SetPropertyStr(ctx, n, "httpFetch", JS_NewCFunction(ctx, js_httpFetch, "httpFetch", 4));
  JS_SetPropertyStr(ctx, n, "httpError", JS_NewCFunction(ctx, js_httpError, "httpError", 0));
  JS_SetPropertyStr(ctx, n, "httpPoll", JS_NewCFunction(ctx, js_httpPoll, "httpPoll", 1));
  JS_SetPropertyStr(ctx, n, "httpTake", JS_NewCFunction(ctx, js_httpTake, "httpTake", 1));
  JS_SetPropertyStr(ctx, n, "module", JS_NewCFunction(ctx, js_module, "module", 1));
  JS_SetPropertyStr(ctx, n, "decode", JS_NewCFunction(ctx, js_decode, "decode", 3));
  JS_SetPropertyStr(ctx, n, "run", JS_NewCFunction(ctx, js_run, "run", 2));
  JS_SetPropertyStr(ctx, n, "base", JS_NewStringLen(ctx, base.data(), base.size()));
  JS_SetPropertyStr(ctx, n, "trace", JS_NewBool(ctx, mode == "trace"));
  JS_SetPropertyStr(ctx, g, "__zincWeb", n);   // the environment takes it and removes it
  JS_FreeValue(ctx, g);
  JSValue r = JS_Eval(ctx, js.data(), js.size(), "zinc:webenv", JS_EVAL_TYPE_GLOBAL);
  if (JS_IsException(r)) {
    JSValue ex = JS_GetException(ctx), st = JS_GetPropertyStr(ctx, ex, "stack");
    const char* s = JS_ToCString(ctx, ex);
    const char* stack = JS_IsUndefined(st) ? nullptr : JS_ToCString(ctx, st);
    std::fprintf(stderr, "zinc: the web environment failed: %s\n%s", s ? s : "exception", stack ? stack : "");
    if (stack) JS_FreeCString(ctx, stack);
    if (s) JS_FreeCString(ctx, s);
    JS_FreeValue(ctx, st); JS_FreeValue(ctx, ex);
    return false;
  }
  JS_FreeValue(ctx, r);
  return true;
}

}  // namespace zn::qjs

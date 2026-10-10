// The web environment of the QuickJS engine (ZN-568): the window, document, events, frame callbacks, storage and network a JavaScript library written
// for a browser expects around WebGL. The environment is JavaScript (lib/std/webenv.js, read only when a program asks: ZINC_WEB=1, or "web" in its
// zinc.json); this file starts it and gives it what JavaScript cannot do alone, over host rows that exist. A program that does not ask pays nothing.
#include "qjs/qjs.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>

extern "C" {
#include "../../third_party/quickjs-ng/quickjs.h"
}

#include "frontend/project.h"

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

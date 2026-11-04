// zinc:webview on a Linux desktop: WebKitGTK views as X child windows of the app's window, whichever host opened it (SDL, display-gl). Each
// view is a GTK window at the node's whole box, reparented into a plain X window that takes the clip inside the app's: the X server cuts it.
// WebKitGTK is loaded at run time (4.1, else 4.0): the program builds and starts without it, and it needs no headers in the cross sysroots.
// GTK's main loop is pumped from a zrt::Poller; its callbacks only queue events for the program. On Wayland everything goes through XWayland:
// no protocol puts another program's surface inside a window. Without X (KMS) there is no web view: create() returns -1.
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <fcntl.h>
#include <unistd.h>
#include <string>
#include <vector>
#include <algorithm>
#include "hal.h"
#include "zrt_assets_dir.h"
#include "zinc_native_webview.h"
#include "../src/bridge.h"

#ifndef ZP_WEBVIEW_INSPECTABLE
#define ZP_WEBVIEW_INSPECTABLE 0
#endif

struct ZincAsset { const char* name; const unsigned char* data; uint32_t size; };
extern const ZincAsset zinc_assets[] __attribute__((weak)) = {{nullptr, nullptr, 0}};
extern const uint32_t zinc_asset_count __attribute__((weak)) = 0;

// Everything comes from the library's dependency tree (GTK, GDK, GLib, JavaScriptCore, X11).
#define SYMBOLS(X) \
  X(int, gtk_init_check, (int*, char***)) X(void*, gtk_window_new, (int)) X(void, gtk_window_set_decorated, (void*, int)) \
  X(void, gtk_window_resize, (void*, int, int)) \
  X(void, gtk_container_add, (void*, void*)) \
  X(void, gtk_widget_realize, (void*)) X(void, gtk_widget_show_all, (void*)) X(void, gtk_widget_hide, (void*)) X(void, gtk_widget_destroy, (void*)) \
  X(void, gtk_widget_grab_focus, (void*)) X(int, gtk_widget_get_scale_factor, (void*)) X(void*, gtk_widget_get_window, (void*)) \
  X(unsigned long, gdk_x11_window_get_xid, (void*)) X(void*, gdk_x11_get_default_xdisplay, ()) \
  X(int, g_main_context_iteration, (void*, int)) X(unsigned long, g_signal_connect_data, (void*, const char*, void*, void*, void*, int)) \
  X(void, g_object_unref, (void*)) X(void, g_free, (void*)) X(void*, g_memory_input_stream_new_from_data, (const void*, long, void (*)(void*))) \
  X(char*, g_uri_unescape_string, (const char*, const char*)) \
  X(void*, webkit_user_content_manager_new, ()) X(void*, webkit_user_script_new, (const char*, int, int, const char* const*, const char* const*)) \
  X(void, webkit_user_script_unref, (void*)) X(void, webkit_user_content_manager_add_script, (void*, void*)) \
  X(int, webkit_user_content_manager_register_script_message_handler, (void*, const char*)) \
  X(void*, webkit_web_view_new_with_user_content_manager, (void*)) X(void, webkit_web_view_load_uri, (void*, const char*)) \
  X(void, webkit_web_view_load_html, (void*, const char*, const char*)) X(const char*, webkit_web_view_get_uri, (void*)) \
  X(void, webkit_web_view_run_javascript, (void*, const char*, void*, void*, void*)) X(void, webkit_web_view_set_zoom_level, (void*, double)) \
  X(void*, webkit_web_view_get_settings, (void*)) X(void, webkit_settings_set_enable_developer_extras, (void*, int)) \
  X(void*, webkit_web_context_get_default, ()) X(void, webkit_web_context_register_uri_scheme, (void*, const char*, void (*)(void*, void*), void*, void*)) \
  X(void*, webkit_web_context_get_security_manager, (void*)) X(void, webkit_security_manager_register_uri_scheme_as_secure, (void*, const char*)) \
  X(void, webkit_security_manager_register_uri_scheme_as_cors_enabled, (void*, const char*)) \
  X(const char*, webkit_uri_scheme_request_get_path, (void*)) X(void*, webkit_uri_scheme_response_new, (void*, long)) \
  X(void, webkit_uri_scheme_response_set_status, (void*, unsigned, const char*)) X(void, webkit_uri_scheme_response_set_content_type, (void*, const char*)) \
  X(void, webkit_uri_scheme_request_finish_with_response, (void*, void*)) X(void*, webkit_javascript_result_get_js_value, (void*)) \
  X(void*, jsc_value_object_get_property, (void*, const char*)) X(char*, jsc_value_to_string, (void*)) X(int, jsc_value_to_int32, (void*)) \
  X(unsigned long, XCreateSimpleWindow, (void*, unsigned long, int, int, unsigned, unsigned, unsigned, unsigned long, unsigned long)) \
  X(int, XMapWindow, (void*, unsigned long)) X(int, XUnmapWindow, (void*, unsigned long)) X(int, XDestroyWindow, (void*, unsigned long)) X(int, XMoveResizeWindow, (void*, unsigned long, int, int, unsigned, unsigned)) \
  X(int, XReparentWindow, (void*, unsigned long, unsigned long, int, int)) X(int, XMoveWindow, (void*, unsigned long, int, int)) \
  X(int, XGetGeometry, (void*, unsigned long, unsigned long*, int*, int*, unsigned*, unsigned*, unsigned*, unsigned*)) \
  X(int, XQueryPointer, (void*, unsigned long, unsigned long*, unsigned long*, int*, int*, int*, int*, unsigned*)) \
  X(int, XSetInputFocus, (void*, unsigned long, int, unsigned long)) X(int, XSync, (void*, int)) X(int, XFlush, (void*))
#define X(ret, name, args) static ret(*name) args;
SYMBOLS(X)
#undef X

// An app that may show web views needs its own window on X too, before SDL or GDK choose (a constructor runs before the host opens anything).
static int xwayland = [] {
  if (getenv("WAYLAND_DISPLAY") && getenv("DISPLAY")) { setenv("SDL_VIDEODRIVER", "x11", 0); setenv("GDK_BACKEND", "x11", 0); }
  return 0;
}();

static std::string secret;   // the injected bridge alone knows it: it reaches the top frame only, so an iframe cannot call the app
static std::string bridge;
static void* xd;

static bool load() {
  static int state = 0;   // 1 ready, -1 failed
  if (state) return state > 0;
  state = -1;
  if (!getenv("DISPLAY")) { fprintf(stderr, "zinc:webview: a web view needs an X11 or XWayland desktop: there is none here\n"); return false; }
  void* h = dlopen("libwebkit2gtk-4.1.so.0", RTLD_NOW | RTLD_GLOBAL);
  if (!h) h = dlopen("libwebkit2gtk-4.0.so.37", RTLD_NOW | RTLD_GLOBAL);
  if (!h) { fprintf(stderr, "zinc:webview: WebKitGTK is not installed: libwebkit2gtk-4.1-0 (Debian, Ubuntu), webkit2gtk4.1 (Fedora), webkit2gtk-4.1 (Arch)\n"); return false; }
  bool ok = true;
#define X(ret, name, args) if (!(name = (ret(*) args)dlsym(h, #name))) { fprintf(stderr, "zinc:webview: this WebKitGTK has no %s (too old)\n", #name); ok = false; }
  SYMBOLS(X)
#undef X
  if (!ok || !gtk_init_check(nullptr, nullptr)) { if (ok) fprintf(stderr, "zinc:webview: GTK cannot open the display\n"); return false; }
  xd = gdk_x11_get_default_xdisplay();
  unsigned char raw[16] = {};
  if (const int fd = open("/dev/urandom", O_RDONLY); fd >= 0) { if (read(fd, raw, sizeof raw) != sizeof raw) fprintf(stderr, "zinc:webview: no random key\n"); close(fd); }
  char hex[33];
  for (int i = 0; i < 16; i++) snprintf(hex + i * 2, 3, "%02x", raw[i]);
  secret = hex;
  bridge = ZINC_WEBVIEW_BRIDGE("((r) => ({ postMessage(m) { m.k = '@KEY@'; r.postMessage(m); } }))(window.webkit.messageHandlers.zinc)");
  bridge.replace(bridge.find("@KEY@"), 5, secret);
  state = 1;
  return true;
}

struct Event { int v, kind, id; std::string a, b; };
static std::vector<Event> queue;
static const int MAXV = 16;
struct View { void* win, *wv; unsigned long clip, xid; long port; double x, y, w, h, cx, cy, cw, ch; int fx, fy, fw, fh, bx, by, bw, bh; };
static View views[MAXV];
static View* at(int32_t v) { return v >= 0 && v < MAXV && views[v].wv ? &views[v] : nullptr; }
static int focused = -1;   // the view that has the X focus: a click elsewhere in the app takes it back

// ---------------------------------------------------------------- zinc:// assets
static bool readFile(const std::string& path, std::string& out) {
  FILE* f = fopen(path.c_str(), "rb");
  if (!f) return false;
  char buf[65536];
  size_t n;
  while ((n = fread(buf, 1, sizeof buf, f)) > 0) out.append(buf, n);
  fclose(f);
  return true;
}
static bool asset(const std::string& name, std::string& out) {
  if (name.empty() || name[0] == '/' || ("/" + name + "/").find("/../") != std::string::npos) return false;
  static const std::string built = zrt_program_assets_dir(false);
  const char* dir = getenv("ZINC_ASSETS");
  if (!dir && !built.empty()) dir = built.c_str();
  if (dir && readFile(std::string(dir) + "/" + name, out)) return true;
  for (uint32_t i = 0; i < zinc_asset_count; i++)
    if (name == zinc_assets[i].name) { out.assign((const char*)zinc_assets[i].data, zinc_assets[i].size); return true; }
  return false;
}
static const char* mime(const std::string& name) {
  static const struct { const char* ext, *type; } m[] = {{"html", "text/html"}, {"htm", "text/html"}, {"css", "text/css"}, {"js", "text/javascript"},
    {"mjs", "text/javascript"}, {"json", "application/json"}, {"svg", "image/svg+xml"}, {"png", "image/png"}, {"jpg", "image/jpeg"}, {"jpeg", "image/jpeg"},
    {"gif", "image/gif"}, {"webp", "image/webp"}, {"wasm", "application/wasm"}, {"txt", "text/plain"}, {"woff2", "font/woff2"}, {"ttf", "font/ttf"}};
  std::string e = name.substr(name.rfind('.') + 1);
  std::transform(e.begin(), e.end(), e.begin(), [](unsigned char c) { return (char)tolower(c); });
  for (const auto& t : m) if (e == t.ext) return t.type;
  return "application/octet-stream";
}
static void onAsset(void* req, void*) {
  char* path = g_uri_unescape_string(webkit_uri_scheme_request_get_path(req), nullptr);
  std::string name = path ? path : "";
  g_free(path);
  if (!name.empty() && name[0] == '/') name.erase(0, 1);
  if (name.empty()) name = "index.html";
  std::string body;
  const bool found = asset(name, body);
  if (!found) body = "not found";
  void* copy = malloc(body.size() + 1);
  memcpy(copy, body.data(), body.size());
  void* stream = g_memory_input_stream_new_from_data(copy, (long)body.size(), free);
  void* r = webkit_uri_scheme_response_new(stream, (long)body.size());
  webkit_uri_scheme_response_set_status(r, found ? 200 : 404, nullptr);
  webkit_uri_scheme_response_set_content_type(r, found ? mime(name) : "text/plain");
  webkit_uri_scheme_request_finish_with_response(req, r);
  g_object_unref(r);
  g_object_unref(stream);
}

// ---------------------------------------------------------------- the page's messages
/** The app's own pages (zinc://, file://) and the local dev server it opened itself: same port only. */
static bool trusted(const char* uri, long port) {
  if (!uri) return false;
  if (!strncmp(uri, "zinc:", 5) || !strncmp(uri, "file:", 5)) return true;
  const char* h = !strncmp(uri, "http://", 7) ? uri + 7 : !strncmp(uri, "https://", 8) ? uri + 8 : nullptr;
  if (!h) return false;
  const size_t n = strcspn(h, ":/?#");
  if (!((n == 9 && !strncmp(h, "localhost", 9)) || (n == 9 && !strncmp(h, "127.0.0.1", 9)))) return false;
  return (h[n] == ':' ? atol(h + n + 1) : 0) == port;
}
static std::string prop(void* obj, const char* key) {
  void* p = jsc_value_object_get_property(obj, key);
  char* s = jsc_value_to_string(p);
  std::string out = s ? s : "";
  g_free(s);
  g_object_unref(p);
  return out;
}
static void onMessage(void*, void* result, void* data) {
  const int v = (int)(intptr_t)data;
  View* p = at(v);
  if (!p) return;
  void* m = webkit_javascript_result_get_js_value(result);
  const char* uri = webkit_web_view_get_uri(p->wv);
  if (prop(m, "k") != secret || !trusted(uri, p->port)) { fprintf(stderr, "zinc:webview: IPC from %s ignored (untrusted origin)\n", uri ? uri : "?"); return; }
  if (prop(m, "t") == "i") {
    void* id = jsc_value_object_get_property(m, "id");
    queue.push_back({v, 1, jsc_value_to_int32(id), prop(m, "cmd"), prop(m, "d")});
    g_object_unref(id);
  } else queue.push_back({v, 0, 0, prop(m, "d"), ""});
}
static void onLoad(void* wv, int event, void* data) {
  if (event != 3) return;   // WEBKIT_LOAD_FINISHED
  const char* uri = webkit_web_view_get_uri(wv);
  queue.push_back({(int)(intptr_t)data, 2, 0, uri ? uri : "", ""});
}
/** A click in a view gives it the keyboard: the window manager knows nothing of a child window. */
static int onPress(void* wv, void*, void* data) {
  const int v = (int)(intptr_t)data;
  if (View* p = at(v)) { XSetInputFocus(xd, p->xid, 2 /* RevertToParent */, 0); gtk_widget_grab_focus(wv); XFlush(xd); focused = v; }
  return 0;
}
static std::string quoted(const zrt::String& s) {
  std::string o = "\"";
  for (uint32_t i = 0; i < s.bytes(); i++) {
    const unsigned char c = (unsigned char)s.ptr()[i];
    char u[8];
    if (c == '"' || c == '\\') { o += '\\'; o += (char)c; }
    else if (c < 0x20) { snprintf(u, sizeof u, "\\u%04x", c); o += u; }
    else if (c == 0xE2 && i + 2 < s.bytes() && (unsigned char)s.ptr()[i + 1] == 0x80 && ((unsigned char)s.ptr()[i + 2] | 1) == 0xA9) {   // U+2028, U+2029
      o += (unsigned char)s.ptr()[i + 2] == 0xA8 ? "\\u2028" : "\\u2029"; i += 2;
    } else o += (char)c;
  }
  return o + "\"";
}
static std::string str(const zrt::String& s) { return std::string((const char*)s.ptr(), s.bytes()); }
static long portOf(const std::string& url, long old) {
  const size_t e = url.find("://");
  if (e == std::string::npos || url.compare(0, 4, "http")) return old;
  const size_t n = url.find_first_of(":/?#", e + 3);
  return n != std::string::npos && url[n] == ':' ? atol(url.c_str() + n + 1) : 0;
}

// ---------------------------------------------------------------- views
namespace zrt { extern int32_t surf_w, surf_h; }   // the logical surface, whichever host shows it
/** Logical surface rectangles -> the clip's frame in the app's window and the view's inside it (X pixels, letterboxed as the host draws); GTK takes its size in its own units. */
static void frameOf(int i, unsigned pw, unsigned ph) {
  View& v = views[i];
  const int W = std::max(1, zrt::surf_w), H = std::max(1, zrt::surf_h);
  const double k = fmin((double)pw / W, (double)ph / H), ox = (pw - W * k) / 2, oy = (ph - H * k) / 2;
  const int s = std::max(1, gtk_widget_get_scale_factor(v.win));
  const int fx = (int)lround(ox + v.cx * k), fy = (int)lround(oy + v.cy * k);
  const int fw = std::max(1, (int)lround(v.cw * k)), fh = std::max(1, (int)lround(v.ch * k));
  const int bx = (int)lround((v.x - v.cx) * k), by = (int)lround((v.y - v.cy) * k);
  const int bw = std::max(1, (int)lround(v.w * k / s)), bh = std::max(1, (int)lround(v.h * k / s));
  if (fx != v.fx || fy != v.fy || fw != v.fw || fh != v.fh) XMoveResizeWindow(xd, v.clip, fx, fy, (unsigned)fw, (unsigned)fh);
  if (bx != v.bx || by != v.by) XMoveWindow(xd, v.xid, bx, by);
  if (bw != v.bw || bh != v.bh) gtk_window_resize(v.win, bw, bh);
  if (fx == v.fx && fy == v.fy && fw == v.fw && fh == v.fh && bx == v.bx && by == v.by && bw == v.bw && bh == v.bh) return;
  v.fx = fx; v.fy = fy; v.fw = fw; v.fh = fh; v.bx = bx; v.by = by; v.bw = bw; v.bh = bh;
  static const bool trace = getenv("ZINC_WEBVIEW_TRACE") != nullptr;
  if (trace) fprintf(stderr, "webview %d: clip %d,%d %dx%d view %d,%d %dx%d\n", i, fx, fy, fw, fh, bx, by, bw, bh);
}
static bool parentSize(unsigned* w, unsigned* h) {
  unsigned long root; int x, y; unsigned b, d;
  return hal_x11_window && XGetGeometry(xd, hal_x11_window, &root, &x, &y, w, h, &b, &d);
}

struct LinuxWebview : NativeWebview, zrt::Poller {
  zrt::Fn<void(int32_t, int32_t, int32_t, zrt::String, zrt::String)> cb;

  int32_t create(double x, double y, double w, double h) override {
    int slot = 0;
    while (slot < MAXV && views[slot].wv) slot++;
    if (slot == MAXV || !load()) return -1;
    if (!hal_x11_window) { fprintf(stderr, "zinc:webview: the app has no X11 window to hold a web view (a KMS screen has none)\n"); return -1; }
    static const bool scheme = [] {
      void* ctx = webkit_web_context_get_default();
      webkit_web_context_register_uri_scheme(ctx, "zinc", onAsset, nullptr, nullptr);
      void* sec = webkit_web_context_get_security_manager(ctx);
      webkit_security_manager_register_uri_scheme_as_secure(sec, "zinc");
      webkit_security_manager_register_uri_scheme_as_cors_enabled(sec, "zinc");
      return true;
    }();
    (void)scheme;
    void* data = (void*)(intptr_t)slot;
    void* ucm = webkit_user_content_manager_new();
    void* script = webkit_user_script_new(bridge.c_str(), 1 /* top frame */, 0 /* document start */, nullptr, nullptr);
    webkit_user_content_manager_add_script(ucm, script);
    webkit_user_script_unref(script);
    g_signal_connect_data(ucm, "script-message-received::zinc", (void*)onMessage, data, nullptr, 0);
    webkit_user_content_manager_register_script_message_handler(ucm, "zinc");
    void* wv = webkit_web_view_new_with_user_content_manager(ucm);
    g_object_unref(ucm);
    webkit_settings_set_enable_developer_extras(webkit_web_view_get_settings(wv), ZP_WEBVIEW_INSPECTABLE);
    g_signal_connect_data(wv, "load-changed", (void*)onLoad, data, nullptr, 0);
    g_signal_connect_data(wv, "button-press-event", (void*)onPress, data, nullptr, 0);
    void* win = gtk_window_new(0);
    gtk_window_set_decorated(win, 0);
    gtk_container_add(win, wv);
    gtk_widget_realize(win);
    const unsigned long xid = gdk_x11_window_get_xid(gtk_widget_get_window(win));
    const unsigned long clip = XCreateSimpleWindow(xd, hal_x11_window, 0, 0, 1, 1, 0, 0, 0);
    XReparentWindow(xd, xid, clip, 0, 0);
    XMapWindow(xd, clip);
    XSync(xd, 0);
    views[slot] = View{win, wv, clip, xid, -1, x, y, w, h, x, y, w, h, -1, -1, -1, -1, -1, -1, -1, -1};
    unsigned pw, ph;
    if (parentSize(&pw, &ph)) frameOf(slot, pw, ph);
    gtk_widget_show_all(win);
    return slot;
  }
  void setBounds(int32_t v, double x, double y, double w, double h) override { place(v, x, y, w, h, x, y, w, h); }
  void place(int32_t v, double x, double y, double w, double h, double cx, double cy, double cw, double ch) override {
    View* p = at(v);
    if (!p) return;
    p->x = x; p->y = y; p->w = w; p->h = h; p->cx = cx; p->cy = cy; p->cw = cw; p->ch = ch;
    unsigned pw, ph;
    if (parentSize(&pw, &ph)) frameOf(v, pw, ph);
  }
  void setVisible(int32_t v, bool on) override {
    View* p = at(v);
    if (!p) return;
    if (on) { gtk_widget_show_all(p->win); XMoveWindow(xd, p->xid, p->bx, p->by); XMapWindow(xd, p->clip); }
    else { gtk_widget_hide(p->win); XUnmapWindow(xd, p->clip); }
    if (getenv("ZINC_WEBVIEW_TRACE")) fprintf(stderr, "webview %d: %s\n", v, on ? "shown" : "hidden");
  }
  void navigate(int32_t v, zrt::String url) override {
    View* p = at(v);
    if (!p) return;
    const std::string u = str(url);
    p->port = portOf(u, p->port);
    webkit_web_view_load_uri(p->wv, u.c_str());
  }
  void loadHtml(int32_t v, zrt::String html, zrt::String base) override {
    View* p = at(v);
    if (!p) return;
    const std::string h = str(html), b = str(base);
    p->port = portOf(b, p->port);
    webkit_web_view_load_html(p->wv, h.c_str(), b.c_str());
  }
  void run(int32_t v, const std::string& js) { if (View* p = at(v)) webkit_web_view_run_javascript(p->wv, js.c_str(), nullptr, nullptr, nullptr); }
  void eval(int32_t v, zrt::String js) override { run(v, str(js)); }
  void setZoom(int32_t v, double factor) override { if (View* p = at(v)) webkit_web_view_set_zoom_level(p->wv, factor > 0.25 ? factor : 0.25); }
  void key(int32_t, bool, zrt::String, zrt::String, int32_t) override {}   // ponytail: a remote keyboard is macOS only (sidecar); a real keyboard reaches the page by itself
  void post(int32_t v, zrt::String data) override { run(v, "window.zinc.__dispatch(" + quoted(data) + ")"); }
  void reply(int32_t v, int32_t id, bool ok, zrt::String result) override {
    run(v, "window.zinc.__settle(" + std::to_string(id) + "," + (ok ? "true," : "false,") + quoted(result) + ")");
  }
  void close(int32_t v) override {
    View* p = at(v);
    if (!p) return;
    if (focused == v) focused = -1;
    gtk_widget_destroy(p->win);
    XDestroyWindow(xd, p->clip);
    *p = View{};
  }
  void onEvent(zrt::Fn<void(int32_t, int32_t, int32_t, zrt::String, zrt::String)> f) override { cb = f; }

  /** A press in the app outside the web views gives the keyboard back to the app's window. */
  void checkFocus(unsigned pw, unsigned ph) {
    if (focused < 0) return;
    unsigned long root, child; int rx, ry, wx, wy; unsigned mask;
    if (!XQueryPointer(xd, hal_x11_window, &root, &child, &rx, &ry, &wx, &wy, &mask) || !(mask & (1u << 8)) || wx < 0 || wy < 0 || wx >= (int)pw || wy >= (int)ph) return;
    for (const View& v : views) if (v.wv && v.clip == child) return;
    XSetInputFocus(xd, hal_x11_window, 2, 0);
    focused = -1;
  }
  bool poll() override {
    bool any = false;
    for (const View& v : views) any = any || v.wv;
    if (!any) return false;
    unsigned pw, ph;
    if (parentSize(&pw, &ph)) {
      for (int i = 0; i < MAXV; i++) if (views[i].wv) frameOf(i, pw, ph);  // follows window resizes
      checkFocus(pw, ph);
    }
    for (int i = 0; i < 256 && g_main_context_iteration(nullptr, 0); i++) {}
    XFlush(xd);
    if (queue.empty()) return true;
    std::vector<Event> evs;
    evs.swap(queue);
    for (const Event& e : evs) {
      if (!cb) break;
      zrt::Fn<void(int32_t, int32_t, int32_t, zrt::String, zrt::String)> f = cb;
      f(e.v, e.kind, e.id, zrt::String::from(e.a.data(), (uint32_t)e.a.size()), zrt::String::from(e.b.data(), (uint32_t)e.b.size()));
      zrt::check_uncaught();
    }
    return true;
  }
  void shutdown() override {
    cb = nullptr;
    for (int i = 0; i < MAXV; i++) close(i);
    queue.clear();
  }
};

NativeWebview* zinc_create_Webview() {
  static LinuxWebview m;
  m.rc = zrt::IMMORTAL;
  zrt::add_poller(&m);
  return &m;
}

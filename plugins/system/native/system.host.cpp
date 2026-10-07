// zinc:system backend of the desktop targets (ZN-232): the permission gate and the recording simulator. The simulator is what runs in deterministic and headless runs: it answers
// every op from the table (ops.gen.h) and writes one line per call, `[system] <op> <json>` (stdout with ZINC_SYSTEM_LOG=- or in a deterministic run, a file with ZINC_SYSTEM_LOG=path);
// ZINC_SYSTEM_SCRIPT=file delivers events at the stated tick, one line `<tick> <event> args...` (a tick is one pass of the event loop: one frame in a UI app).
// C-style on purpose: the runtime header (zrt.h) defines placement new, which the standard containers redefine.
#include "zinc_native_system.h"
#include "ops.gen.h"
#include "hal.h"
#include "hal_window.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

extern "C" void hal_set_close_handler(int (*)(void)) __attribute__((weak));   // the desktop HAL has them (runtime/include/hal_window.h); headless HALs do not
extern "C" void hal_set_drop_handler(void (*)(const char*, int)) __attribute__((weak));

#ifdef __APPLE__
extern "C" int zn_sys_macos_call(const char* op, const char* args, char* out, int cap);   // native/system.macos.mm
extern "C" int zn_sys_macos_poll(char* out, int cap);
#endif
namespace zrt { extern bool quit_requested; }   // the runtime's request to end the program (runtime/zrt.cpp)

namespace {
const int MAXEV = 256, EVLEN = 480, MAXGRANT = 64;

struct ScriptEvent { long tick; char json[EVLEN]; };

/** Appends `v` as a JSON string to `dst` (capacity `cap`). */
void appendJson(char* dst, size_t cap, const char* v) {
  size_t n = strlen(dst);
  if (n + 3 >= cap) return;
  dst[n++] = '"';
  for (const char* p = v; *p && n + 8 < cap; p++) {
    if (*p == '"' || *p == '\\') { dst[n++] = '\\'; dst[n++] = *p; }
    else if (*p == '\n') { dst[n++] = '\\'; dst[n++] = 'n'; }
    else if ((unsigned char)*p < 0x20) n += (size_t)snprintf(dst + n, cap - n, "\\u%04x", *p);
    else dst[n++] = *p;
  }
  dst[n++] = '"';
  dst[n] = 0;
}

/** The string value of the top-level key `key` in a flat JSON object written by index.ts (escapes \\ \" \n handled); false when absent. */
bool jsonString(const char* json, const char* key, char* out, size_t cap) {
  char pat[64];
  snprintf(pat, sizeof pat, "\"%s\":\"", key);
  const char* p = strstr(json, pat);
  if (!p) return false;
  p += strlen(pat);
  size_t n = 0;
  for (; *p && *p != '"' && n + 1 < cap; p++) {
    if (*p == '\\' && p[1]) { p++; out[n++] = *p == 'n' ? '\n' : *p; }
    else out[n++] = *p;
  }
  out[n] = 0;
  return true;
}

struct SimNote { char id[64], title[128], body[256]; };

struct Sim : NativeSystem, zrt::Poller {
  SimNote notes[32];
  int nnotes = 0;
  int nextNote = 1;
  char granted[MAXGRANT][48];
  int ngranted = 0;
  zrt::Fn<void(zrt::String)> cb;
  ScriptEvent script[MAXEV];
  int nscript = 0, next = 0;
  long ticks = 0;
  bool toStdout = false, scriptRead = false, live = false;   // live: the real system answers (a desktop session, not a deterministic or headless run)
  FILE* logFile = nullptr;

  Sim() {
    const char* l = getenv("ZINC_SYSTEM_LOG");
    const char* det = getenv("ZINC_DETERMINISTIC");
    if (l && !strcmp(l, "-")) toStdout = true;
    else if (l && *l) logFile = fopen(l, "w");
    else if (det && *det && *det != '0') toStdout = true;
    const char* head = getenv("ZINC_HEADLESS");
    const char* force = getenv("ZINC_SYSTEM");
    live = !(det && *det && *det != '0') && !(head && *head && *head != '0') && !(force && !strcmp(force, "sim"));
    zrt::add_poller(this);
    if (hal_set_close_handler) hal_set_close_handler(&Sim::onClose);
    if (hal_set_drop_handler) hal_set_drop_handler(&Sim::onDrop);
  }
  static Sim*& self() { static Sim* s = nullptr; return s; }
  static int onClose();
  static void onDrop(const char* path, int isText);
  void deliver(const char* json) {
    log("[system] event ", json);
    zrt::Fn<void(zrt::String)> f = cb;
    if (f) f(zrt::String::from(json, (uint32_t)strlen(json)));
  }
  void setApp(zrt::String json) override {
    const char* p = json.ptr();
    uint32_t n = json.bytes();
    const char* key = "\"window\":";
    for (uint32_t i = 0; i + 9 < n; i++) {
      if (memcmp(p + i, key, 9)) continue;
      uint32_t j = i + 9, depth = 0, k = j;
      for (; k < n; k++) { if (p[k] == '{') depth++; else if (p[k] == '}' && --depth == 0) { k++; break; } }
      char buf[1024];
      snprintf(buf, sizeof buf, "%.*s", (int)(k - j), p + j);
      log("[system] window.create ", buf);   // what the HAL is asked to create the window with
      return;
    }
  }
  void log(const char* a, const char* b = "", const char* c = "", const char* d = "") {
    char line[2600];
    int n = snprintf(line, sizeof line, "%s%s%s%s\n", a, b, c, d);
    if (n > (int)sizeof line - 1) n = (int)sizeof line - 1;
    if (toStdout) hal_log(line, (size_t)n);   // the runtime's own stdout, so the lines interleave with console.log in call order
    else if (logFile) { fwrite(line, 1, (size_t)n, logFile); fflush(logFile); }
  }
  bool allowed(const char* perm) const {   // `window:state` is covered by `window:state` and by `window`; `tray` by `tray`
    size_t feat = strcspn(perm, ":");
    for (int i = 0; i < ngranted; i++) if (!strcmp(granted[i], perm) || (strlen(granted[i]) == feat && !strncmp(granted[i], perm, feat))) return true;
    return false;
  }

  void setPermissions(zrt::String csv) override {
    ngranted = 0;
    const char* p = csv.ptr();
    uint32_t n = csv.bytes(), from = 0;
    for (uint32_t i = 0; i <= n; i++) {
      if (i < n && p[i] != ',') continue;
      uint32_t len = i - from;
      if (len > 0 && len < sizeof granted[0] && ngranted < MAXGRANT) { memcpy(granted[ngranted], p + from, len); granted[ngranted][len] = 0; ngranted++; }
      from = i + 1;
    }
  }
  bool supports(zrt::String feature) override { return feature.bytes() > 0; }   // the simulator does every feature
#ifdef __APPLE__
  zrt::String backend() override { return live ? zrt::String::from("macos", 5) : zrt::String::from("sim", 3); }
#else
  zrt::String backend() override { return zrt::String::from("sim", 3); }
#endif
  zrt::String call(zrt::String op, zrt::String json) override {
    char name[96], args[2048];
    self() = this;
    snprintf(name, sizeof name, "%.*s", (int)op.bytes(), op.ptr());
    snprintf(args, sizeof args, "%.*s", (int)json.bytes(), json.ptr());
    char buf[512];
    for (const ZnSystemOp& o : kSystemOps) {
      if (strcmp(name, o.op)) continue;
      if (!allowed(o.permission)) {
        log("[system] denied ", name);
        int n = snprintf(buf, sizeof buf, "{\"error\":{\"code\":\"denied\",\"message\":\"%s needs the permission %s (zinc.json \\\"permissions\\\")\"}}", name, o.permission);
        return zrt::String::from(buf, (uint32_t)n);
      }
      log("[system] ", name, " ", args);
#ifdef __APPLE__
      if (live) { char big[3000]; if (zn_sys_macos_call(name, args, big, sizeof big)) return reply(big); }
#endif
      if (!strncmp(name, "notification.", 13)) return notification(name, args);
      if (!strcmp(name, "window.confirmClose") && hal_set_close_handler) zrt::quit_requested = true;   // a real window: the veto of the close button ends here
      return zrt::String::from(o.sim, (uint32_t)strlen(o.sim));
    }
    log("[system] error unknown op ", name);
    int n = snprintf(buf, sizeof buf, "{\"error\":{\"code\":\"unsupported\",\"message\":\"unknown op %s\"}}", name);
    return zrt::String::from(buf, (uint32_t)n);
  }
  zrt::String reply(const char* json) { return zrt::String::from(json, (uint32_t)strlen(json)); }
  /** The simulator's notification centre: ZINC_SYSTEM_NOTIFICATION_PERMISSION=granted (default) | denied | default decides what show() may do; the same id replaces. */
  zrt::String notification(const char* name, const char* args) {
    const char* perm = getenv("ZINC_SYSTEM_NOTIFICATION_PERMISSION");
    if (!perm || !*perm) perm = "granted";
    char buf[3000], id[64] = "", title[128] = "", body[256] = "";
    if (!strcmp(name, "notification.requestPermission")) { snprintf(buf, sizeof buf, "{\"state\":\"%s\"}", perm); return reply(buf); }
    if (!strcmp(name, "notification.backend")) return reply("{\"backend\":\"sim\"}");
    jsonString(args, "id", id, sizeof id);
    if (!strcmp(name, "notification.notify")) {
      jsonString(args, "title", title, sizeof title);
      jsonString(args, "body", body, sizeof body);
      if (!id[0]) snprintf(id, sizeof id, "n%d", nextNote++);
      if (strcmp(perm, "granted")) {   // a denied or undecided permission never throws: delivered false and why
        snprintf(buf, sizeof buf, "{\"id\":\"%s\",\"delivered\":false,\"reason\":\"%s\"}", id, !strcmp(perm, "denied") ? "permission denied" : "permission not requested");
        return reply(buf);
      }
      int at = -1;
      for (int i = 0; i < nnotes; i++) if (!strcmp(notes[i].id, id)) at = i;   // same id: the notification is replaced
      if (at < 0 && nnotes < 32) at = nnotes++;
      if (at >= 0) { snprintf(notes[at].id, sizeof notes[at].id, "%s", id); snprintf(notes[at].title, sizeof notes[at].title, "%s", title); snprintf(notes[at].body, sizeof notes[at].body, "%s", body); }
      snprintf(buf, sizeof buf, "{\"id\":\"%s\",\"delivered\":true}", id);
      return reply(buf);
    }
    if (!strcmp(name, "notification.cancel")) {
      for (int i = 0; i < nnotes; i++) if (!strcmp(notes[i].id, id)) { for (int k = i; k + 1 < nnotes; k++) notes[k] = notes[k + 1]; nnotes--; break; }
      return reply("{}");
    }
    if (!strcmp(name, "notification.delivered")) {
      strcpy(buf, "{\"items\":[");
      for (int i = 0; i < nnotes; i++) {
        if (i) strcat(buf, ",");
        strcat(buf, "{\"id\":"); appendJson(buf, sizeof buf, notes[i].id);
        strcat(buf, ",\"title\":"); appendJson(buf, sizeof buf, notes[i].title);
        strcat(buf, ",\"body\":"); appendJson(buf, sizeof buf, notes[i].body);
        strcat(buf, "}");
      }
      strcat(buf, "]}");
      return reply(buf);
    }
    return reply("{}");
  }
  void onEvent(zrt::Fn<void(zrt::String)> f) override { cb = f; }

  void readScript() {
    scriptRead = true;
    const char* path = getenv("ZINC_SYSTEM_SCRIPT");
    if (!path || !*path) return;
    FILE* f = fopen(path, "r");
    if (!f) { log("[system] error cannot read the script ", path); return; }
    char line[512];
    while (fgets(line, sizeof line, f) && nscript < MAXEV) {
      size_t len = strlen(line);
      while (len && (line[len - 1] == '\n' || line[len - 1] == '\r')) line[--len] = 0;
      for (char* h = strchr(line, '#'); h; h = strchr(h + 1, '#')) if (h == line || h[-1] == ' ') { *h = 0; break; }   // `# comment` after the event
      char words[16][160];
      int nw = 0;
      for (const char* q = line; *q && nw < 16;) {
        while (*q == ' ') q++;
        if (!*q) break;
        int k = 0;
        if (*q == '"') { q++; while (*q && *q != '"' && k < 159) words[nw][k++] = *q++; if (*q) q++; }
        else while (*q && *q != ' ' && k < 159) words[nw][k++] = *q++;
        words[nw++][k] = 0;
      }
      if (nw < 2) continue;
      bool known = false;
      for (const char* e : kSystemEvents) known = known || !strcmp(words[1], e);
      if (!known) { log("[system] error unknown event ", words[1]); continue; }
      ScriptEvent& ev = script[nscript++];
      ev.tick = atol(words[0]);
      snprintf(ev.json, sizeof ev.json, "{\"type\":");
      appendJson(ev.json, sizeof ev.json, words[1]);
      strncat(ev.json, ",\"args\":[", sizeof ev.json - strlen(ev.json) - 1);
      for (int i = 2; i < nw; i++) { if (i > 2) strncat(ev.json, ",", sizeof ev.json - strlen(ev.json) - 1); appendJson(ev.json, sizeof ev.json, words[i]); }
      strncat(ev.json, "]}", sizeof ev.json - strlen(ev.json) - 1);
    }
    fclose(f);
  }
  bool poll() override {
#ifdef __APPLE__
    if (live) { char ev[1200]; while (zn_sys_macos_poll(ev, sizeof ev)) deliver(ev); }
#endif
    if (!scriptRead) readScript();
    ticks++;
    while (next < nscript && script[next].tick <= ticks) {
      const char* json = script[next++].json;
      deliver(json);
    }
    return next < nscript;   // the loop stays alive while events are due
  }
  void shutdown() override { cb = nullptr; if (logFile) { fclose(logFile); logFile = nullptr; } }
};

int Sim::onClose() {   // the window's close button: a handler may veto with window.preventClose
  Sim* s = self();
  if (!s || !s->cb) return 1;   // nobody listens: close
  s->deliver("{\"type\":\"window\",\"args\":[\"close-requested\"]}");
  return 0;                     // the handlers run next (the callback is queued); the close goes ahead through window.confirmClose unless one vetoes
}
void Sim::onDrop(const char* path, int isText) {
  Sim* s = self();
  if (!s) return;
  char json[1200] = "{\"type\":\"drop\",\"args\":[";
  appendJson(json, sizeof json, path);
  strncat(json, isText ? ",\"text\"]}" : "]}", sizeof json - strlen(json) - 1);
  s->deliver(json);
}
}  // namespace

NativeSystem* zinc_create_System() {
  static Sim inst;
  inst.rc = zrt::IMMORTAL;
  Sim::self() = &inst;
  return &inst;
}

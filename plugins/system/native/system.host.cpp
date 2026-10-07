// zinc:system backend of the desktop targets (ZN-232): the permission gate and the recording simulator. The simulator is what runs in deterministic and headless runs: it answers
// every op from the table (ops.gen.h) and writes one line per call, `[system] <op> <json>` (stdout with ZINC_SYSTEM_LOG=- or in a deterministic run, a file with ZINC_SYSTEM_LOG=path);
// ZINC_SYSTEM_SCRIPT=file delivers events at the stated tick, one line `<tick> <event> args...` (a tick is one pass of the event loop: one frame in a UI app).
// C-style on purpose: the runtime header (zrt.h) defines placement new, which the standard containers redefine.
#include "zinc_native_system.h"
#include "ops.gen.h"
#include "hal.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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

struct Sim : NativeSystem, zrt::Poller {
  char granted[MAXGRANT][48];
  int ngranted = 0;
  zrt::Fn<void(zrt::String)> cb;
  ScriptEvent script[MAXEV];
  int nscript = 0, next = 0;
  long ticks = 0;
  bool toStdout = false, scriptRead = false;
  FILE* logFile = nullptr;

  Sim() {
    const char* l = getenv("ZINC_SYSTEM_LOG");
    const char* det = getenv("ZINC_DETERMINISTIC");
    if (l && !strcmp(l, "-")) toStdout = true;
    else if (l && *l) logFile = fopen(l, "w");
    else if (det && *det && *det != '0') toStdout = true;
    zrt::add_poller(this);
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
  zrt::String backend() override { return zrt::String::from("sim", 3); }
  zrt::String call(zrt::String op, zrt::String json) override {
    char name[96], args[2048];
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
      return zrt::String::from(o.sim, (uint32_t)strlen(o.sim));
    }
    log("[system] error unknown op ", name);
    int n = snprintf(buf, sizeof buf, "{\"error\":{\"code\":\"unsupported\",\"message\":\"unknown op %s\"}}", name);
    return zrt::String::from(buf, (uint32_t)n);
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
    if (!scriptRead) readScript();
    ticks++;
    while (next < nscript && script[next].tick <= ticks) {
      const char* json = script[next++].json;
      log("[system] event ", json);
      zrt::Fn<void(zrt::String)> f = cb;
      if (f) f(zrt::String::from(json, (uint32_t)strlen(json)));
    }
    return next < nscript;   // the loop stays alive while events are due
  }
  void shutdown() override { cb = nullptr; if (logFile) { fclose(logFile); logFile = nullptr; } }
};
}  // namespace

NativeSystem* zinc_create_System() {
  static Sim inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}

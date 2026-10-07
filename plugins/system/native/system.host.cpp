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
#include <errno.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/file.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#ifdef __APPLE__
#include <mach-o/dyld.h>
#endif

extern "C" void hal_set_close_handler(int (*)(void)) __attribute__((weak));   // the desktop HAL has them (runtime/include/hal_window.h); headless HALs do not
extern "C" void hal_set_drop_handler(void (*)(const char*, int)) __attribute__((weak));

#ifdef __APPLE__
extern "C" int zn_sys_macos_call(const char* op, const char* args, char* out, int cap);   // native/system.macos.mm
extern "C" int zn_sys_macos_poll(char* out, int cap);
extern "C" int zn_sys_macos_pump(void);
#endif
extern "C" void zn_host_fs_scope(int) __attribute__((weak));    // src/host/sys_host.cpp: the fs scope
extern "C" void zn_host_fs_grant(const char*) __attribute__((weak));
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


/** The strings of a flat JSON array `"key":[...]` in `json` (escapes \\ and \" undone), up to `max`; returns the count. */
int jsonStrings(const char* json, const char* key, char out[][160], int max) {
  char pat[64];
  snprintf(pat, sizeof pat, "\"%s\":[", key);
  const char* p = strstr(json, pat);
  if (!p) return 0;
  p += strlen(pat);
  int n = 0;
  while (*p && *p != ']' && n < max) {
    while (*p == ',' || *p == ' ') p++;
    if (*p != '"') break;
    p++;
    size_t k = 0;
    for (; *p && *p != '"' && k + 1 < 160; p++) { if (*p == '\\' && p[1]) p++; out[n][k++] = *p; }
    out[n++][k] = 0;
    if (*p == '"') p++;
  }
  return n;
}
void runtimePath(char* out, size_t cap, const char* id, const char* ext) {
  const char* dir = getenv("ZINC_SYSTEM_RUNTIME_DIR");
  if (!dir || !*dir) dir = getenv("TMPDIR");
  if (!dir || !*dir) dir = "/tmp";
  snprintf(out, cap, "%s%szinc-%s.%s", dir, dir[strlen(dir) - 1] == '/' ? "" : "/", id, ext);
}

struct SimNote { char id[64], title[128], body[256]; };

struct Sim : NativeSystem, zrt::Poller {
  char answers[16][256];   // queued answers for popups and dialogs (script events dialog-answer; a dialog with no answer is cancelled, never blocks)
  int nanswers = 0, nextAnswer = 0;
  int lockFd = -1, listenFd = -1;   // single instance: the lock file and the socket the second instance writes to
  char badge[64] = "";
  char hotkeys[16][64];   // accelerators registered in the simulator: a second registration of the same one is a conflict
  int nhotkeys = 0;
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
  void setScopes(zrt::String json) override {
    char* t = (char*)malloc(json.bytes() + 1);
    memcpy(t, json.ptr(), json.bytes()); t[json.bytes()] = 0;
    if (strstr(t, "\"fs\":\"user-picked\"") && zn_host_fs_scope) zn_host_fs_scope(1);   // the picked paths are granted as the dialogs answer
    free(t);
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
    size_t cap = strlen(a) + strlen(b) + strlen(c) + strlen(d) + 2;
    char* line = (char*)malloc(cap);
    int n = snprintf(line, cap, "%s%s%s%s\n", a, b, c, d);
    if (toStdout) hal_log(line, (size_t)n);   // the runtime's own stdout, so the lines interleave with console.log in call order
    else if (logFile) { fwrite(line, 1, (size_t)n, logFile); fflush(logFile); }
    free(line);
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
    char name[96];
    char* args = (char*)malloc(json.bytes() + 1);   // a menu template is long
    struct Free { char* p; ~Free() { free(p); } } freeArgs{args};
    self() = this;
    if (!scriptRead) readScript();   // the queued dialog answers must exist before the first dialog
    snprintf(name, sizeof name, "%.*s", (int)op.bytes(), op.ptr());
    memcpy(args, json.ptr(), json.bytes()); args[json.bytes()] = 0;
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
      if (live) { static char big[65536]; if (zn_sys_macos_call(name, args, big, sizeof big)) return reply(big); }
#endif

      if (!strcmp(name, "instance.lock")) return lockInstance(args);
      if (!strcmp(name, "autostart.set") || !strcmp(name, "autostart.get")) return autostart(name, args);
      if (!strcmp(name, "shortcut.register")) {
        char acc[64] = ""; jsonString(args, "accelerator", acc, sizeof acc);
        for (int i = 0; i < nhotkeys; i++) if (!strcmp(hotkeys[i], acc)) return reply("{\"status\":\"conflict\"}");
        if (nhotkeys < 16) snprintf(hotkeys[nhotkeys++], sizeof hotkeys[0], "%s", acc);
        return reply("{\"status\":\"ok\"}");
      }
      if (!strcmp(name, "shortcut.unregister")) {
        char acc[64] = ""; jsonString(args, "accelerator", acc, sizeof acc);
        for (int i = 0; i < nhotkeys; i++) if (!strcmp(hotkeys[i], acc)) { for (int k = i; k + 1 < nhotkeys; k++) memcpy(hotkeys[k], hotkeys[k + 1], sizeof hotkeys[0]); nhotkeys--; break; }
        return reply("{}");
      }
      if (!strcmp(name, "dock.setBadge")) { badge[0] = 0; jsonString(args, "text", badge, sizeof badge); return reply("{}"); }
      if (!strcmp(name, "dock.getBadge")) { char b[160] = "{\"text\":"; appendJson(b, sizeof b, badge); strcat(b, "}"); return reply(b); }
      if (!strncmp(name, "notification.", 13)) return notification(name, args);
      if (!strcmp(name, "menu.popup") || !strncmp(name, "dialog.", 7)) return answer(name);
      if (!strcmp(name, "window.confirmClose") && hal_set_close_handler) zrt::quit_requested = true;   // a real window: the veto of the close button ends here
      return zrt::String::from(o.sim, (uint32_t)strlen(o.sim));
    }
    log("[system] error unknown op ", name);
    int n = snprintf(buf, sizeof buf, "{\"error\":{\"code\":\"unsupported\",\"message\":\"unknown op %s\"}}", name);
    return zrt::String::from(buf, (uint32_t)n);
  }
  zrt::String answer(const char* name) {
    const char* a = nextAnswer < nanswers ? answers[nextAnswer++] : "cancel";
    bool cancel = !strcmp(a, "cancel");
    char buf[600];
    if (!strcmp(name, "menu.popup")) { if (cancel) return reply("{\"id\":null}"); snprintf(buf, sizeof buf, "{\"id\":"); appendJson(buf, sizeof buf, a); strcat(buf, "}"); return reply(buf); }
    if (!cancel && zn_host_fs_grant && (!strcmp(name, "dialog.open") || !strcmp(name, "dialog.save"))) zn_host_fs_grant(a);   // a picked path joins the fs scope
    if (!strcmp(name, "dialog.open")) { if (cancel) return reply("{\"paths\":null}"); snprintf(buf, sizeof buf, "{\"paths\":["); appendJson(buf, sizeof buf, a); strcat(buf, "]}"); return reply(buf); }
    if (!strcmp(name, "dialog.save")) { if (cancel) return reply("{\"path\":null}"); snprintf(buf, sizeof buf, "{\"path\":"); appendJson(buf, sizeof buf, a); strcat(buf, "}"); return reply(buf); }
    snprintf(buf, sizeof buf, "{\"button\":%d}", cancel ? -1 : atoi(a));   // dialog.message: the index of the button, -1 when dismissed
    return reply(buf);
  }

  /** instance.lock: the first process takes an flock on <id>.lock and listens on <id>.sock; a later one finds the lock held and hands its argv and cwd over the socket (a stale socket of a dead process is replaced). */
  zrt::String lockInstance(const char* args) {
    char id[96] = "", lock[300], sock[300];
    jsonString(args, "id", id, sizeof id);
    if (!id[0]) return reply("{\"error\":{\"code\":\"failed\",\"message\":\"instance.lock needs the app id\"}}");
    runtimePath(lock, sizeof lock, id, "lock");
    runtimePath(sock, sizeof sock, id, "sock");
    int fd = open(lock, O_CREAT | O_RDWR | O_CLOEXEC, 0600);
    if (fd < 0) return reply("{\"error\":{\"code\":\"failed\",\"message\":\"cannot open the lock file\"}}");
    if (flock(fd, LOCK_EX | LOCK_NB) == 0) {   // the first instance
      lockFd = fd;
      unlink(sock);   // a socket left by a dead process
      int s = socket(AF_UNIX, SOCK_STREAM, 0);
      sockaddr_un a = {};
      a.sun_family = AF_UNIX;
      snprintf(a.sun_path, sizeof a.sun_path, "%s", sock);
      if (s >= 0 && bind(s, (sockaddr*)&a, sizeof a) == 0 && listen(s, 4) == 0) { fcntl(s, F_SETFL, O_NONBLOCK); fcntl(s, F_SETFD, FD_CLOEXEC); listenFd = s; }
      return reply("{\"first\":true}");
    }
    close(fd);
    // another instance holds the lock: tell it
    char cwd[512] = "", argv[16][160];
    if (!getcwd(cwd, sizeof cwd)) cwd[0] = 0;
    int n = jsonStrings(args, "argv", argv, 16);
    char msg[4096] = "{\"cwd\":";
    appendJson(msg, sizeof msg, cwd);
    strcat(msg, ",\"argv\":[");
    for (int i = 0; i < n; i++) { if (i) strcat(msg, ","); appendJson(msg, sizeof msg, argv[i]); }
    strcat(msg, "]}\n");
    for (int attempt = 0; attempt < 20; attempt++) {   // the first may still be binding
      int s = socket(AF_UNIX, SOCK_STREAM, 0);
      sockaddr_un a = {};
      a.sun_family = AF_UNIX;
      snprintf(a.sun_path, sizeof a.sun_path, "%s", sock);
      if (s >= 0 && connect(s, (sockaddr*)&a, sizeof a) == 0) { ssize_t w = write(s, msg, strlen(msg)); (void)w; close(s); return reply("{\"first\":false}"); }
      if (s >= 0) close(s);
      usleep(50000);
    }
    return reply("{\"first\":false}");   // the holder never answered: still not the first
  }
  /** Accepts second-instance messages: one JSON line each, delivered as the event second-instance [cwd, argv...]. Returns true while listening. */
  bool serveInstance() {
    if (listenFd < 0) return false;
    for (;;) {
      int c = accept(listenFd, nullptr, nullptr);
      if (c < 0) break;
      char buf[4096];
      size_t got = 0;
      for (int tries = 0; tries < 40 && got < sizeof buf - 1; tries++) {
        ssize_t r = read(c, buf + got, sizeof buf - 1 - got);
        if (r > 0) { got += (size_t)r; if (memchr(buf, '\n', got)) break; }
        else if (r == 0) break;
        else usleep(5000);
      }
      close(c);
      buf[got] = 0;
      char cwd[512] = "", argv[16][160];
      jsonString(buf, "cwd", cwd, sizeof cwd);
      int n = jsonStrings(buf, "argv", argv, 16);
      char ev[4096] = "{\"type\":\"second-instance\",\"args\":[";
      appendJson(ev, sizeof ev, cwd);
      for (int i = 0; i < n; i++) { strcat(ev, ","); appendJson(ev, sizeof ev, argv[i]); }
      strcat(ev, "]}");
      deliver(ev);
    }
    return true;
  }
  /** autostart.set / .get: a LaunchAgent plist (macOS) or an XDG autostart .desktop (Linux) under $HOME, so a temporary HOME makes it testable. */
  zrt::String autostart(const char* name, const char* args) {
    char id[96] = "", title[96] = "", home[300];
    jsonString(args, "id", id, sizeof id);
    jsonString(args, "name", title, sizeof title);
    const char* hm = getenv("HOME");
    snprintf(home, sizeof home, "%s", hm && *hm ? hm : "/tmp");
    char path[400], dir[400];
#ifdef __APPLE__
    snprintf(dir, sizeof dir, "%s/Library/LaunchAgents", home);
    snprintf(path, sizeof path, "%s/%s.plist", dir, id);
#else
    snprintf(dir, sizeof dir, "%s/.config/autostart", home);
    snprintf(path, sizeof path, "%s/%s.desktop", dir, id);
#endif
    if (!strcmp(name, "autostart.get")) { bool on = access(path, F_OK) == 0; return reply(on ? "{\"enabled\":true}" : "{\"enabled\":false}"); }
    bool enabled = strstr(args, "\"enabled\":true") != nullptr, hidden = strstr(args, "\"hidden\":true") != nullptr;
    if (!enabled) { unlink(path); return reply("{}"); }
    char exe[1024] = "";
#ifdef __APPLE__
    uint32_t sz = sizeof exe;
    if (_NSGetExecutablePath(exe, &sz) != 0) exe[0] = 0;
#else
    ssize_t l = readlink("/proc/self/exe", exe, sizeof exe - 1);
    exe[l > 0 ? l : 0] = 0;
#endif
    char extra[8][160];
    int n = jsonStrings(args, "args", extra, 8);
    mkdir(home, 0755);
    char parent[400];
    snprintf(parent, sizeof parent, "%s", dir);
    for (char* q = parent + 1; *q; q++) if (*q == '/') { *q = 0; mkdir(parent, 0755); *q = '/'; }
    mkdir(dir, 0755);
    FILE* f = fopen(path, "w");
    if (!f) return reply("{\"error\":{\"code\":\"failed\",\"message\":\"cannot write the autostart entry\"}}");
#ifdef __APPLE__
    fprintf(f, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict>\n<key>Label</key><string>%s</string>\n<key>ProgramArguments</key><array><string>%s</string>", id, exe);
    for (int i = 0; i < n; i++) fprintf(f, "<string>%s</string>", extra[i]);
    if (hidden) fprintf(f, "<string>--hidden</string>");
    fprintf(f, "</array>\n<key>RunAtLoad</key><true/>\n</dict></plist>\n");
#else
    fprintf(f, "[Desktop Entry]\nType=Application\nName=%s\nExec=%s", title[0] ? title : id, exe);
    for (int i = 0; i < n; i++) fprintf(f, " %s", extra[i]);
    if (hidden) fprintf(f, " --hidden");
    fprintf(f, "\nX-GNOME-Autostart-enabled=true\n");
#endif
    fclose(f);
    return reply("{}");
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
      if (!strcmp(words[1], "dialog-answer")) { if (nanswers < 16) snprintf(answers[nanswers++], sizeof answers[0], "%s", nw > 2 ? words[2] : "cancel"); continue; }   // queued now, whatever its tick
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
    bool servingAppKit = false;
    if (live) { servingAppKit = zn_sys_macos_pump() != 0; char ev[1200]; while (zn_sys_macos_poll(ev, sizeof ev)) deliver(ev); }
#endif
    if (!scriptRead) readScript();
    bool serving = serveInstance();
    ticks++;
    while (next < nscript && script[next].tick <= ticks) {
      const char* json = script[next++].json;
      deliver(json);
    }
#ifdef __APPLE__
    if (servingAppKit) return true;
#endif
    if (serving) return true;   // a first instance keeps listening for the second
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

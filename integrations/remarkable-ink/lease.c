// lease: the reMarkable display lease (docs/reports/remarkable-bridge-design.md §3 and §7.1, docs/targets/remarkable-paper-pro.md).
// An app that needs the panel for itself runs in one transient systemd unit, zinc-lease, which stops xochitl through systemd and
// restores it exactly once on every way out. Nothing is installed: the unit goes away with the session.
//
//   lease launch [--max S] [--watchdog S] [--vendor-sha256 H] <app> [args]   every check first, then systemd-run (refusals say why)
//   lease session <app> [args]   the unit's main process: wakelock, power key, systemctl stop xochitl, the app as a child
//   lease restore                the unit's ExecStopPost: at most one systemctl start xochitl, then the wakelock is released
//   lease status                 the budget and the last result
//
// Rules: xochitl is stopped with `systemctl stop` only (never frozen, killed, masked or edited); our starts stay within 2 per 10 min and
// 6 per hour (/run/zinc-lease/starts, reset at boot like systemd's counters); reset-failed only after our own clean stop.
// Portable Linux C (static, aarch64 or armv7). LEASE_ROOT prefixes every file path and LEASE_CLOCK names a file holding the clock in
// seconds: the fake systemd of tests/native/rmpp/lease-sim runs it on a Mac that way.
#define _GNU_SOURCE
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <poll.h>
#include <signal.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>
#ifdef __linux__
#include <linux/input.h>
#else   // the same record as linux/input.h, for the harness on a Mac
struct input_event { struct timeval time; unsigned short type, code; int value; };
#define EV_KEY 1
#define KEY_POWER 116
#endif

#define UNIT "zinc-lease"
#define RUN "/run/zinc-lease"
// The stock xochitl unit of the Paper Pro (OS 3.2x): a different policy means an OS update changed it, and the lease is re-verified first.
#define XO_BURST "4"
#define XO_INTERVAL "10min"
#define XO_WATCHDOG "1min"

static char path_buf[8][PATH_MAX];
static int path_slot;
static const char *P(const char *fmt, ...) {   // a file path under LEASE_ROOT (empty on the tablet)
  char *b = path_buf[path_slot++ & 7];
  const char *r = getenv("LEASE_ROOT");
  int n = snprintf(b, PATH_MAX, "%s", r ? r : "");
  va_list ap; va_start(ap, fmt); vsnprintf(b + n, PATH_MAX - n, fmt, ap); va_end(ap);
  return b;
}

static long now(void) {   // seconds of CLOCK_MONOTONIC, the clock of systemd's ActiveEnterTimestampMonotonic
  const char *f = getenv("LEASE_CLOCK");
  if (f) { FILE *c = fopen(f, "r"); long t = 0; if (c) { if (fscanf(c, "%ld", &t) != 1) t = 0; fclose(c); } return t; }
  struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts); return ts.tv_sec;
}
static void pause_s(long s) {   // the fake clock moves instead of sleeping
  const char *f = getenv("LEASE_CLOCK");
  if (!f) { sleep((unsigned)s); return; }
  long t = now() + s; FILE *c = fopen(f, "w"); if (c) { fprintf(c, "%ld\n", t); fclose(c); }
}

static int put(const char *file, const char *fmt, ...) {
  FILE *f = fopen(file, "w"); if (!f) return -1;
  va_list ap; va_start(ap, fmt); vfprintf(f, fmt, ap); va_end(ap);
  return fclose(f);
}
static int exists(const char *f) { struct stat st; return stat(f, &st) == 0; }

// Every line goes to stderr (the journal under systemd) and the last one to /run/zinc-lease/last.
static void say(const char *fmt, ...) {
  char m[512]; va_list ap; va_start(ap, fmt); vsnprintf(m, sizeof m, fmt, ap); va_end(ap);
  fprintf(stderr, "lease: %s\n", m);
  put(P(RUN "/last"), "%ld %s\n", now(), m);
}
static void __attribute__((noreturn)) refuse(const char *fmt, ...) {
  char m[480]; va_list ap; va_start(ap, fmt); vsnprintf(m, sizeof m, fmt, ap); va_end(ap);
  say("refused: %s", m);
  exit(3);
}

// Runs argv, its first line of output in out (when out is given). The exit status, or -1.
static int run(char *out, size_t n, const char *const argv[]) {
  int fd[2]; if (out && pipe(fd)) return -1;
  pid_t p = fork();
  if (p < 0) return -1;
  if (!p) {
    if (out) { dup2(fd[1], 1); close(fd[0]); close(fd[1]); }
    execvp(argv[0], (char *const *)argv); _exit(127);
  }
  if (out) {
    close(fd[1]);
    size_t k = 0; ssize_t r;
    while ((r = read(fd[0], out + k, k + 1 < n ? n - 1 - k : 0)) > 0) k += (size_t)r;
    if (r > 0 || k + 1 >= n) { char sink[256]; while (read(fd[0], sink, sizeof sink) > 0) {} }
    close(fd[0]);
    out[k] = 0; out[strcspn(out, "\n")] = 0;
  }
  int st; while (waitpid(p, &st, 0) < 0 && errno == EINTR) {}
  return WIFEXITED(st) ? WEXITSTATUS(st) : -1;
}
static const char *show(const char *unit, const char *prop) {   // systemctl show <unit> -p <prop> --value
  static char v[4][256]; static int s;
  char *o = v[s++ & 3];
  const char *a[] = {"systemctl", "show", unit, "-p", prop, "--value", NULL};
  if (run(o, 256, a) != 0) o[0] = 0;
  return o;
}
static int sysctl(const char *verb, const char *unit) { const char *a[] = {"systemctl", verb, unit, NULL}; return run(NULL, 0, a); }
static int active(const char *unit) { const char *a[] = {"systemctl", "is-active", "--quiet", unit, NULL}; return run(NULL, 0, a) == 0; }

// The panel: who opens the DRM device, and who owns the vendor engine's QLockFile.
static int alive(long pid) { return pid > 1 && exists(P("/proc/%ld", pid)); }
static void comm_of(long pid, char *c, size_t n) {
  FILE *f = fopen(P("/proc/%ld/comm", pid), "r"); c[0] = 0;
  if (f) { if (fgets(c, (int)n, f)) c[strcspn(c, "\n")] = 0; fclose(f); }
}
static int drm_openers(const char *except, char *who, size_t n) {   // processes other than `except` holding /dev/dri/card*
  int count = 0; who[0] = 0;
  DIR *d = opendir(P("/proc"));
  for (struct dirent *e; d && (e = readdir(d));) {
    char *end; long pid = strtol(e->d_name, &end, 10);
    if (*end || pid <= 0 || pid == getpid()) continue;
    char fds[PATH_MAX]; snprintf(fds, sizeof fds, "%s", P("/proc/%ld/fd", pid));
    DIR *fdd = opendir(fds);
    for (struct dirent *f; fdd && (f = readdir(fdd));) {
      char l[PATH_MAX], t[PATH_MAX]; snprintf(l, sizeof l, "%s/%s", fds, f->d_name);
      ssize_t k = readlink(l, t, sizeof t - 1); if (k <= 0) continue; t[k] = 0;
      if (strncmp(t, "/dev/dri/card", 13)) continue;
      char c[64]; comm_of(pid, c, sizeof c);
      if (!except || strcmp(c, except)) { count++; size_t w = strlen(who); snprintf(who + w, n - w, "%s%s[%ld]", w ? " " : "", c, pid); }
      break;
    }
    if (fdd) closedir(fdd);
  }
  if (d) closedir(d);
  return count;
}
// The lock of a dead xochitl or of the app is cleared (as QLockFile would); a live owner is never touched. 0 when the lock is free.
static int clear_stale_lock(const char *app, char *why, size_t n) {
  const char *lock = getenv("LEASE_LOCK") ? getenv("LEASE_LOCK") : P("/tmp/epframebuffer.lock");
  FILE *f = fopen(lock, "r"); if (!f) return 0;
  long pid = 0; char name[64] = "";
  if (fscanf(f, "%ld %63s", &pid, name) < 1) pid = 0;
  fclose(f);
  if (alive(pid)) { snprintf(why, n, "the display lock is held by the live process %s[%ld]", name, pid); return 1; }
  if (strcmp(name, "xochitl") && strcmp(name, app)) { snprintf(why, n, "the display lock belongs to an unknown program (%s[%ld])", name, pid); return 1; }
  unlink(lock);
  say("cleared the stale display lock of %s[%ld]", name, pid);
  return 0;
}

// Our starts of xochitl: one line per start, "<stop time> <start time>", written before the start itself.
static int read_starts(long *s, int max) {
  FILE *f = fopen(P(RUN "/starts"), "r"); int k = 0;
  long a, b;
  while (f && k < max && fscanf(f, "%ld %ld", &a, &b) == 2) s[k++] = b;
  if (f) fclose(f);
  return k;
}
// 0 when one more start is within the budget, else the seconds to wait and the reason in why.
static long budget(long t, char *why, size_t n) {
  long s[1024]; int k = read_starts(s, 1024), in10 = 0, inh = 0;
  long old10 = t, oldh = t, last = -1;
  for (int i = 0; i < k; i++) {
    if (t - s[i] < 600) { in10++; if (s[i] < old10) old10 = s[i]; }
    if (t - s[i] < 3600) { inh++; if (s[i] < oldh) oldh = s[i]; }
    if (s[i] > last) last = s[i];
  }
  if (last >= 0 && t - last < 60) { snprintf(why, n, "xochitl came back %ld s ago; leases are at least 60 s apart", t - last); return last + 60 - t; }
  if (in10 >= 2) { snprintf(why, n, "xochitl was restarted %d times in the last 10 minutes (at most 2)", in10); return old10 + 600 - t; }
  if (inh >= 6) { snprintf(why, n, "xochitl was restarted %d times in the last hour (at most 6)", inh); return oldh + 3600 - t; }
  return 0;
}

static int wakelock(int on) {
  const char *f = P(on ? "/sys/power/wake_lock" : "/sys/power/wake_unlock");
  if (put(f, UNIT "\n")) return -1;
  if (on) return put(P(RUN "/wake"), "1\n");
  unlink(P(RUN "/wake"));
  return 0;
}

static int launch(int argc, char **argv) {
  long max = 1800, wd = 0; const char *vendor = NULL; int i = 2;
  for (; i + 1 < argc && argv[i][0] == '-'; i += 2) {
    if (!strcmp(argv[i], "--max")) max = atol(argv[i + 1]);
    else if (!strcmp(argv[i], "--watchdog")) wd = atol(argv[i + 1]);
    else if (!strcmp(argv[i], "--vendor-sha256")) vendor = argv[i + 1];
    else { fprintf(stderr, "lease: unknown option %s\n", argv[i]); return 2; }
  }
  if (i >= argc) { fprintf(stderr, "usage: lease launch [--max S] [--watchdog S] [--vendor-sha256 H] <app> [args]\n"); return 2; }
  if (max <= 0 || max > 7200) max = max <= 0 ? 1800 : 7200;   // the dead-man: 30 min by default, 2 h at most
  char app[PATH_MAX], self[PATH_MAX], dir[PATH_MAX];
  if (!realpath(argv[i], app) || access(app, X_OK)) { fprintf(stderr, "lease: %s is not an executable\n", argv[i]); return 2; }
  if (!realpath(argv[0], self)) { ssize_t k = readlink("/proc/self/exe", self, sizeof self - 1); if (k <= 0) return 2; self[k] = 0; }
  snprintf(dir, sizeof dir, "%s", app); *strrchr(dir, '/') = 0;
  mkdir(P("/run"), 0755); mkdir(P(RUN), 0755);
  const long t = now();
  char why[400];

  // Every check before anything is created or stopped.
  if (active(UNIT)) refuse("a lease is already running (systemctl stop " UNIT " ends it)");
  if (exists(P(RUN "/restore"))) refuse("the last lease did not finish its restore; read %s, then start xochitl by hand (docs/targets/remarkable-paper-pro.md, Recovery)", P(RUN "/last"));
  if (access(P("/sys/power/wake_lock"), W_OK) || access(P("/sys/power/wake_unlock"), W_OK)) refuse("no wakelock (/sys/power/wake_lock): the tablet could sleep with xochitl stopped");
  if (vendor) {
    char sum[160]; const char *a[] = {"sha256sum", "/usr/lib/plugins/scenegraph/libqsgepaper.so", NULL};
    if (run(sum, sizeof sum, a) || strncmp(sum, vendor, strlen(vendor))) refuse("untested firmware: libqsgepaper.so is not %.16s...", vendor);
  }
  // Rule 1: read the unit, never change it.
  const char *burst = show("xochitl", "StartLimitBurst"), *interval = show("xochitl", "StartLimitIntervalUSec"), *wdog = show("xochitl", "WatchdogUSec");
  if (strcmp(burst, XO_BURST) || strcmp(interval, XO_INTERVAL) || strcmp(wdog, XO_WATCHDOG))
    refuse("xochitl's unit is not the one this lease was verified with (StartLimitBurst=%s StartLimitIntervalUSec=%s WatchdogUSec=%s, expected " XO_BURST " " XO_INTERVAL " " XO_WATCHDOG "): an OS update changed it", burst, interval, wdog);
  long restarts = atol(show("xochitl", "NRestarts")), seen = -1;
  FILE *sf = fopen(P(RUN "/state"), "r");
  if (sf) { if (fscanf(sf, "NRestarts=%ld", &seen) != 1) seen = -1; fclose(sf); }
  else put(P(RUN "/state"), "NRestarts=%ld\nStartLimitBurst=%s\nStartLimitIntervalUSec=%s\nWatchdogUSec=%s\nOnFailure=%s\n", restarts, burst, interval, wdog, show("xochitl", "OnFailure"));
  // Rule 3: only a healthy xochitl is stopped.
  const char *state = show("xochitl", "ActiveState"), *result = show("xochitl", "Result");
  if (strcmp(state, "active")) refuse("xochitl is %s, not active", state[0] ? state : "unknown");
  if (strcmp(result, "success")) refuse("xochitl's last result is %s: it is in trouble, the lease stays out of the way", result);
  if (seen >= 0 && restarts != seen) refuse("xochitl restarted on its own (NRestarts %ld, was %ld at the first lease of this boot): no lease until the next boot", restarts, seen);
  long up = t - atol(show("xochitl", "ActiveEnterTimestampMonotonic")) / 1000000;
  if (up < 30) refuse("xochitl has been active for %ld s only; try again in %ld s", up, 30 - up);
  // Rule 2: our budget, stricter than systemd's.
  long wait = budget(t, why, sizeof why);
  if (wait > 0) refuse("%s; the next lease is allowed in %ld s", why, wait);
  // Rule 6: nobody but xochitl holds the panel.
  char who[256];
  if (drm_openers("xochitl", who, sizeof who)) refuse("the display is open by %s besides xochitl", who);

  char rt[32], wds[32], post[PATH_MAX + 16], wdir[PATH_MAX + 32], ld[PATH_MAX + 32];
  snprintf(rt, sizeof rt, "RuntimeMaxSec=%ld", max);
  snprintf(wds, sizeof wds, "WatchdogSec=%ld", wd);
  snprintf(post, sizeof post, "ExecStopPost=%s restore", self);
  snprintf(wdir, sizeof wdir, "--working-directory=%s", dir);
  const char *a[64]; int k = 0;
  a[k++] = "systemd-run"; a[k++] = "--unit=" UNIT; a[k++] = "--collect"; a[k++] = "--service-type=exec"; a[k++] = wdir;
  a[k++] = "-p"; a[k++] = rt; a[k++] = "-p"; a[k++] = "KillMode=control-group"; a[k++] = "-p"; a[k++] = "TimeoutStopSec=90";
  if (wd > 0) { a[k++] = "-p"; a[k++] = wds; a[k++] = "-p"; a[k++] = "NotifyAccess=all"; }   // the app sends WATCHDOG=1 every frame
  if (getenv("LD_LIBRARY_PATH")) { snprintf(ld, sizeof ld, "LD_LIBRARY_PATH=%s", getenv("LD_LIBRARY_PATH")); a[k++] = "-E"; a[k++] = ld; }
  a[k++] = "-p"; a[k++] = post; a[k++] = self; a[k++] = "session";
  for (; i < argc && k < 63; i++) a[k++] = argv[i];
  a[k] = NULL;
  say("launch %s (dead-man %ld s%s)", app, max, wd > 0 ? ", app watchdog on" : "");
  execvp(a[0], (char *const *)a);
  refuse("cannot run systemd-run: %s", strerror(errno));
}

static volatile sig_atomic_t stop_asked;
static void on_term(int s) { (void)s; stop_asked = 1; }

static int power_device(void) {   // the key device with KEY_POWER, grabbed so that only the lease sees the button
  const char *e = getenv("LEASE_POWER_DEV");
  if (e) return open(e, O_RDONLY | O_NONBLOCK);
#ifdef __linux__
  for (int i = 0; i < 16; i++) {
    char d[32]; snprintf(d, sizeof d, "/dev/input/event%d", i);
    int fd = open(d, O_RDONLY | O_NONBLOCK); if (fd < 0) continue;
    unsigned char keys[KEY_MAX / 8 + 1] = {0};
    if (ioctl(fd, EVIOCGBIT(EV_KEY, sizeof keys), keys) >= 0 && (keys[KEY_POWER / 8] >> (KEY_POWER % 8) & 1)) { ioctl(fd, EVIOCGRAB, 1); return fd; }
    close(fd);
  }
#endif
  return -1;
}

static void end_app(pid_t app) {   // SIGTERM, 3 s of grace, then SIGKILL
  kill(app, SIGTERM);
  for (int i = 0; i < 30; i++) { if (waitpid(app, NULL, WNOHANG) == app) return; usleep(100000); }
  kill(app, SIGKILL); waitpid(app, NULL, 0);
}

static int session(int argc, char **argv) {
  if (argc < 3) return 2;
  if (!getenv("INVOCATION_ID")) { fprintf(stderr, "lease: a session runs inside its unit: use lease launch\n"); return 2; }
  mkdir(P("/run"), 0755); mkdir(P(RUN), 0755);
  signal(SIGTERM, on_term); signal(SIGINT, on_term);
  const char *name = strrchr(argv[2], '/') ? strrchr(argv[2], '/') + 1 : argv[2];
  put(P(RUN "/restore"), "%s\n", name);   // first: ExecStopPost restores whatever happens next
  if (wakelock(1)) { say("cannot take the wakelock"); return 1; }
  int pw = power_device();
  long t = now();
  int rc = sysctl("stop", "xochitl");
  const char *state = show("xochitl", "ActiveState"), *result = show("xochitl", "Result");
  if (strcmp(state, "inactive") && strcmp(state, "failed")) { say("xochitl is still %s after systemctl stop (exit %d)", state, rc); return 1; }
  if (!strcmp(result, "success")) put(P(RUN "/ours"), "%ld\n", t);   // our own clean stop: the restore may reset-failed
  else say("xochitl stopped with result %s: the restore will not reset its counters", result);
  put(P(RUN "/stopped"), "%ld\n", t);
  char why[256], who[256];
  if (clear_stale_lock(name, why, sizeof why)) { say("%s", why); return 1; }
  if (drm_openers(NULL, who, sizeof who)) { say("the display is still open by %s", who); return 1; }
  if (stop_asked) return 0;
  pid_t app = fork();
  if (app < 0) { say("fork failed"); return 1; }
  if (!app) { signal(SIGTERM, SIG_DFL); signal(SIGINT, SIG_DFL); execv(argv[2], argv + 2); _exit(127); }
  say("xochitl stopped; %s started", name);
  double down = -1; struct timespec held = {0, 0};
  for (;;) {
    int st;
    if (waitpid(app, &st, WNOHANG) == app) {
      if (WIFEXITED(st)) say("%s exited with status %d", name, WEXITSTATUS(st));
      else say("%s ended by signal %d", name, WIFSIGNALED(st) ? WTERMSIG(st) : 0);
      return 0;
    }
    if (stop_asked) { say("stop asked: ending %s", name); end_app(app); return 0; }
    struct pollfd p = {pw, POLLIN, 0};
    if (poll(&p, pw >= 0, 200) > 0) {
      struct input_event ev;
      while (read(pw, &ev, sizeof ev) == (ssize_t)sizeof ev) {
        if (ev.type != EV_KEY || ev.code != KEY_POWER) continue;
        double at = ev.time.tv_sec + ev.time.tv_usec / 1e6;
        if (ev.value == 1) { down = at; clock_gettime(CLOCK_MONOTONIC, &held); }
        else if (ev.value == 0 && down >= 0) { if (at - down >= 2) goto power; down = -1; }
      }
    }
    if (down >= 0) { struct timespec n; clock_gettime(CLOCK_MONOTONIC, &n); if (n.tv_sec - held.tv_sec >= 2) goto power; }
  }
power:
  say("power key long press: ending %s", name);
  end_app(app);
  return 0;
}

static int busy(const char *name, char *why, size_t n) {
  char who[256];
  if (clear_stale_lock(name, why, n)) return 1;
  if (drm_openers(NULL, who, sizeof who)) { snprintf(why, n, "the display is still open by %s", who); return 1; }
  return 0;
}
// One systemctl start xochitl, written to the budget before anything else can happen. Its time, negative when it failed.
static long start(long stopped) {
  long t = now();
  FILE *s = fopen(P(RUN "/starts"), "a"); if (s) { fprintf(s, "%ld %ld\n", stopped, t); fclose(s); }
  return sysctl("start", "xochitl") == 0 ? t : -t;
}

static int restore(void) {
  mkdir(P("/run"), 0755); mkdir(P(RUN), 0755);
  FILE *rf = fopen(P(RUN "/restore"), "r");
  if (!rf) { if (exists(P(RUN "/wake"))) wakelock(0); return 0; }   // nothing was stopped: nothing to start
  char name[128] = ""; if (fgets(name, sizeof name, rf)) name[strcspn(name, "\n")] = 0; fclose(rf);
  // The unit's processes are gone before ExecStopPost; wait for the cgroup to hold no one but us.
  const char *cg = show(UNIT, "ControlGroup");
  for (int i = 0; cg[0] && i < 10; i++) {
    FILE *f = fopen(P("/sys/fs/cgroup%s/cgroup.procs", cg), "r"); long pid; int others = 0;
    while (f && fscanf(f, "%ld", &pid) == 1) if (pid != getpid()) others++;
    if (f) fclose(f);
    if (!others) break;
    if (i == 9) { say("restore: the lease's processes did not end; keeping the wakelock, xochitl stays stopped"); return 1; }
    pause_s(1);
  }
  long stopped = 0; FILE *sf = fopen(P(RUN "/stopped"), "r"); if (sf) { if (fscanf(sf, "%ld", &stopped) != 1) stopped = 0; fclose(sf); }
  if (active("xochitl")) { say("restore: xochitl is already active"); goto done; }
  char why[256];
  if (busy(name, why, sizeof why)) {   // rule 6
    say("restore: %s; waiting 10 s", why); pause_s(10);
    if (busy(name, why, sizeof why)) { say("restore: %s; keeping the wakelock, xochitl stays stopped (docs/targets/remarkable-paper-pro.md, Recovery)", why); return 1; }
  }
  if (exists(P(RUN "/ours"))) sysctl("reset-failed", "xochitl");   // rule 5: only after our own clean stop
  long t = start(stopped);
  if (t < 0 && busy(name, why, sizeof why)) {   // rule 7: one start; once more after 10 s only when the display was busy
    say("restore: systemctl start xochitl failed, %s; one retry in 10 s", why);
    pause_s(10);
    if (!active("xochitl")) t = start(stopped);
  } else if (t < 0) say("restore: systemctl start xochitl failed; no retry");
  for (int i = 0; i < 30 && !active("xochitl"); i++) pause_s(1);
  if (!active("xochitl")) { say("restore: xochitl did not come back (Result=%s); keeping the wakelock (docs/targets/remarkable-paper-pro.md, Recovery)", show("xochitl", "Result")); return 1; }
  say("restore: xochitl active again (stopped at %ld, started at %ld, active at %ld)", stopped, t < 0 ? -t : t, now());
done:
  wakelock(0);
  unlink(P(RUN "/ours")); unlink(P(RUN "/stopped")); unlink(P(RUN "/restore"));
  return 0;
}

static int status(void) {
  char why[400], l[512] = "";
  long t = now(), wait = budget(t, why, sizeof why), s[1024];
  int k = read_starts(s, 1024);
  FILE *f = fopen(P(RUN "/last"), "r"); if (f) { if (!fgets(l, sizeof l, f)) l[0] = 0; fclose(f); }
  printf("lease: %s; xochitl %s; %d start(s) by the lease this boot; %s\n", active(UNIT) ? "running" : "idle", show("xochitl", "ActiveState"), k,
         exists(P(RUN "/restore")) ? "a restore is pending" : "nothing to restore");
  if (wait > 0) printf("next lease in %ld s: %s\n", wait, why);
  if (l[0]) printf("last: %s", l);
  return 0;
}

int main(int argc, char **argv) {
  const char *c = argc > 1 ? argv[1] : "";
  if (!strcmp(c, "launch")) return launch(argc, argv);
  if (!strcmp(c, "session")) return session(argc, argv);
  if (!strcmp(c, "restore")) return restore();
  if (!strcmp(c, "status")) return status();
  fprintf(stderr, "usage: lease launch [--max S] [--watchdog S] [--vendor-sha256 H] <app> [args] | session <app> | restore | status\n");
  return 2;
}

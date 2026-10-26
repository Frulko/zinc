// zinc-watch: watches one Zinc app on the reMarkable for as long as it runs (ZN-844), as cheaply as it can: zinc-app starts it in the
// background just before it execs zinc, so the app is its parent and it ends when the app does.
//   zinc-watch <base>      (<base>.pid: zinc-app's pidfile, <base>.beat: the app's heartbeat, <base>.watch: what this one writes)
// Every PERIOD_S seconds it wakes once: no fork, no shell, three small reads from /proc and the heartbeat's stat, one small write to tmpfs.
// The engine rewrites the heartbeat every 2 s from its frame loop with the window's state (full, hidden, widget; src/host/hal_dispatch.cpp),
// and the loop keeps turning while the window is minimized. <base>.watch is one line the Hub's Running page reads (app/hub):
//   <state> <cpu %> <rss KB> <window>      state: ok, busy, hung, waste (hidden and using the CPU), memory (RSS above MEM_KB)
// It stops the app itself (SIGTERM, then SIGKILL after 3 s, one line on stderr: the journal) only when nobody can: the app is hung and its
// window was closed (its parent, AppLoad's launch.sh, is gone), or it is hung while hidden for STOP_HIDDEN_S. A hung app on screen is left
// to the user: the Hub shows it at the top with Stop / Wait, and closing its window (AppLoad's X) stops it.
// ZINC_PROC_ROOT replaces /proc (the tests on a Mac).
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

// ponytail: fixed thresholds, no configuration; the tests build with smaller ones (-D). Tune them here after a week on the tablet.
#ifndef PERIOD_S
#define PERIOD_S 5            // one wake-up every 5 s
#endif
#ifndef HUNG_S
#define HUNG_S 10             // a heartbeat older than this: not responding
#endif
#ifndef BUSY_PCT
#define BUSY_PCT 50           // busy: at least this much of one core...
#endif
#ifndef BUSY_CHECKS
#define BUSY_CHECKS 6         // ...for this many checks in a row (30 s)
#endif
#ifndef WASTE_PCT
#define WASTE_PCT 5           // hidden and using at least this much...
#endif
#ifndef WASTE_CHECKS
#define WASTE_CHECKS 60       // ...for 5 minutes: battery waste (said once on stderr)
#endif
#ifndef MEM_KB
#define MEM_KB (768 * 1024)   // the Paper Pro has 2 GB, xochitl needs its share
#endif
#ifndef STOP_HIDDEN_S
#define STOP_HIDDEN_S 600     // hung while hidden for 10 minutes: stopped
#endif

static const char* proc_root(void) { const char* r = getenv("ZINC_PROC_ROOT"); return r && *r ? r : "/proc"; }

static int read_file(const char* path, char* buf, size_t n) {
  FILE* f = fopen(path, "r");
  if (!f) return 0;
  size_t k = fread(buf, 1, n - 1, f);
  fclose(f);
  buf[k] = 0;
  return 1;
}

// /proc/<pid>/stat: ppid (field 4), utime + stime (fields 14, 15) in clock ticks; the name in parentheses may hold spaces
static int read_stat(int pid, long* ppid, unsigned long long* ticks) {
  char path[256], buf[1024];
  snprintf(path, sizeof path, "%s/%d/stat", proc_root(), pid);
  if (!read_file(path, buf, sizeof buf)) return 0;
  char* p = strrchr(buf, ')');
  if (!p) return 0;
  char state;
  unsigned long long ut = 0, st = 0;
  if (sscanf(p + 2, "%c %ld %*d %*d %*d %*d %*u %*u %*u %*u %*u %llu %llu", &state, ppid, &ut, &st) != 4) return 0;
  *ticks = ut + st;
  return 1;
}

static long read_rss_kb(int pid) {
  char path[256], buf[4096];
  snprintf(path, sizeof path, "%s/%d/status", proc_root(), pid);
  if (!read_file(path, buf, sizeof buf)) return 0;
  char* p = strstr(buf, "VmRSS:");
  return p ? strtol(p + 6, NULL, 10) : 0;
}

// Seconds the tablet slept since it started: CLOCK_BOOTTIME counts them, CLOCK_MONOTONIC does not. The tests write it in
// <ZINC_PROC_ROOT>/slept (they cannot put the machine to sleep).
static double slept_s(void) {
  if (getenv("ZINC_PROC_ROOT")) { char path[256], buf[32]; snprintf(path, sizeof path, "%s/slept", proc_root()); return read_file(path, buf, sizeof buf) ? atof(buf) : 0; }
#ifdef CLOCK_BOOTTIME
  struct timespec b, m; clock_gettime(CLOCK_BOOTTIME, &b); clock_gettime(CLOCK_MONOTONIC, &m);
  return (b.tv_sec - m.tv_sec) + (b.tv_nsec - m.tv_nsec) / 1e9;
#else
  return 0;
#endif
}

static double now_s(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec + t.tv_nsec / 1e9; }

static void stop(int pid, const char* why) {
  fprintf(stderr, "zinc-watch: stopping pid %d: %s\n", pid, why);
  kill(pid, SIGTERM);
  for (int i = 0; i < 30 && getppid() == pid; i++) usleep(100000);   // the app ending reparents this one
  if (getppid() == pid) { kill(pid, SIGKILL); fprintf(stderr, "zinc-watch: pid %d did not end on SIGTERM; killed\n", pid); }
}

int main(int argc, char** argv) {
  if (argc != 2) { fprintf(stderr, "usage: zinc-watch <base>   (zinc-app starts it)\n"); return 2; }
  const int pid = (int)getppid();   // zinc-app's shell, which execs zinc: the app
  char pidf[512], beat[512], out[512], tmp[520];
  snprintf(pidf, sizeof pidf, "%s.pid", argv[1]);
  snprintf(beat, sizeof beat, "%s.beat", argv[1]);
  snprintf(out, sizeof out, "%s.watch", argv[1]);
  snprintf(tmp, sizeof tmp, "%s.tmp", out);
  const long hz = sysconf(_SC_CLK_TCK);
  long ppid0 = -1, ppid = -1;
  unsigned long long last_ticks = 0;
  double last_t = now_s(), hung_since = 0, slept = slept_s();
  int was_hung = 0;
  int busy_run = 0, waste_run = 0, waste_said = 0, mem_said = 0, first = 1;
  if (read_stat(pid, &ppid0, &last_ticks)) first = 0;   // the parent the app has now (launch.sh): another one later means its window is gone
  while (getppid() == pid) {
    sleep(PERIOD_S);
    if (getppid() != pid) break;
    unsigned long long ticks = 0;
    if (!read_stat(pid, &ppid, &ticks)) continue;
    if (ppid0 < 0) ppid0 = ppid;   // /proc not readable at start
    const double t = now_s();
    int cpu = first ? 0 : (int)((ticks - last_ticks) * 100.0 / hz / (t - last_t) + 0.5);
    first = 0; last_ticks = ticks; last_t = t;
    const long rss = read_rss_kb(pid);
    char window[16] = "full";
    struct stat bs;
    int hung = 0;
    if (stat(beat, &bs) == 0) {   // no heartbeat yet (still starting, or an engine without one): never hung
      hung = time(NULL) - bs.st_mtime > HUNG_S;
      if (read_file(beat, window, sizeof window)) window[strcspn(window, "\n ")] = 0;
      if (!window[0]) strcpy(window, "full");
    }
    // The power button: a press puts the tablet to sleep, the next wakes it. An app that was not responding before the sleep is stopped
    // on waking (the user's way out with the button); after any sleep the heartbeat is old by the time slept, so hung is judged afresh.
    const double s = slept_s();
    const int resumed = s - slept > 1;
    slept = s;
    if (resumed && was_hung) { stop(pid, "not responding, and the tablet was put to sleep and woken (power button)"); break; }
    if (resumed) { hung = 0; hung_since = 0; }
    was_hung = hung;
    const int hidden = strcmp(window, "hidden") == 0;
    busy_run = cpu >= BUSY_PCT ? busy_run + 1 : 0;
    waste_run = hidden && cpu >= WASTE_PCT ? waste_run + 1 : 0;
    hung_since = hung ? (hung_since > 0 ? hung_since : t) : 0;
    const char* state = hung ? "hung" : rss > MEM_KB ? "memory" : waste_run >= WASTE_CHECKS ? "waste" : busy_run >= BUSY_CHECKS ? "busy" : "ok";
    if (waste_run >= WASTE_CHECKS && !waste_said) { waste_said = 1; fprintf(stderr, "zinc-watch: pid %d is hidden and uses %d%% of the CPU\n", pid, cpu); }
    if (rss > MEM_KB && !mem_said) { mem_said = 1; fprintf(stderr, "zinc-watch: pid %d uses %ld MB\n", pid, rss / 1024); }
    FILE* f = fopen(tmp, "w");
    if (f) { fprintf(f, "%s %d %ld %s\n", state, cpu, rss, window); fclose(f); rename(tmp, out); }
    if (hung && ppid != ppid0) { stop(pid, "not responding and its window was closed"); break; }
    if (hung && hidden && t - hung_since >= STOP_HIDDEN_S) { stop(pid, "not responding while hidden"); break; }
  }
  // the app has ended: its files go, unless a new instance of the same app already took them (zinc-app's one instance per app)
  char buf[32] = "";
  if (!read_file(pidf, buf, sizeof buf) || atoi(buf) == pid) { unlink(pidf); unlink(beat); unlink(out); }
  return 0;
}

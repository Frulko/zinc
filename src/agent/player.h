#pragma once
// The device player (ZN-792, docs/reports/device-player-consoles-mobiles.md): the protocol of `zinc agent` served from inside the process that
// runs the programs (a console core, later Zinc Go), single-threaded and polled. No fork, no std::filesystem, no libuv: sockets, chan.cpp
// (TLS, frames, JSON) and stdio. The host calls playerPoll from its frames and its waits; a request that arrives is served there, at once
// (a pairing's J-PAKE, an install's transfer: a hitch of that frame), and the sessions that last (logs -f, top, a dev session) stay in
// `followers`, fed at each poll. ponytail: one request at a time, served inline; a thread on the consoles that have them if a hitch matters.
#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <string_view>
#include <vector>

#include "wire.h"

namespace zn::agent {

struct Player {
  // ---- what the host gives before playerOpen ----
  std::string home;   // its files: agent/agent.json, agent/clients.json, apps/<name>/ (program.zbc, resources.bin, packs/, zinc.json), logs/<name>.log
  std::string name;   // empty: <os>-<4 hex digits of its id>
  std::string os, arch, kind, osVersion, profile, engine, bind = "0.0.0.0";
  std::vector<std::string> plugins;   // the native modules linked in (zinc device refuses a program that needs another)
  int port = kPort;                   // 0: any free port (tests)
  std::string fixedCode;              // ZINC_PLAYER_CODE (tests): this pairing code instead of a random one
  /** Starts the program installed in `dir` (it replaces the one running, which the host stops first); `pid` is its run number. */
  std::function<void(const std::string& app, const std::string& dir, const std::vector<std::string>& args, const Env& env, long long pid)> run;
  std::function<void()> stop;                       // the running program ends at its next frame or wait
  std::function<bool(std::string& png)> shot;       // the frame on the screen, as PNG
  std::function<void(Obj&)> info;                   // the host's fields of `info`: memory, battery...

  // ---- its state (player.cpp) ----
  struct Follower {
    std::unique_ptr<Chan> c;
    enum Kind { Logs, Top, Dev } kind = Logs;
    std::string app;
    long long pid = 0;         // logs until that run ends (untilExit)
    long long next = 0;        // top: the time of the next sample (seconds)
  };
  int lfd = -1;
  std::string id, code, address;
  long long codeUntil = 0;
  int tries = 0;
  bool closed = false;         // three wrong codes: no pairing until newCode()
  std::string current;         // the app running, empty when none
  long long pid = 0, runs = 0, ended = 0;   // the run that runs, the last one asked for, the last one that ended
  bool replaced = false;       // the running program is being replaced: its end is not logged
  std::vector<Follower> followers;
  std::string paired;          // the name of the last workstation paired (the waiting screen says it)
};

/** Listens on bind:port; `p.port` is then the port taken. False with `err`. */
bool playerOpen(Player& p, std::string& err);
/** Serves what arrived, without waiting when nothing did. */
void playerPoll(Player& p);
/** A new pairing code (SELECT on a console), valid five minutes and three tries, for one workstation. */
void playerNewCode(Player& p);
/** True while a pairing is open (the screen shows `p.code`). */
bool playerPairing(Player& p);
/** The host started run `pid` of `app` (the one p.run asked for). */
void playerStarted(Player& p, const std::string& app, long long pid);
/** What the running program printed: its log, and the sessions that follow it. */
void playerOutput(Player& p, std::string_view bytes);
/** The running program ended with `status`: "[exited n]" in its log, the end of the sessions that waited for it. */
void playerExited(Player& p, int status);
/** Forgets every workstation (SELECT held at start). */
void playerForget(Player& p);

}  // namespace zn::agent

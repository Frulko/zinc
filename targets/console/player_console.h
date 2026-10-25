#pragma once
// The console player (ZN-792): the core waits for a workstation (`zinc device`), runs what it sends, and waits again. player_console.cpp holds
// the agent's server (src/agent/player.cpp) for core_main.cpp; the HALs reach it through zn_player_poll (end of hal_poll_input).
#include <cstddef>
#include <cstdint>
#include <string>
#include <utility>
#include <vector>

struct ZnPlayerRun {
  std::string app, dir;   // dir: the app's members (program.zbc, resources.bin, packs/default.zpk, zinc.json)
  std::vector<std::string> args;
  std::vector<std::pair<std::string, std::string>> env;
  long long pid = 0;
};

void znPlayerPoll();                                  // the network brought up, the listener opened, then what arrived served
bool znPlayerTake(ZnPlayerRun& run);                  // a program the workstation asked for
void znPlayerStarted(const ZnPlayerRun& run);         // it runs: its output is its log from here
void znPlayerOutput(const char* p, std::size_t n);    // what the running program printed
void znPlayerExited(int status);
void znPlayerNewCode();                               // SELECT on the waiting screen
std::vector<std::string> znPlayerScreen();            // the lines of the waiting screen: name, address, code, paired workstation
extern "C" int zn_player_poll(void);                  // the HALs: 1 when the running program must end

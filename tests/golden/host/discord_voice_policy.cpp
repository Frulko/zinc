// plugins/discord-voice/native/video_policy.h on its own: the key frame cadence and the DAVE member list. tests/t0/discord_call_logic.sh.
#include "video_policy.h"
#include <cstdio>

static const char* failed = nullptr;
static void check(const char* name, bool ok) { if (!ok && !failed) failed = name; }

int main() {
  // key frames: every second without a keyframe_interval, every 2 s on a capped link, the server's interval when it gives one
  check("not due after 500 ms", !keyDue(10500, 10000, 0, false));
  check("due after 1 s", keyDue(11000, 10000, 0, false));
  check("capped: not due after 1.5 s", !keyDue(11500, 10000, 0, true));
  check("capped: due after 2 s", keyDue(12000, 10000, 0, true));
  check("server interval 3 s wins", !keyDue(12999, 10000, 3000, false) && keyDue(13000, 10000, 3000, false));
  check("the very first frame is due", keyDue(1e3, -1e9, 0, false));

  // DAVE: libdave hands out the change since the last epoch. A welcome is the whole group, a later commit only who came or went.
  std::set<std::string> m;
  applyRosterChange(m, {"1", "2", "3"}, {true, true, true}, true);
  check("welcome: everyone", m.size() == 3);
  applyRosterChange(m, {"4"}, {true}, false);   // a fourth joins: 1, 2 and 3 are not in the change but must keep getting each epoch's key
  check("a join keeps the others", m.size() == 4 && m.count("1") && m.count("2") && m.count("3") && m.count("4"));
  applyRosterChange(m, {"2"}, {false}, false);  // 2 leaves: an empty signature
  check("a leave removes only them", m.size() == 3 && !m.count("2") && m.count("1") && m.count("4"));
  applyRosterChange(m, {"5", "1"}, {true, false}, false);
  check("a mixed change", m.size() == 3 && m.count("5") && !m.count("1") && m.count("3") && m.count("4"));
  applyRosterChange(m, {"9"}, {true}, true);   // a new group (our rejoin): the welcome replaces the members
  check("a new welcome replaces", m.size() == 1 && m.count("9"));

  puts(failed ? failed : "ok");
  return failed ? 1 : 0;
}

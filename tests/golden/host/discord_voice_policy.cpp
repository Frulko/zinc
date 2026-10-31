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

  // the extensions of our video packets: the native table's ids by default (transport-wide seq 5, playout-delay 6, content type 7, rid 11;
  // RTX: repaired rid 12), DISCORD_VIDEO_EXT to change them
  const std::vector<uint8_t> native = {0x51, 0, 0, 0x62, 0, 0, 0, 0x70, 1, 0xB2, '1', '0', '0', 0, 0, 0};
  check("default ext", videoExtElements(nullptr, false).bytes == native);
  std::vector<uint8_t> rtx = native; rtx[9] = 0xC2;
  check("rtx ext", videoExtElements(nullptr, true).bytes == rtx);
  check("legacy ext", videoExtElements("legacy", false).bytes == std::vector<uint8_t>({0x52, 0, 0, 10}));
  check("ext none", videoExtElements("none", false).bytes.empty());
  check("ext without rid and content type", videoExtElements("-rid,-ct", false).bytes == std::vector<uint8_t>({0x51, 0, 0, 0x62, 0, 0, 0, 0}));
  check("playout-delay as 6 only", videoExtElements("none,pd=6", false).bytes == std::vector<uint8_t>({0x62, 0, 0, 0}));
  VideoExt tw = videoExtElements("none,twcc=3,abs=2,pd=5", false);   // twcc 3 (2 bytes), abs 2 (3 bytes), playout-delay 5: 3 + 4 + 4 bytes, padded
  check("twcc and abs", tw.bytes.size() == 12 && tw.bytes[0] == 0x31 && tw.bytes[3] == 0x22 && tw.bytes[7] == 0x52 && tw.twccAt == 1 && tw.absAt == 4);
  std::vector<uint8_t> body = tw.bytes;
  tw.fill(body, 0x0102, 0x030405);
  check("twcc and abs filled", body[1] == 1 && body[2] == 2 && body[4] == 3 && body[5] == 4 && body[6] == 5);
  check("header with extension", videoRtpHeader(tw.bytes, 101, true) == std::vector<uint8_t>({0x90, 0xE5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xBE, 0xDE, 0, 3}));
  check("header without", videoRtpHeader({}, 101, false).size() == 12 && videoRtpHeader({}, 101, false)[0] == 0x80);

  puts(failed ? failed : "ok");
  return failed ? 1 : 0;
}

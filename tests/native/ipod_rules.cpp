#include <cassert>
#include <fstream>
#include "../../plugins/ipod/native/ipod_core.cpp"

int main(int argc, char** argv) {
  assert(argc == 2);
  setenv("ZINC_IPOD_NO_USB", "1", 1);
  g_log_set_always_fatal(static_cast<GLogLevelFlags>(G_LOG_FATAL_MASK | G_LOG_LEVEL_CRITICAL));
  const fs::path root = argv[1];
  for (const auto& model : {"C027", "C525", "B029"}) {
    const fs::path mp = root / model, dir = mp / "iPod_Control/Device";
    fs::create_directories(dir);
    std::ofstream(dir / "SysInfo") << "ModelNumStr: M" << model << "\nFirewireGuid: 000A27001234ABCD\n";
    std::string err;
    assert(ipod::ensureSysInfoExtended(mp.string(), err));
    std::ifstream in(dir / "SysInfoExtended");
    std::string xml((std::istreambuf_iterator<char>(in)), {});
    assert((xml.find("<key>SQLiteDB</key>\n\t<true/>") != std::string::npos) == (std::string(model) != "B029"));
    Itdb_Device* device = itdb_device_new();
    itdb_device_set_mountpoint(device, mp.c_str());
    assert(bool(itdb_device_supports_sqlite_db(device)) == (std::string(model) != "B029"));
    itdb_device_free(device);
  }
  Itdb_iTunesDB db{};
  Itdb_Track track{}; track.itdb = &db;
  const guint32 fields[] = {ITDB_SPLFIELD_SONG_NAME, ITDB_SPLFIELD_ALBUM, ITDB_SPLFIELD_ARTIST, ITDB_SPLFIELD_GENRE,
    ITDB_SPLFIELD_KIND, ITDB_SPLFIELD_COMMENT, ITDB_SPLFIELD_COMPOSER, ITDB_SPLFIELD_GROUPING, ITDB_SPLFIELD_ALBUMARTIST, ITDB_SPLFIELD_TVSHOW};
  const guint32 actions[] = {ITDB_SPLACTION_IS_STRING, ITDB_SPLACTION_IS_NOT, ITDB_SPLACTION_CONTAINS, ITDB_SPLACTION_DOES_NOT_CONTAIN,
    ITDB_SPLACTION_STARTS_WITH, ITDB_SPLACTION_DOES_NOT_START_WITH, ITDB_SPLACTION_ENDS_WITH, ITDB_SPLACTION_DOES_NOT_END_WITH};
  for (guint32 field : fields) for (guint32 action : actions) {
    Itdb_SPLRule rule{}; rule.field = field; rule.action = action; rule.string = const_cast<char*>("missing");
    assert(!itdb_splr_eval(&rule, &track));
  }
  track.checked = 1; track.mediatype = 0x80000005u;
  track.grouping = const_cast<char*>("live"); track.filetype = const_cast<char*>("MPEG audio file");
  track.compilation = 1; track.time_modified = 1700000000;
  const ipod::Track view = ipod::toTrack(&track);
  assert(!view.checked && view.mediaBits == 2147483653.0 && view.mediaType == "podcast");
  assert(view.grouping == "live" && view.kind == "MPEG audio file" && view.compilation && view.modified == 1700000000);
  track.checked = 0; assert(ipod::toTrack(&track).checked);

  Itdb_Playlist p{}; p.itdb = &db; p.is_spl = TRUE; p.splpref.checkrules = TRUE;
  p.splpref.checklimits = TRUE; p.splpref.limittype = 0x9876; p.splpref.limitsort = 0xabc; p.splpref.limitvalue = 13;
  p.members = g_list_append(nullptr, &track);
  Itdb_SPLRule* rule = itdb_splr_new();
  rule->field = ITDB_SPLFIELD_ALBUM_RATING; rule->action = ITDB_SPLACTION_IS_GREATER_THAN;
  rule->string = g_strdup("opaque"); rule->fromvalue = 0xfedcba9876543210ULL; rule->fromdate = -1234; rule->fromunits = 19;
  rule->tovalue = 2345; rule->todate = -6789; rule->tounits = 77; rule->unk052 = 42; rule->unk056 = 56; rule->unk060 = 60;
  rule->unk064 = 64; rule->unk068 = 68; rule->reserved_int1 = 1; rule->reserved_int2 = 2;
  Itdb_SPLRule expected = *rule; expected.string = nullptr;
  p.splrules.rules = g_list_append(nullptr, rule);
  Itdb_SPLRule* unknownAction = itdb_splr_new(); unknownAction->field = ITDB_SPLFIELD_BPM;
  unknownAction->action = 0x12345678; unknownAction->fromvalue = 123; unknownAction->unk068 = 99;
  const Itdb_SPLRule expectedAction = *unknownAction;
  p.splrules.rules = g_list_append(p.splrules.rules, unknownAction);
  auto original = ipod::toRules(&p);
  assert(!original.refreshable && original.rules[0].field == "0x5a");
  std::string err;
  assert(ipod::setRules(&db, &p, original, err));
  auto* kept = static_cast<Itdb_SPLRule*>(p.splrules.rules->data);
  assert(std::string(kept->string) == "opaque");
  Itdb_SPLRule actual = *kept; actual.string = nullptr;
  assert(std::memcmp(&actual, &expected, sizeof actual) == 0);
  assert(std::memcmp(p.splrules.rules->next->data, &expectedAction, sizeof expectedAction) == 0);
  assert(p.members && p.members->data == &track && p.splpref.limittype == 0x9876 && p.splpref.limitsort == 0xabc);
  auto changed = original; changed.rules[0].text = "edit";
  assert(!ipod::setRules(&db, &p, changed, err) && p.splrules.rules->data == kept);
  changed = original; changed.rules.push_back(original.rules[0]);
  assert(!ipod::setRules(&db, &p, changed, err) && p.splrules.rules->data == kept);
  changed = original; std::swap(changed.rules[0], changed.rules[1]);
  assert(!ipod::setRules(&db, &p, changed, err) && p.splrules.rules->data == kept);
  changed = original; changed.limit.value = 14;
  assert(!ipod::setRules(&db, &p, changed, err) && p.splpref.limitvalue == 13);
  g_list_free_full(p.splrules.rules, ipod::freeRule); g_list_free(p.members);
  std::puts("ipod rules: SQLite Nano5/6, 80 null-tag cases, track bits/checked and opaque rule preservation PASS");
}

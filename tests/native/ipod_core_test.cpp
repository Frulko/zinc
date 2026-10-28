// zinc:ipod core on a fake iPod folder (no hardware, no engine): init, SysInfoExtended, add with tags and embedded
// cover, refusal when it does not fit, playlists, save and re-read, snapshot and restore, backup and restore, check
// and repair, specs and covers in pixels, backups on the computer (automatic before a session's first change, hard links for what did
// not change, the music shared and incremental). Build and run: tests/t0/ipod.sh.
#include "ipod_core.h"
#include <taglib/fileref.h>
#include <taglib/tpropertymap.h>
#include <taglib/tvariant.h>
#include <cassert>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <sys/stat.h>
namespace fs = std::filesystem;

#define CHECK(c) do { if (!(c)) { fprintf(stderr, "FAIL %s:%d %s (err: %s)\n", __FILE__, __LINE__, #c, err.c_str()); return 1; } } while (0)

static void wav(const std::string& path, int seconds) {   // 8 kHz mono 16-bit silence
  int n = 8000 * seconds * 2;
  std::ofstream f(path, std::ios::binary);
  auto u32 = [&](uint32_t v) { f.write((const char*)&v, 4); };
  auto u16 = [&](uint16_t v) { f.write((const char*)&v, 2); };
  f.write("RIFF", 4); u32(36 + n); f.write("WAVEfmt ", 8); u32(16); u16(1); u16(1); u32(8000); u32(16000); u16(2); u16(16);
  f.write("data", 4); u32(n);
  std::string z(n, '\0'); f.write(z.data(), n);
}

int main(int argc, char** argv) {
  std::string err;
  fs::path root = argc > 1 ? argv[1] : fs::temp_directory_path() / "zinc-ipod-test";
  fs::remove_all(root);
  fs::path mp = root / "Volumes" / "ZINCPOD", work = root / "work";
  fs::create_directories(mp / "iPod_Control" / "Device");
  fs::create_directories(work);
  { std::ofstream(mp / "iPod_Control" / "Device" / "SysInfo") << "ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\nvisibleBuildID: 0x02028000 (2.0.2)\n"; }
  setenv("ZINC_IPOD_ROOTS", (root / "Volumes").c_str(), 1);
  setenv("ZINC_IPOD_NO_USB", "1", 1);
  fs::path backups = root / "backups";
  setenv("ZINC_IPOD_BACKUPS", backups.c_str(), 1);

  Device pod;   // a real iPod plugged into the machine is listed too
  for (const Device& d : ipod::detect()) if (d.mountpoint == mp.string()) pod = d;
  CHECK(pod.mountpoint == mp.string() && !pod.hasDatabase && pod.connection == "disk" && pod.firmware == "2.0.2");
  printf("detect: %s, %s, %s, checksum %s\n", pod.model.c_str(), pod.generation.c_str(), pod.modelNumber.c_str(), pod.checksum.c_str());

  ipod::Library lib;
  CHECK(!lib.open(mp.string(), false, "", "", err));        // no database and no init: refused
  err.clear();
  CHECK(lib.open(mp.string(), true, "", "Zinc Pod", err));
  CHECK(fs::exists(mp / "iPod_Control" / "Device" / "SysInfoExtended"));
  {   // the synthesised file keeps the model's artwork formats (else libgpod writes no artwork at all)
    std::ifstream f(mp / "iPod_Control" / "Device" / "SysInfoExtended");
    std::string x((std::istreambuf_iterator<char>(f)), {});
    CHECK(x.find("<key>AlbumArt</key>") != std::string::npos && x.find("4C353635") != std::string::npos && x.find("000A27001234ABCD") != std::string::npos);
  }
  ipod::Device d;
  CHECK(lib.device(d, err) && d.name == "Zinc Pod" && d.hasDatabase && d.sysInfoExtended);

  // a WAV with tags and an embedded cover
  std::string song = (work / "song.wav").string();
  wav(song, 2);
  {
    TagLib::FileRef f(song.c_str());
    TagLib::PropertyMap pm; pm["TITLE"] = TagLib::String("Hello"); pm["ARTIST"] = TagLib::String("Zinc"); pm["ALBUM"] = TagLib::String("Tests");
    pm["TRACKNUMBER"] = TagLib::String("3/12"); pm["ALBUMARTIST"] = TagLib::String("Various");
    f.setProperties(pm);
    std::ifstream png(argc > 2 ? argv[2] : "", std::ios::binary);
    std::string data((std::istreambuf_iterator<char>(png)), {});
    if (!data.empty()) {
      TagLib::VariantMap pic; pic["data"] = TagLib::ByteVector(data.data(), (unsigned)data.size()); pic["mimeType"] = TagLib::String("image/png"); pic["pictureType"] = TagLib::String("Front Cover");
      f.setComplexProperties("PICTURE", {pic});
    }
    f.save();
  }
  std::string bad = (work / "x.flac").string();
  { std::ofstream(bad) << "fLaC"; }
  std::string junk = (work / "junk.mp3").string(), notImage = (work / "cover.txt").string();
  { std::ofstream(junk) << "this is not audio"; std::ofstream(notImage) << "not an image"; }

  ipod::TrackInput a; a.file = song;
  ipod::TrackInput b; b.file = bad;
  ipod::TrackInput c; c.file = song; c.title = std::string("Override"); c.rating = 4; c.mediaType = std::string("podcast");
  ipod::TrackInput j; j.file = junk;
  ipod::TrackInput k; k.file = song; k.artworkFile = notImage;
  auto res = lib.add({a, b, c, j, k}, "Mix", nullptr, err);
  CHECK(err.empty() && res.size() == 5 && res[0].error.empty() && !res[1].error.empty() && res[2].error.empty() && !res[3].error.empty() && !res[4].error.empty());
  printf("junk refused: %s\nbad cover refused: %s\n", res[3].error.c_str(), res[4].error.c_str());
  printf("flac refused: %s\n", res[1].error.c_str());

  auto ts = lib.tracks();
  CHECK(ts.size() == 2);
  CHECK(ts[0].title == "Hello" && ts[0].artist == "Zinc" && ts[0].albumArtist == "Various" && ts[0].trackNr == 3 && ts[0].tracks == 12);
  CHECK(ts[0].durationMs >= 1900 && ts[0].durationMs <= 2100 && fs::exists(mp / ts[0].path));
  CHECK(ts[1].title == "Override" && ts[1].rating == 4 && ts[1].mediaType == "podcast");
  if (argc > 2) CHECK(ts[0].artwork);

  auto pls = lib.playlists();
  std::string mix;
  bool podcasts = false;
  for (auto& p : pls) { if (p.name == "Mix") { mix = p.id; CHECK(p.trackIds.size() == 2); } podcasts |= p.podcasts && p.trackIds.size() == 1; }
  CHECK(!mix.empty() && podcasts);
  CHECK(lib.setPlaylistTracks(mix, {ts[1].id, ts[0].id}, err));
  std::string fav;
  CHECK(lib.createPlaylist("Fav", fav, err) && lib.renamePlaylist(fav, "Favourites", err));
  CHECK(lib.save(nullptr, err));

  // refused before copying anything when the batch does not fit
  setenv("ZINC_IPOD_FREE_BYTES", "1000000", 1);
  size_t files = 0;
  for (auto& e : fs::recursive_directory_iterator(mp / "iPod_Control" / "Music")) files += e.is_regular_file();
  err.clear();
  auto full = lib.add({a}, "", nullptr, err);
  size_t files2 = 0;
  for (auto& e : fs::recursive_directory_iterator(mp / "iPod_Control" / "Music")) files2 += e.is_regular_file();
  CHECK(full.empty() && err.find("not enough space") != std::string::npos && files == files2);
  printf("full: %s\n", err.c_str());
  err.clear();
  unsetenv("ZINC_IPOD_FREE_BYTES");

  // re-read from disk
  CHECK(lib.open(mp.string(), false, "", "", err));
  CHECK(lib.tracks().size() == 2);
  bool ordered = false;
  for (auto& p : lib.playlists()) if (p.name == "Mix") ordered = p.trackIds.size() == 2 && p.trackIds[0] == ts[1].id;
  CHECK(ordered);
  if (argc > 2) { bool had = false; CHECK(lib.saveArtwork(ts[0].id, (work / "cover-out.png").string(), had, err) && had && fs::file_size(work / "cover-out.png") > 100); }

  // specs and covers
  auto sp = lib.specs();
  auto spec = [&](const char* g, const char* n) { for (auto& i : sp) if (i.group == g && i.name == n) return i.value; return std::string(); };
  CHECK(spec("Library", "Tracks") == "2" && spec("iPod", "Firmware") == "2.0.2" && spec("iPod", "Serial number") == "8K1234ABCDE" && !spec("Storage", "Free").empty());
  CHECK(spec("SysInfoExtended", "Source").find("Zinc") != std::string::npos && !spec("SysInfoExtended", "FireWireGUID").empty());
  bool formats = false;
  for (auto& i : sp) formats |= i.group == "Artwork" && i.name.rfind("Cover ", 0) == 0;
  CHECK(formats);
  printf("specs: %zu lines, e.g. %s = %s\n", sp.size(), sp[0].name.c_str(), sp[0].value.c_str());
  if (argc > 2) {
    ipod::Picture pic;
    CHECK(lib.artwork(ts[0].id, 100, pic, err) && pic.width > 0 && pic.width <= 128 && pic.rgba.size() == (size_t)pic.width * pic.height * 4);
    printf("artwork: %dx%d\n", pic.width, pic.height);
  }
  ipod::Picture none;
  CHECK(!lib.artwork("ffffffffffffffff", 100, none, err) && none.width == 0);
  err.clear();

  // restore points: the first change of the first session backed the empty database up; this session's first change backs up the
  // two tracks; a restore puts them back
  auto snaps0 = lib.snapshots();
  CHECK(snaps0.size() == 1);
  CHECK(lib.remove({ts[0].id}, err) && lib.tracks().size() == 1);
  auto snaps = lib.snapshots();
  CHECK(snaps.size() == 2 && ipod::backups("").size() == 2 && ipod::backups("")[0].auto_ && ipod::backups("")[0].tracks == 2);
  CHECK(lib.restoreSnapshot(snaps[0].id, nullptr, err) && lib.tracks().size() == 2);
  CHECK(lib.snapshots().size() == 3);   // the restore backed up what it replaced

  // check: the file of the removed track is gone (missing); a stray file is an orphan; repair fixes both
  { std::ofstream(mp / "iPod_Control" / "Music" / "F00" / "STRAY.mp3") << "x"; }
  auto ck = lib.check();
  CHECK(ck.missing.size() == 1 && ck.orphans.size() == 1);
  ipod::Check after;
  CHECK(lib.repair(after, nullptr, err) && after.missing.empty() && after.orphans.empty() && lib.tracks().size() == 1);

  // backup with the music (into <dir>/<serial>/, the music shared beside it), again (unchanged files are hard links), then wipe the
  // database and a music file and restore
  std::string folder, folder2;
  CHECK(lib.backup((work / "backups").string(), true, folder, nullptr, err) && fs::exists(fs::path(folder) / "iPod_Control" / "iTunes" / "iTunesDB"));
  CHECK(fs::path(folder).parent_path() == work / "backups" / "8K1234ABCDE" && fs::exists(fs::path(folder).parent_path() / "Music"));
  CHECK(lib.backup((work / "backups").string(), true, folder2, nullptr, err) && folder2 != folder);
  struct stat s1, s2;
  CHECK(stat((fs::path(folder) / "iPod_Control" / "iTunes" / "iTunesDB").c_str(), &s1) == 0 && stat((fs::path(folder2) / "iPod_Control" / "iTunes" / "iTunesDB").c_str(), &s2) == 0 && s1.st_ino == s2.st_ino);
  auto listed = ipod::backups((work / "backups").string());
  CHECK(listed.size() == 2 && listed[0].music && !listed[0].auto_ && listed[0].serial == "8K1234ABCDE" && listed[0].tracks == 1);
  std::string kept = (mp / lib.tracks()[0].path).string();
  lib.close();
  fs::remove(mp / "iPod_Control" / "iTunes" / "iTunesDB");
  fs::remove(kept);
  CHECK(ipod::restoreBackup(folder2, mp.string(), nullptr, err));
  CHECK(lib.open(mp.string(), false, "", "", err) && lib.tracks().size() == 1 && fs::exists(kept));

  std::string plist = ipod::sysInfoExtendedPlist("8K1234", "000A27001234ABCD", "B029", 0, "");
  CHECK(plist.find("<key>FireWireGUID</key>") != std::string::npos);
  printf("ipod core: ok\n");
  return 0;
}

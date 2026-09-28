// zinc:fs — POSIX files (SPIFFS mounted at /zinc on esp32).
#pragma once
namespace zrt { namespace fs {
struct Stat : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE50;
  double size = 0, mtimeMs = 0, atimeMs = 0, ctimeMs = 0;
  int32_t mode = 0;
  bool isFile = false, isDirectory = false, isSymlink = false;
  Stat() {}
  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID; }
  void zrt_fields(StrBuilder& sb, bool& first) const override {
    json_field(sb, first, "size", size); json_field(sb, first, "mtimeMs", mtimeMs); json_field(sb, first, "atimeMs", atimeMs);
    json_field(sb, first, "ctimeMs", ctimeMs); json_field(sb, first, "mode", mode); json_field(sb, first, "isFile", isFile);
    json_field(sb, first, "isDirectory", isDirectory); json_field(sb, first, "isSymlink", isSymlink);
  }
  void zrt_json(StrBuilder& sb) const override { sb.ch('{'); bool first = true; zrt_fields(sb, first); sb.ch('}'); }
};
struct DirEntry : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE51;
  String name;
  bool isFile = false, isDirectory = false, isSymlink = false;
  DirEntry() {}
  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID; }
  void zrt_fields(StrBuilder& sb, bool& first) const override {
    json_field(sb, first, "name", name); json_field(sb, first, "isFile", isFile); json_field(sb, first, "isDirectory", isDirectory); json_field(sb, first, "isSymlink", isSymlink);
  }
  void zrt_json(StrBuilder& sb) const override { sb.ch('{'); bool first = true; zrt_fields(sb, first); sb.ch('}'); }
};
String readText(const String& path);
void writeText(const String& path, const String& data);
void appendText(const String& path, const String& data);
bool exists(const String& path);
Array<String> list(const String& dir);
bool remove(const String& path, bool recursive = false);
bool mkdir(const String& path, bool recursive = false);
Array<uint8_t> readBytes(const String& path);
void writeBytes(const String& path, const Array<uint8_t>& data);
Ref<Stat> stat(const String& path);
Ref<Stat> lstat(const String& path);
Array<Ref<DirEntry>> readDir(const String& dir);
void rename(const String& from, const String& to);
void copyFile(const String& from, const String& to);
String realpath(const String& path);
String mkdtemp(const String& prefix);
String tmpdir();
void symlink(const String& target, const String& path);
String readlink(const String& path);
void chmod(const String& path, int32_t mode);
int32_t watch(const String& path, Fn<void(String, String)> cb);
void unwatch(int32_t id);
}}

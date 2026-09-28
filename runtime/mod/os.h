// zinc:os — machine information (POSIX hosts), like Node's os module.
#pragma once
namespace zrt { namespace os {
struct CpuInfo : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE60;
  String model;
  double speed = 0;
  CpuInfo() {}
  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID; }
  void zrt_fields(StrBuilder& sb, bool& first) const override { json_field(sb, first, "model", model); json_field(sb, first, "speed", speed); }
  void zrt_json(StrBuilder& sb) const override { sb.ch('{'); bool first = true; zrt_fields(sb, first); sb.ch('}'); }
};
struct NetworkInterface : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE61;
  String name, address, netmask, family, mac;
  bool internal = false;
  NetworkInterface() {}
  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID; }
  void zrt_fields(StrBuilder& sb, bool& first) const override {
    json_field(sb, first, "name", name); json_field(sb, first, "address", address); json_field(sb, first, "netmask", netmask);
    json_field(sb, first, "family", family); json_field(sb, first, "mac", mac); json_field(sb, first, "internal", internal);
  }
  void zrt_json(StrBuilder& sb) const override { sb.ch('{'); bool first = true; zrt_fields(sb, first); sb.ch('}'); }
};
struct UserInfo : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE62;
  String username, shell, homedir;
  int32_t uid = 0, gid = 0;
  UserInfo() {}
  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID; }
  void zrt_fields(StrBuilder& sb, bool& first) const override {
    json_field(sb, first, "username", username); json_field(sb, first, "uid", uid); json_field(sb, first, "gid", gid);
    json_field(sb, first, "shell", shell); json_field(sb, first, "homedir", homedir);
  }
  void zrt_json(StrBuilder& sb) const override { sb.ch('{'); bool first = true; zrt_fields(sb, first); sb.ch('}'); }
};
String hostname();
String homedir();
String tmpdir();
String arch();
String type();
String release();
double uptime();
Array<double> loadavg();
double totalmem();
double freemem();
Array<Ref<CpuInfo>> cpus();
int32_t availableParallelism();
Array<Ref<NetworkInterface>> networkInterfaces();
Ref<UserInfo> userInfo();
}}

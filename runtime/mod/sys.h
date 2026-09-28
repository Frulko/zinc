// zinc:sys — process, clock, runtime statistics, bytes, signals, stdin.
#pragma once
namespace zrt { namespace sys {
Array<String> args();
String env(const String& name);
[[noreturn]] void exit(int32_t code);
String platform();
double clock();
int32_t liveObjects();
int32_t allocations();
Array<uint8_t> randomBytes(int32_t n);
Array<uint8_t> utf8Encode(const String& s);
String utf8Decode(const Array<uint8_t>& b);
void onSignal(const String& name, Fn<void()> cb);
bool kill(int32_t pid, const String& name);
int32_t pid();
String cwd();
bool chdir(const String& dir);
void setEnv(const String& name, const String& value);
void unsetEnv(const String& name);
Array<String> envKeys();
bool isatty(int32_t fd);
void write(const String& s);
void writeErr(const String& s);
void onStdin(Fn<void(String)> cb);
}}

// zinc:sys — process, clock and runtime statistics.
#pragma once
namespace zrt { namespace sys {
Array<String> args();
String env(const String& name);
[[noreturn]] void exit(int32_t code);
String platform();
double clock();
int32_t liveObjects();
int32_t allocations();
}}

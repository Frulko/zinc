// zinc:fs — POSIX files (LittleFS on esp32).
#pragma once
namespace zrt { namespace fs {
String readText(const String& path);
void writeText(const String& path, const String& data);
void appendText(const String& path, const String& data);
bool exists(const String& path);
Array<String> list(const String& dir);
bool remove(const String& path);
bool mkdir(const String& path);
}}

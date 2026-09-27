// zinc:assets — files embedded at build time (zinc_assets.cpp, generated), disk override in development.
#pragma once
namespace zrt { namespace assets {
String readText(const String& name);
Array<uint8_t> readBytes(const String& name);
bool exists(const String& name);
Array<String> list();
}}

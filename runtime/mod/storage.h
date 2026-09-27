// zinc:storage — persistent key/value (file on hosts, NVS on esp32).
#pragma once
namespace zrt { namespace storage {
String get(const String& key);
void set(const String& key, const String& value);
void remove(const String& key);
Array<String> keys();
}}

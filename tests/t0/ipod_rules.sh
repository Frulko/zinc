#!/bin/sh
# Native metadata/rules on temporary fake folders; no device, USB, audio or engine run.
set -eu
cd "$(dirname "$0")/../.."
deps="glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0"
pkg-config --exists $deps 2>/dev/null || { echo "needs existing $deps"; exit 77; }
B=$(mktemp -d); trap 'rm -rf "$B"' EXIT HUP INT TERM
P=plugins/ipod
export ZINC_IPOD_NO_USB=1
"${ZINC:-build/zinc}" native-gen "$P/native/ipod.spec.ts" "$B" >/dev/null
if [ "$(uname -s)" = Darwin ]; then
  xml="-iwithsysroot /usr/include/libxml2"; link="-Wl,-dead_strip -lxml2 -lsqlite3 -lz -framework AudioToolbox -framework CoreFoundation -framework IOKit"
else
  deps="$deps libxml-2.0 sqlite3 zlib"; xml=; link="-Wl,--gc-sections"
  pkg-config --exists $deps 2>/dev/null || { echo "needs existing $deps"; exit 77; }
fi
inc="-I$B -I$P/vendor/libgpod -I$P/vendor/shim -I$P/vendor/hashab -I$P/native -isystem third_party/stb -Ithird_party/xxhash -Iruntime -Iruntime/include -Iinclude -DHAVE_CONFIG_H $xml $(pkg-config --cflags $deps)"
for f in itdb_playlist itdb_device itdb_track itdb_sysinfo_extended_parser itdb_plist itdb_itunesdb itdb_tzinfo; do
  cc -O1 -w -ffunction-sections -fdata-sections $inc -c "$P/vendor/libgpod/$f.c" -o "$B/$f.o"
done
cc -O1 -Wall -Wextra -Werror -ffunction-sections -fdata-sections $inc -c "$P/native/ipod_sysinfo.c" -o "$B/ipod_sysinfo.o"
c++ -std=c++17 -O1 -Wall -Wextra -Werror -Wno-unused-function -fno-exceptions -fno-rtti -ffunction-sections -fdata-sections $inc -c tests/native/ipod_rules.cpp -o "$B/test.o"
c++ $link "$B"/*.o $(pkg-config --libs $deps) -o "$B/test"
timeout 10 "$B/test" "$B/fake-pods"

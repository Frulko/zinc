#!/bin/sh
# zinc:ipod core (plugins/ipod/native/ipod_core.cpp over the vendored libgpod, the gdk-pixbuf shim and hashab) on a
# fake iPod folder: init, SysInfoExtended with the model's artwork formats, add with tags and cover, space refusal,
# playlists, save and re-read, snapshot restore, check and repair, backup and restore. No iPod, no engine.
set -eu
cd "$(dirname "$0")/../.."
deps="glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0"
pkg-config --exists $deps 2>/dev/null || { echo "skipped: needs $deps (brew install glib libplist taglib libusb)"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
P=plugins/ipod
"${ZINC:-build/zinc}" native-gen $P/native/ipod.spec.ts "$tmp" >/dev/null   # the record structs the core uses
if [ "$(uname -s)" = Darwin ]; then xml="-iwithsysroot /usr/include/libxml2"; xlibs="-lxml2 -lsqlite3 -lz -framework AudioToolbox -framework CoreFoundation -framework IOKit"
else deps="$deps libxml-2.0 sqlite3 zlib"; xml=; xlibs=; fi
cp=$P/vendor/chromaprint/src
inc="-I$P/vendor/libgpod -I$P/vendor/shim -I$P/vendor/hashab -I$P/native -Ithird_party/stb -Ithird_party/xxhash -I$cp -I$cp/3rdparty/kissfft -DHAVE_CONFIG_H $xml $(pkg-config --cflags $deps)"
for f in $P/vendor/libgpod/*.c $P/vendor/shim/*.c $P/vendor/hashab/*.c $P/vendor/hashab/data/data.c $P/native/ipod_sysinfo.c $cp/3rdparty/kissfft/kiss_fft.c $cp/3rdparty/kissfft/kiss_fftr.c; do
  cc -c -O1 -w $inc "$f" -o "$tmp/$(echo "$f" | tr / _).o" &
done
for f in $cp/*.cpp $cp/utils/base64.cpp; do c++ -std=c++17 -O1 -w $inc -c "$f" -o "$tmp/$(echo "$f" | tr / _).o" & done
wait
cxx="-std=c++17 -O1 -w -I$tmp -Iruntime -Iruntime/include -Iinclude"
for f in ipod_core ipod_optimise ipod_fingerprint; do c++ $cxx -fno-exceptions -fno-rtti $inc -c $P/native/$f.cpp -o "$tmp/$f.o" & done
wait
c++ $cxx $inc -c tests/native/ipod_core_test.cpp -o "$tmp/test.o"
c++ -o "$tmp/ipod_test" "$tmp"/*.o $(pkg-config --libs $deps) $xlibs
python3 - "$tmp/cover.png" <<'PY'
import struct, sys, zlib
w = h = 64
raw = b''.join(b'\0' + b''.join(bytes([x * 4, y * 4, 128]) for x in range(w)) for y in range(h))
ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
open(sys.argv[1], 'wb').write(b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b''))
PY
# the duplicate finder's melodies: one as WAV, AAC and MP3 (when lame is there), another as WAV (no encoder: the score is checked alone)
python3 tests/data/ipod-demo/media.py "$tmp"
export IPOD_MELODY="$tmp/melody-a.wav" IPOD_OTHER="$tmp/melody-b.wav"
command -v afconvert >/dev/null && afconvert -f m4af -d aac -b 64000 "$tmp/melody-a.wav" "$tmp/melody-a.m4a" && export IPOD_MELODY_AAC="$tmp/melody-a.m4a"
command -v lame >/dev/null && lame --quiet -b 96 "$tmp/melody-a.wav" "$tmp/melody-a.mp3" && export IPOD_MELODY_MP3="$tmp/melody-a.mp3"
"$tmp/ipod_test" "$tmp/pod" "$tmp/cover.png"

#!/bin/sh
# Our Go Live frames, openable by a second DAVE member: libdave's encryptor and decryptor (vendored sources, OpenSSL's AES-GCM for the
# test) around the plugin's own packetiser (tests/golden/host/discord_voice_dave.cpp). Needs OpenSSL 3 headers (Homebrew); skipped without.
cd "$(dirname "$0")/../.." || exit 2
ssl=""
for d in /opt/homebrew/opt/openssl@3 /usr/local/opt/openssl@3 /usr; do [ -f "$d/include/openssl/evp.h" ] && ssl=$d && break; done
[ -n "$ssl" ] || { echo "discord_voice_dave: skipped, no OpenSSL headers"; exit 0; }
v=plugins/discord-voice/vendor
s=$v/libdave/cpp/src
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
c++ -std=c++20 -w -I"$ssl/include" -L"$ssl/lib" -I$v/mlspp/gen -I$v/mlspp/include -I$v/mlspp/lib/bytes/include -I$v/mlspp/lib/tls_syntax/include \
  -I$v/libdave/cpp/includes -I$s -Iplugins/discord-voice/native -o "$tmp/dave" tests/golden/host/discord_voice_dave.cpp \
  $s/encryptor.cpp $s/decryptor.cpp $s/cryptor_manager.cpp $s/frame_processors.cpp $s/codec_utils.cpp $s/logger.cpp $s/utils/leb128.cpp $s/version.cpp \
  $v/mlspp/lib/bytes/src/bytes.cpp -lcrypto 2>&1 | head -20
[ -x "$tmp/dave" ] || { echo "discord_voice_dave: does not build"; exit 1; }
out=$("$tmp/dave" 2>&1 | tail -1)   # libdave logs above the verdict
[ "$out" = ok ] || { echo "discord_voice_dave: $out"; exit 1; }

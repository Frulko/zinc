#!/bin/sh
# zinc:system/media on macOS: the metadata, cover, position, state and actions a program sets are read back from MPNowPlayingInfoCenter
# and MPRemoteCommandCenter (media.dump), then cleared. No window. While it runs (a second) the test is the Now Playing app, paused.
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf '%s\n' '{"name":"media-live","entry":"main.ts","permissions":["media"],"app":{"id":"dev.zinc.test.media","name":"MediaLive"}}' > "$tmp/zinc.json"
python3 - "$tmp/cover.png" <<'PY'
import struct, sys, zlib
def chunk(t, b): return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b))
raw = b''.join(b'\0' + b'\xfa\x2d\x48' * 8 for _ in range(8))
open(sys.argv[1], 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 8, 8, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
PY
cat > "$tmp/main.ts" <<'TS'
import * as system from 'zinc:system';
import { mediaSession, MediaMetadata, dump } from 'zinc:system/media';
mediaSession.setActionHandler('play', () => {});
mediaSession.setActionHandler('pause', () => {});
mediaSession.setActionHandler('seekto', () => {});
mediaSession.metadata = new MediaMetadata({ title: 'So What', artist: 'Miles Davis', album: 'Kind of Blue', artwork: [{ src: 'cover.png' }] });
mediaSession.setPositionState({ duration: 562, position: 12, playbackRate: 1 });
mediaSession.playbackState = 'paused';
const d = JSON.parse(dump());
console.log(system.backend, d.title, d.artist, d.album, d.artwork, d.duration, d.position, d.playbackRate, d.state, (d.actions as string[]).join(','));
mediaSession.metadata = null;
const e = JSON.parse(dump());
console.log('cleared', e.title === '', e.state);
TS
want='macos So What Miles Davis Kind of Blue true 562 12 0 paused play,pause,seekto
cleared true none'
got=$(cd "$tmp" && env -u ZINC_DETERMINISTIC -u ZINC_HEADLESS ZINC_BACKGROUND=1 ZINC_STEPS=0 "$ZINC" run . 2>&1)
[ "$got" = "$want" ] || { echo "macos_media: got"; printf '%s\n' "$got" | head -10; exit 1; }
echo "macos media: ok"

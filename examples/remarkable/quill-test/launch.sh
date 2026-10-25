#!/bin/sh
# Quill drawing test under the display lease (integrations/remarkable-ink/lease.c): xochitl comes back on every way out, 3 minutes at most.
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd); cd "$HERE" && sha256sum -c SHA256SUMS >/dev/null || { echo "quill-test: bundle checksum mismatch" >&2; exit 1; }
LD_LIBRARY_PATH="$HERE:/usr/lib/plugins/scenegraph" exec "$HERE/lease" launch --max 180 --vendor-sha256 3800e9f3d01f40fa3f5cc96ca49bcd982471ce5b033320f8788707520c8ddd08 "$HERE/scribble"

#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
Z=${ZINC:-build/zinc}
export ZINC_ROOT="$PWD"
"$Z" check examples/carplay
ZINC_HEADLESS=1 ZINC_FRAMES=2 "$Z" run -q tests/golden/carplay/player-input.tsx
ZINC="$Z" ZINC_CARPLAY_URL=ws://127.0.0.1:9 ZINC_HEADLESS=1 ZINC_FRAMES=24 ZINC_SHOT="${TMPDIR:-/tmp}/zinc-carplay-live-disconnected.png" examples/carplay/run --live
ZINC="$Z" ZINC_HEADLESS=1 ZINC_FRAMES=120 ZINC_SHOT="${TMPDIR:-/tmp}/zinc-carplay-offline.png" examples/carplay/run --offline
ZINC="$Z" ZINC_CARPLAY_DEBUG=1 ZINC_CARPLAY_URL=ws://127.0.0.1:9 ZINC_HEADLESS=1 ZINC_FRAMES=24 ZINC_SHOT="${TMPDIR:-/tmp}/zinc-carplay-debug.png" examples/carplay/run --live
ZINC="$Z" ZINC_INPUT="$PWD/tests/golden/carplay/player-touch.input" ZINC_CARPLAY_DEBUG=1 ZINC_CARPLAY_URL=ws://127.0.0.1:9 ZINC_HEADLESS=1 ZINC_FRAMES=24 ZINC_SHOT="${TMPDIR:-/tmp}/zinc-carplay-contacts.png" examples/carplay/run --live
ZINC_CARPLAY_MEDIA="$PWD/build/carplay/demo-media" ZINC_HEADLESS=1 "$Z" run -q tests/golden/carplay/offline.ts
# Live mode must fail usefully before opening a window when no URL is supplied.
if ZINC="$Z" ZINC_CARPLAY_URL='' examples/carplay/run --live >.logs/carplay-live-missing.log 2>&1; then
  echo 'live launch accepted an empty receiver URL' >&2; exit 1
fi
rg -q 'Set ZINC_CARPLAY_URL' .logs/carplay-live-missing.log

# Launcher defaults to background, but a user may opt into OS microphone prompts.
python3 - <<'PYTEST'
import os, pathlib, subprocess, tempfile
with tempfile.TemporaryDirectory(prefix="carplay-launcher-") as directory:
    engine = pathlib.Path(directory) / "zinc"
    engine.write_text('#!/bin/sh\nprintf "%s" "$ZINC_BACKGROUND"\n')
    engine.chmod(0o700)
    env = dict(os.environ, ZINC=str(engine), ZINC_CARPLAY_URL="ws://127.0.0.1:9")
    env.pop("ZINC_BACKGROUND", None)
    assert subprocess.check_output(["examples/carplay/run", "--live"], env=env) == b"1"
    env["ZINC_BACKGROUND"] = "0"
    assert subprocess.check_output(["examples/carplay/run", "--live"], env=env) == b"0"
PYTEST

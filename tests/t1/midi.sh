#!/bin/sh
# zinc:midi (ZN-715), with no instrument. tests/data/midi/loop.ts through virtual ports named after this run: a virtual output opened as an
# input receives every message sent byte for byte (notes, a control change, clock, start and stop, program change, pitch bend, a system
# exclusive of 303 bytes), a virtual input receives what an output opened on it sends, the handlers of notes, controls and clock fire, the port
# lists change when the ports come and go, opening a port that is not there says so. The same output from RtMidi on the machine's MIDI system
# (interpreted, and compiled with the plugin linked) and from the stand-in (midi.sim.ts) a deterministic run binds. Then examples/midi: a key
# plays a note. SKIP where the machine has no MIDI system to open (a Linux without the ALSA sequencer).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
d=tests/data/midi
ZINC_DETERMINISTIC=1 timeout 30 "$ZINC" run $d/loop.ts 2>&1 | diff - $d/loop.out >"$tmp/d" || { echo "midi: loop.ts on the stand-in: $(head -4 "$tmp/d" | cut -c1-300)"; fail=1; }
out=$(ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 ZINC_FRAMES=12 ZINC_INPUT="$PWD/$d/keys.input" timeout 30 "$ZINC" run examples/midi 2>&1)
echo "$out" | grep -q "^midi: note on 60$" && echo "$out" | grep -q "^midi: note on 67$" || { echo "midi: examples/midi played no note from the keys: $(echo "$out" | head -3)"; fail=1; }
MIDI_PORT="zinc-test-$$" ZINC_NATIVE=real timeout 50 "$ZINC" run $d/loop.ts >"$tmp/i.out" 2>&1
if grep -q "MidiInAlsa\|MidiOutAlsa\|error creating" "$tmp/i.out"; then echo "midi: no MIDI system on this machine: $(head -1 "$tmp/i.out" | cut -c1-200)"; [ $fail = 0 ] && exit 77; exit 1; fi
diff "$tmp/i.out" $d/loop.out >"$tmp/d" || { echo "midi: loop.ts on the MIDI system: $(head -4 "$tmp/d" | cut -c1-300)"; fail=1; }
ZINC_NATIVE=real "$ZINC" build $d/loop.ts -o "$tmp/loop" >"$tmp/b.log" 2>&1 || { echo "midi: loop.ts does not build: $(tail -c 300 "$tmp/b.log")"; fail=1; }
MIDI_PORT="zinc-test-$$-c" timeout 50 "$tmp/loop" 2>&1 | diff - $d/loop.out >"$tmp/d" || { echo "midi: loop.ts compiled: $(head -4 "$tmp/d" | cut -c1-300)"; fail=1; }
exit $fail

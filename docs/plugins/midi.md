# midi plugin (`zinc:midi`)

This plugin sends and receives MIDI: a keyboard or a pad controller plays your program, your program plays a
synthesizer, and through virtual ports it talks to the music software of the same machine with no cable.

- **Native.** [RtMidi](https://github.com/thestk/rtmidi) 6.0.0 (MIT) is compiled into the program:
  `plugins/midi/vendor/`. It speaks CoreMIDI on macOS and the ALSA sequencer on Linux; the plugin holds no platform
  code of its own.
- **Messages, not sound.** MIDI carries "this key went down", not audio. To hear something, send the notes to an
  instrument or to a program that makes sound (GarageBand, a software synthesizer), or play samples yourself with
  [`zinc:audio`](audio.md).
- **No instrument.** A deterministic run, `ZINC_NATIVE=sim`, or a machine that cannot build the native code gets the
  stand-in `native/midi.sim.ts`: the virtual ports work, in memory, and nothing else is ever plugged in.
- **Test.** `tests/t1/midi.sh` (virtual ports; `tests/data/midi/`). **Example.** `examples/midi`, a
  one-octave keyboard on the keys A to K.

| target | status |
|---|---|
| macos | supported, verified on x86_64 through CoreMIDI virtual ports; no instrument was attached for the test |
| linux | in the manifest (ALSA, needs `libasound2-dev` to build), not built or run yet |
| windows | not yet (RtMidi has a Windows backend, without virtual ports) |
| anywhere else, and where the native code cannot be built | the stand-in: virtual ports in memory |

```ts
import { inputs, outputs, openInput, openOutput, createOutput } from 'zinc:midi';

console.log(inputs(), outputs());                // ['Arturia KeyStep 32'] ['Arturia KeyStep 32', 'IAC Driver Bus 1']

const keys = openInput();                        // the first input; or openInput('Arturia KeyStep 32')
keys.onNote((note, velocity, channel) => { console.log(velocity > 0 ? 'down' : 'up', note); });
keys.onControl((controller, value) => { console.log('knob', controller, value); });

const synth = openOutput('IAC Driver Bus 1');
synth.noteOn(60, 100);                           // middle C, on channel 1
setTimeout(() => { synth.noteOff(60); }, 500);

const mine = createOutput('My app');             // other programs now see an input named 'My app'
mine.control(7, 90);
```

## API

Channels are 1 to 16, as on the instruments. Notes, velocities, controllers and values are 0 to 127; a value outside is
brought back in.

| API | |
|---|---|
| `inputs(): string[]` | The sources present now (keyboards, controllers, virtual outputs of other programs). |
| `outputs(): string[]` | The destinations present now (synthesizers, virtual inputs of other programs). |
| `openInput(name = ''): MidiInput` | Listens to that source (`''`: the first one). Throws an `Error` when there is none. |
| `openOutput(name = ''): MidiOutput` | Sends to that destination. Throws an `Error` when there is none. |
| `createInput(name): MidiInput` | A new port other programs can send to (it is in their outputs). |
| `createOutput(name): MidiOutput` | A new port other programs can listen to (it is in their inputs). |
| `watchPorts(cb)` | Calls `cb(inputs, outputs)` each time a port comes or goes: an instrument plugged in or out, a program opening a virtual port. Within half a second. One watcher; a program that watches does not end by itself. |
| `unwatchPorts()` | Ends it. |
| `input.onNote(cb)` | `cb(note, velocity, channel)`: a key down (velocity 1 to 127) or up (velocity 0, whichever of the two ways the instrument says it). |
| `input.onControl(cb)` | `cb(controller, value, channel)`: a knob, a fader, a pedal. |
| `input.onClock(cb)` | A tick of the sender's clock: 24 for each quarter note. |
| `input.onMessage(cb)` | Every message, as bytes: `[0x90, 60, 100]`. Program changes, pitch bend, system exclusive, start and stop arrive here. |
| `output.noteOn(note, velocity = 100, channel = 1)`, `output.noteOff(note, channel = 1)` | |
| `output.control(controller, value, channel = 1)` | |
| `output.clock()`, `output.start()`, `output.stop()` | One clock tick; the transport messages. |
| `output.send(bytes): boolean` | Any one message: `[0xC0, 5]` a program change, `[0xF0, ..., 0xF7]` a system exclusive. |
| `output.allNotesOff()` | Releases every note on every channel: call it before the program ends, a note left on sounds for ever. |
| `port.close()`, `port.isOpen`, `port.name` | Closing a created port removes it from the other programs' lists. An open input keeps the program running. |

## Notes

- **Timing.** The plugin reads the inputs on a 2 ms timer, so a received message waits up to about that for its handler. Sent messages
  leave at once. A clock you send is as steady as the timer that calls `clock()`: fine for following along, not a
  studio master clock.
- **What is filtered.** Active sensing (a byte some keyboards send three times a second) is dropped. Everything else is
  delivered, system exclusive and clock included. Up to 4096 messages wait between two reads.
- **Plugging and unplugging.** `inputs()` and `outputs()` are always the lists of the moment, and `watchPorts` says when
  they change. An open port whose instrument is unplugged stays open and silent: close it and open the instrument again
  when `watchPorts` shows it back.
- **Names.** A port is opened by its name. Two instruments of the same model have the same name on some systems: the
  first one is taken.
- **Virtual ports** exist on macOS and Linux. On macOS the IAC Driver (Audio MIDI Setup, MIDI Studio) is another way to
  link two programs, and the only one for a program that cannot pick a virtual port.
- **Sizes.** 64 ports open at once.

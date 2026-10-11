# midi

A one-octave keyboard: the keys `A S D F G H J K` play C D E F G A B C as MIDI notes, with the
[`zinc:midi`](../../docs/plugins/midi.md) plugin.

```sh
zinc run examples/midi                              # the notes leave through a virtual port, 'Zinc keys'
MIDI_OUT="IAC Driver Bus 1" zinc run examples/midi  # or go to a port of the machine (the program prints their names)
```

Zinc makes no sound here: the notes are messages. Open GarageBand, Ableton Live, a synthesizer or a MIDI monitor,
and `Zinc keys` is among its MIDI inputs. A MIDI keyboard plugged
in before the program starts lights the same keys on the screen.

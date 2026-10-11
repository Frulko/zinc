// Native side of zinc:midi: ports are handles, nothing blocks. plugins/midi/index.ts wraps them in MidiInput and MidiOutput and polls read().
// midi.host.cpp is RtMidi (CoreMIDI, ALSA); midi.sim.ts keeps the ports in memory and needs no MIDI system.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** The names of the ports present now, one per line: the inputs (sources we can listen to) or the outputs (destinations we can send to). */
  ports(input: boolean): string;
  /** Opens the port of that name ('' = the first one), or with `virtualPort` creates a port of that name that other programs see: a
   *  virtual input is a destination for them, a virtual output a source. A handle, or -1 (see error()). */
  open(input: boolean, name: string, virtualPort: boolean): i32;
  /** Why the last open() returned -1. */
  error(): string;
  /** The next message received on an input, whole (a note is 3 bytes, a clock tick 1, a system exclusive as long as it is); [] when none. */
  read(h: i32): u8[];
  /** Sends one message on an output. */
  send(h: i32, bytes: u8[]): boolean;
  close(h: i32): void;
}
export default requireNative<Spec>('Midi');

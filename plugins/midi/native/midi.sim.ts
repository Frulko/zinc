// zinc:midi without native code (a deterministic run, a machine that cannot build the plugin): the ports live in memory. A virtual output is a
// source the program can open as an input, a virtual input a destination it can open as an output, as with the real MIDI system; nothing else
// is ever plugged in. So a program and its test run with no instrument and no sound.
const kinds: i32[] = [];        // per handle: 0 closed, 1 input, 2 output
const names: string[] = [];     // the port a handle is on
const virtuals: boolean[] = [];
const queues: u8[][][] = [];    // per input handle: the messages waiting
let err: string = '';

// The names of the virtual ports of the other direction: what a program lists as inputs are the virtual outputs, and the reverse.
function present(input: boolean): string[] {
  const r: string[] = [];
  for (let h = 0; h < kinds.length; h++) if (virtuals[h] && kinds[h] === (input ? 2 : 1) && !r.includes(names[h])) r.push(names[h]);
  return r;
}

export default {
  ports(input: boolean): string { return present(input).map((n: string) => n + '\n').join(''); },
  open(input: boolean, name: string, virtualPort: boolean): i32 {
    let port = name;
    if (!virtualPort) {
      const there = present(input);
      if (name === '' && there.length > 0) port = there[0];
      if (!there.includes(port)) { err = name === '' ? `no MIDI ${input ? 'input' : 'output'} port` : `no MIDI ${input ? 'input' : 'output'} port named '${name}'`; return -1; }
    }
    kinds.push(input ? 1 : 2); names.push(port); virtuals.push(virtualPort); queues.push([]);
    return kinds.length - 1;
  },
  error(): string { return err; },
  read(h: i32): u8[] {
    if (h < 0 || h >= kinds.length || kinds[h] !== 1 || queues[h].length === 0) return [];
    const m = queues[h][0];
    queues[h].splice(0, 1);
    return m;
  },
  send(h: i32, bytes: u8[]): boolean {
    if (h < 0 || h >= kinds.length || kinds[h] !== 2 || bytes.length === 0) return false;
    // a message leaves a virtual output for the inputs opened on it, or an opened output for the virtual input of its name
    for (let i = 0; i < kinds.length; i++) if (kinds[i] === 1 && names[i] === names[h] && virtuals[i] !== virtuals[h]) queues[i].push(bytes.slice());
    return true;
  },
  close(h: i32): void { if (h >= 0 && h < kinds.length) { kinds[h] = 0; queues[h] = []; } },
};

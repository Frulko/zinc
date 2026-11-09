// zinc:appkit where AppKit does not run (Linux, Windows, the boards, a stand-in run): no host starts, so the tree is drawn as always.
export default {
  start(): boolean { return false; },
  commit(_changes: string): void {},
  dump(): string { return ''; },
  snapshot(_path: string): boolean { return false; },
  hit(_x: number, _y: number): number { return -1; },
  drive(_id: number, _action: number, _text: string, _x: number, _y: number): boolean { return false; },
  onEvent(_cb: (id: number, kind: number, text: string, a: number, b: number) => void): void {},
};

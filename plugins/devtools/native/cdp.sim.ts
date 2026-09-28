// sim: no inspector (the sim target runs on Node; use node --inspect for it).
export default {
  listen(_port: number, _cb: (client: number, msg: string) => void): boolean { return false; },
  send(_client: number, _msg: string): void {},
  num(_msg: string, _key: string): number { return 0; },
  str(_msg: string, _key: string): string { return ''; },
  clients(): number { return 0; },
  screenshot(maxW: i32, maxH: i32): string { return ''; },
  trace(_on: boolean): string { return '[]'; },
};

import N from './native/spi.spec';
/** Lists paths without contacting devices. 'sim' selects the built-in model explicitly. */
export function list(): string[] { return N.list().split('\n').filter((p: string) => p !== ''); }
export class Device {
  private handle: i32;
  constructor(handle: i32) { this.handle = handle; }
  write(data: u8[]): void { if (!N.write(this.handle, data)) throw new Error('spi: ' + N.error()); }
  transfer(data: u8[]): u8[] {
    const result = N.transfer(this.handle, data);
    if (result.length !== data.length || data.length === 0) throw new Error('spi: ' + N.error());
    return result;
  }
  close(): void { N.close(this.handle); }
}
export function open(path: string, hz: i32 = 1000000, mode: i32 = 0): Device {
  const h = N.open(path, hz, mode);
  if (h < 0) throw new Error('spi: ' + N.error());
  return new Device(h);
}

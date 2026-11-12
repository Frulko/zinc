import N from './native/i2c.spec';
/** Lists paths without contacting devices. 'sim' selects the built-in model explicitly. */
export function list(): string[] { return N.list().split('\n').filter((p: string) => p !== ''); }
export class Device {
  private handle: i32;
  constructor(handle: i32) { this.handle = handle; }
  write(data: u8[]): void { if (!N.write(this.handle, data)) throw new Error('i2c: ' + N.error()); }
  readRegister(reg: i32, count: i32): u8[] {
    const result = N.readRegister(this.handle, reg, count);
    if (result.length !== count || count <= 0) throw new Error('i2c: ' + N.error());
    return result;
  }
  close(): void { N.close(this.handle); }
}
export function open(path: string, address: i32): Device {
  const h = N.open(path, address);
  if (h < 0) throw new Error('i2c: ' + N.error());
  return new Device(h);
}
/** Every probe can affect a device. Choose a policy only after checking every device's datasheet. */
export function scan(path: string, policy: string): i32[] {
  const addresses = N.scan(path, policy);
  if (N.error() !== '') throw new Error('i2c: ' + N.error());
  return addresses;
}

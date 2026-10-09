// Small ZIP transport shared with the browser plugin. Files stay unpacked in source control.
const MAX = 32 * 1024 * 1024;
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
export function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ -1) >>> 0;
}
function safe(name: string): void {
  if (name !== 'manifest.json' && name !== 'design.zui.json' && !/^assets\/[A-Za-z0-9_-][A-Za-z0-9_./-]*\.(png|svg|ttf)$/.test(name)) throw new Error(`unsupported archive member ${name}`);
  if (name.split('/').some(p => p === '..' || p === '.' || !p)) throw new Error('unsafe archive path');
}
async function codec(data: Uint8Array, decode: boolean): Promise<Uint8Array> {
  const stream = decode ? new DecompressionStream('deflate-raw') : new CompressionStream('deflate-raw');
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length; if (size > MAX) throw new Error('ZIP member exceeds 32 MiB'); chunks.push(next.value);
    }
  } finally { await reader.cancel(); }
  return join(chunks);
}
function join(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let at = 0;
  for (const c of chunks) { result.set(c, at); at += c.length; } return result;
}
export async function zipUI(files: Map<string, Uint8Array>): Promise<Uint8Array> {
  if (files.size > 514) throw new Error('too many archive members');
  const parts: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0, total = 0;
  for (const [name, data] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    safe(name); total += data.length; if (total > MAX) throw new Error('package exceeds 32 MiB');
    const filename = encoder.encode(name); let packed = data, method = 0;
    if (!name.endsWith('.png')) {
      try { const compressed = await codec(data, false); if (compressed.length < data.length) { packed = compressed; method = 8; } } catch { /* Older plugin browsers can still export a valid stored ZIP. */ }
    }
    const crc = crc32(data), header = new Uint8Array(30 + filename.length), h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint16(8, method, true);
    h.setUint32(14, crc, true); h.setUint32(18, packed.length, true); h.setUint32(22, data.length, true); h.setUint16(26, filename.length, true); header.set(filename, 30);
    const entry = new Uint8Array(46 + filename.length), c = new DataView(entry.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(10, method, true);
    c.setUint32(16, crc, true); c.setUint32(20, packed.length, true); c.setUint32(24, data.length, true); c.setUint16(28, filename.length, true); c.setUint32(42, offset, true); entry.set(filename, 46);
    parts.push(header, packed); central.push(entry); offset += header.length + packed.length;
  }
  const directory = join(central), end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.size, true); e.setUint16(10, files.size, true); e.setUint32(12, directory.length, true); e.setUint32(16, offset, true);
  return join([...parts, directory, end]);
}
export async function unzipUI(data: Uint8Array): Promise<Map<string, Uint8Array>> {
  if (data.length < 22 || data.length > MAX + 1024 * 1024) throw new Error('invalid ZIP size');
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength), files = new Map<string, Uint8Array>();
  let end = data.length - 22;
  while (end >= Math.max(0, data.length - 65557) && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || v.getUint32(end, true) !== 0x06054b50 || end + 22 + v.getUint16(end + 20, true) !== data.length) throw new Error('missing ZIP directory');
  const count = v.getUint16(end + 10, true), start = v.getUint32(end + 16, true), length = v.getUint32(end + 12, true);
  if (count > 514 || v.getUint16(end + 4, true) || v.getUint16(end + 6, true) || count !== v.getUint16(end + 8, true) || start + length !== end) throw new Error('unsupported ZIP directory');
  let at = start, total = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || v.getUint32(at, true) !== 0x02014b50) throw new Error('invalid ZIP entry');
    const method = v.getUint16(at + 10, true), packed = v.getUint32(at + 20, true), size = v.getUint32(at + 24, true), n = v.getUint16(at + 28, true);
    const next = at + 46 + n + v.getUint16(at + 30, true) + v.getUint16(at + 32, true), local = v.getUint32(at + 42, true);
    total += size;
    if (next > end || total > MAX || (v.getUint16(at + 8, true) & 1) || ![0, 8].includes(method) || local + 30 > start) throw new Error('unsupported/oversized ZIP member');
    const name = decoder.decode(data.subarray(at + 46, at + 46 + n)); safe(name);
    if (files.has(name)) throw new Error('duplicate ZIP member');
    if (v.getUint32(local, true) !== 0x04034b50 || v.getUint16(local + 8, true) !== method || (v.getUint16(local + 6, true) & 1)) throw new Error('invalid local ZIP header');
    const localN = v.getUint16(local + 26, true), from = local + 30 + localN + v.getUint16(local + 28, true);
    if (from + packed > start || decoder.decode(data.subarray(local + 30, local + 30 + localN)) !== name) throw new Error('invalid ZIP offsets');
    const bytes = data.slice(from, from + packed), unpacked = method === 8 ? await codec(bytes, true) : bytes;
    if (unpacked.length !== size || crc32(unpacked) !== v.getUint32(at + 16, true)) throw new Error('corrupt ZIP member');
    files.set(name, unpacked); at = next;
  }
  if (at !== end) throw new Error('invalid ZIP directory length');
  return files;
}

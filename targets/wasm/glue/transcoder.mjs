import { wasiImports } from './wasi.mjs';
export const Decoder = Object.freeze({ NotTried: 0, Loading: 1, Ready: 2, Failed: 3 });
export class TextureDecoder {
  constructor(url) { this.url = url; this.state = Decoder.NotTried; this.error = ''; }
  transition(next) {
    if (!((next === Decoder.Loading && (this.state === Decoder.NotTried || this.state === Decoder.Failed)) ||
        (this.state === Decoder.Loading && (next === Decoder.Ready || next === Decoder.Failed)))) throw new Error('invalid texture decoder transition');
    this.state = next;
  }
  load() {
    if (this.state === Decoder.Ready) return Promise.resolve(this.instance);
    if (this.state === Decoder.Loading) return this.promise;
    // An image lookup after failure retries the download; concurrent lookups share the attempt.
    this.transition(Decoder.Loading);
    this.promise = (async () => {
      let memory;
      const module = await WebAssembly.compileStreaming(fetch(this.url));
      const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasiImports(module, () => memory, (_, s) => console.error(s)) });
      memory = instance.exports.memory;
      instance.exports._initialize?.();
      this.instance = instance.exports; this.error = ''; this.transition(Decoder.Ready);
      return this.instance;
    })().catch(error => { this.error = String(error.message || error); this.transition(Decoder.Failed); throw error; });
    return this.promise;
  }
  async decode(bytes) {
    const ex = await this.load(), p = ex.zn_alloc(bytes.length);
    if (!p) throw new Error('texture allocation failed');
    try {
      new Uint8Array(ex.memory.buffer, p, bytes.length).set(bytes);
      if (!ex.zn_ktx_decode(p, bytes.length)) {
        const raw = new Uint8Array(ex.memory.buffer), begin = ex.zn_ktx_error(); let end = begin;
        while (end < raw.length && raw[end]) end++;
        throw new Error(new TextDecoder().decode(raw.subarray(begin, end)));
      }
      const w = ex.zn_ktx_width(), h = ex.zn_ktx_height();
      return { w, h, pixels: new Uint8ClampedArray(ex.memory.buffer, ex.zn_ktx_pixels(), w * h * 4).slice() };
    } finally { ex.zn_ktx_reset(); ex.zn_free(p); }
  }
}

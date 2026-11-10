import { Loader, FileLoader, CompressedTexture, DataTexture, RGB_ETC1_Format, RGBAFormat, UnsignedByteType,
  LinearFilter, LinearMipmapLinearFilter, NoColorSpace, SRGBColorSpace, LinearSRGBColorSpace } from 'three';

// The native module is imported only when decoding; ordinary T3/T4 imports do not load the transcoder.
export class NativeKTX2Loader extends Loader {
  constructor(manager) { super(manager); this.etc1 = false; }

  detectSupport(renderer) {
    this.etc1 = renderer.extensions.has('WEBGL_compressed_texture_etc1');
    return this;
  }

  async _decode(buffer) {
    if (!(buffer instanceof ArrayBuffer)) throw new Error('zinc:three-pi: KTX2 parse needs an ArrayBuffer');
    if (buffer.byteLength > 64 * 1024 * 1024) throw new Error('zinc:three-pi: KTX2 input exceeds 64 MiB');
    const { default: native } = await import('./native/ktx2.spec.ts');
    const info = [], error = [];
    const output = native.transcode(new Uint8Array(buffer), this.etc1, info, error);
    if (error.length) throw new Error('zinc:three-pi: ' + new TextDecoder().decode(new Uint8Array(error)));
    const bytes = new Uint8Array(output), mipmaps = [];
    let offset = 0;
    for (let i = 4; i < info.length; i += 3) {
      const [width, height, size] = info.slice(i, i + 3);
      mipmaps.push({ width, height, data: bytes.subarray(offset, offset + size) }); offset += size;
    }
    const { width, height, data } = mipmaps[0];
    const texture = info[3] ? new CompressedTexture(mipmaps, width, height, RGB_ETC1_Format, UnsignedByteType) :
      new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
    if (!info[3]) texture.mipmaps = mipmaps;
    texture.magFilter = LinearFilter;
    // Incomplete pyramids are valid KTX2, but mip filtering would make their GL texture incomplete.
    const complete = mipmaps[mipmaps.length - 1].width === 1 && mipmaps[mipmaps.length - 1].height === 1;
    texture.minFilter = mipmaps.length > 1 && complete ? LinearMipmapLinearFilter : LinearFilter;
    texture.generateMipmaps = false; texture.flipY = false;
    texture.premultiplyAlpha = (info[2] & 1) !== 0;
    texture.colorSpace = info[1] === 1 ? (info[0] === 2 ? SRGBColorSpace : LinearSRGBColorSpace) : NoColorSpace;
    texture.userData.ktx2 = { transferFunction: info[0], colorPrimaries: info[1], flags: info[2] };
    texture.needsUpdate = true;
    return texture;
  }

  parse(buffer, onLoad, onError = console.error) { this._decode(buffer).then(onLoad, onError); }

  load(url, onLoad, onProgress, onError = console.error) {
    const key = this.path + url, manager = this.manager;
    // FileLoader owns network progress; this extra item keeps the manager pending through native decode.
    manager.itemStart(key);
    const loader = new FileLoader(manager).setPath(this.path).setResponseType('arraybuffer')
      .setRequestHeader(this.requestHeader).setWithCredentials(this.withCredentials);
    try { loader.load(url, buffer => {
      this._decode(buffer).then(texture => {
        try { if (onLoad) onLoad(texture); } finally { manager.itemEnd(key); }
      }, error => {
        try { onError(error); } finally { manager.itemError(key); manager.itemEnd(key); }
      });
    }, onProgress, error => {
      try { onError(error); } finally { manager.itemEnd(key); }
    }); } catch (error) {
      try { onError(error); } finally { manager.itemError(key); manager.itemEnd(key); }
    }
  }

  dispose() { return this; }
}

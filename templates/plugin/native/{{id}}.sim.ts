// zinc:{{id}} where its native code does not run (ZINC_NATIVE=sim, the sim profile): the same results as native/{{id}}.host.cpp, in Zinc.
function mix(h: i32, byte: i32): i32 {
  return Math.imul(h ^ byte, 16777619);
}

export default {
  fnv1a(text: string): i32 {
    let h: i32 = -2128831035;   // 2166136261, the FNV offset basis, as an i32
    for (let i = 0; i < text.length; i++) {
      let c = text.charCodeAt(i);
      if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length) { c = 0x10000 + ((c - 0xd800) << 10) + (text.charCodeAt(i + 1) - 0xdc00); i++; }   // a surrogate pair
      if (c < 0x80) h = mix(h, c);   // the UTF-8 bytes of the code point
      else if (c < 0x800) { h = mix(h, 0xc0 | (c >> 6)); h = mix(h, 0x80 | (c & 63)); }
      else if (c < 0x10000) { h = mix(h, 0xe0 | (c >> 12)); h = mix(h, 0x80 | ((c >> 6) & 63)); h = mix(h, 0x80 | (c & 63)); }
      else { h = mix(h, 0xf0 | (c >> 18)); h = mix(h, 0x80 | ((c >> 12) & 63)); h = mix(h, 0x80 | ((c >> 6) & 63)); h = mix(h, 0x80 | (c & 63)); }
    }
    return h;
  },
};

#!/bin/sh
# CPU per target (ZN-414): armhf-linux is ARMv6 without NEON (every 32-bit Pi, the first one included), armv7-linux is ARMv7-A with NEON (Pi 2 and 3 on a 32-bit OS, the CHIP),
# aarch64-linux is tuned for the Pi 3's Cortex-A53. Read from the build attributes the linker writes (.ARM.attributes), so no ARM machine is needed.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for t in armhf-linux armv7-linux aarch64-linux; do
  "$ZINC" build --target "$t" tests/bench/kernels/fib.ts -o "$tmp/$t" >"$tmp/log" 2>&1 || { echo "$t: build fails: $(tail -c 300 "$tmp/log")"; fail=1; }
done
# boards pick their variant (export, and deploy through it): rpi1 is armhf-linux, rpi2 and the CHIPs armv7-linux
for b in rpi1 rpi2 chip; do
  "$ZINC" export tests/bench/kernels/fib.ts --target "$b" -o "$tmp/x-$b" >"$tmp/log" 2>&1 || { echo "export --target $b fails: $(tail -c 300 "$tmp/log")"; fail=1; }
done
python3 - "$tmp/armhf-linux" "$tmp/armv7-linux" "$tmp/x-rpi1/fib" "$tmp/x-rpi2/fib" "$tmp/x-chip/fib" <<'PY' || fail=1
import struct, sys
def attrs(path):
    d = open(path, 'rb').read()
    shoff, = struct.unpack_from('<I', d, 0x20); shentsize, shnum, shstrndx = struct.unpack_from('<HHH', d, 0x2e)
    secs = [struct.unpack_from('<IIIIIIIIII', d, shoff + i * shentsize) for i in range(shnum)]
    names = secs[shstrndx][4]
    for s in secs:
        if d[names + s[0]:].split(b'\0', 1)[0] == b'.ARM.attributes':
            a = d[s[4]:s[4] + s[5]]
            break
    else:
        sys.exit(path + ': no .ARM.attributes')
    out, pos = {}, 1                                   # 'A', then subsections: length, vendor, then tagged sub-subsections
    def uleb(p):
        v = shift = 0
        while True:
            b = a[p]; p += 1; v |= (b & 0x7f) << shift; shift += 7
            if b < 0x80: return v, p
    while pos < len(a):
        length, = struct.unpack_from('<I', a, pos); end = pos + length
        vendor = a[pos + 4:].split(b'\0', 1)[0]; p = pos + 4 + len(vendor) + 1
        if vendor == b'aeabi':
            while p < end:
                tag, q = uleb(p); size, = struct.unpack_from('<I', a, q); sub_end = p + size; q += 4
                while tag == 1 and q < sub_end:            # File attributes
                    k, q = uleb(q)
                    if k in (4, 5, 67) or (k > 32 and k % 2 == 1): v = a[q:].split(b'\0', 1)[0].decode(); q += len(v) + 1
                    elif k == 32: v, q = uleb(q); q = a.index(b'\0', q) + 1
                    else: v, q = uleb(q)
                    out[k] = v
                p = sub_end
        pos = end
    return out
CPU_ARCH, SIMD = 6, 12                                 # Tag_CPU_arch: 10 is v7; Tag_Advanced_SIMD_arch: 0 none, 1 or more NEON
ok = True
for path, want in zip(sys.argv[1:], ('v6', 'v7', 'v6', 'v7', 'v7')):
    a = attrs(path)
    if want == 'v6' and not (a.get(CPU_ARCH, 0) < 10 and a.get(SIMD, 0) == 0): print(path, 'is not ARMv6 without NEON:', a); ok = False
    if want == 'v7' and not (a.get(CPU_ARCH, 0) == 10 and a.get(SIMD, 0) >= 1): print(path, 'is not ARMv7 with NEON:', a); ok = False
sys.exit(0 if ok else 1)
PY
[ $fail -eq 0 ] && echo "cross cpu: ok"
exit $fail

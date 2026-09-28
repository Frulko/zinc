# ffi plugin (`zinc:ffi`)

This plugin calls C functions in shared libraries, like txiki's `tjs:ffi` for scalar and string signatures.

- **Targets.** macos and linux, on x86-64 and arm64. The plugin `requires` `dynlib` and `process`. It is refused on:
  - the ESP32, PS1, PS2 and wasm;
  - rpi1 (32-bit ARM, where 64-bit arguments use register pairs);
  - rmpp (static binaries cannot `dlopen`);
  - any sandboxed target without `dlopen`.
- **Sources.** `plugins/ffi/`.
- **Test.** `tests/conformance/ffi.ts`.

```ts
import { dlopen, alloc, read, free, suffix } from 'zinc:ffi';

const libc = dlopen('');                                   // the program itself: libc and libm are there
const strlen = libc.fn('strlen', 'i64', ['string']);
console.log(strlen.call(['héllo']));                       // 6
const z = dlopen(`libz.${suffix}`);                        // system search path
const crc32 = z.fn('crc32', 'u32', ['u32', 'ptr', 'u32']);
const buf = alloc(3); /* write(buf, [1, 2, 3]) */ console.log(crc32.call([0, buf, 3])); free(buf);
```

## API

- **`dlopen(path)`** returns a `Library`. `''` opens the program itself. It throws with the text of `dlerror`.
- **`lib.fn(name, ret, args)`** returns a `ForeignFunction`:
  - Types are `void`, `i32`, `u32`, `i64`, `f64`, `f32` (as a return type only), `ptr` and `string`.
  - It throws when the symbol is missing or the signature is unsupported.
- **`fn.call(values: unknown[])`**:
  - Arguments are numbers, strings (passed as NUL-terminated copies that live for the duration of the call), booleans
    or `null`.
  - It returns a number, a string (for `string` returns) or `null` (for `void` or a NULL string).
- **Memory helpers.** `alloc(n)` (zeroed `calloc`), `free(p)`, `read(p, n): u8[]`, `write(p, u8[])` and
  `readCString(p)`. Pointers are numbers.
- **`suffix`** is `dylib` or `so`.

## How it calls without libffi

Integer-class arguments (integers and pointers) and floating-point arguments go in separate register files:

- System V x86-64 uses `rdi…r9` and `xmm0…7`.
- AAPCS64 uses `x0…x7` and `d0…d7`.

This holds whatever the argument order in the prototype. So any function with at most 6 integer-class and 8 `double`
arguments can be called through one prototype, `R f(int64 ×6, double ×8)`. The callee ignores the registers it does
not use.

## Limits

- No variadic functions (`printf`): on Apple arm64 their variadic arguments go on the stack.
- No structs passed by value.
- No `float` arguments: a callee reads a float from the low half of the register.
- No callbacks from C into Zinc.
- libffi would lift these limits.
- **Unsafe by nature.** A wrong signature or a bad pointer crashes the program. Never build a call from untrusted
  input.

## On the sim

Node cannot load C libraries. The sim knows a few libc and libm functions by name:

- `strlen`, `strcmp`, `atoi`, `atol`, `abs`, `labs`, `toupper`, `tolower`;
- `getpid`, `getenv`, `memset`;
- `sqrt`, `pow`, `floor`, `ceil`, `fabs`, `sin`, `cos`, `hypot`, `fmax`, `ldexp`.

It emulates the memory helpers over a private heap. Other symbols fail with the same `symbol not found` error as
`dlsym`.

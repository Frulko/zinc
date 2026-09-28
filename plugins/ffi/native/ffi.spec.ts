// zinc:ffi native side: dlopen / dlsym and calls through a fixed register signature (see ffi.host.cpp).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** '' opens the program itself (every symbol already linked, libc included). A handle, or -1 (see error()). */
  open(path: string): i32;
  close(lib: i32): void;
  /** Address of a symbol, 0 when missing (see error()). */
  sym(lib: i32, name: string): f64;
  error(): string;
  /** Calls fn with integer-class args (ints, pointers; strings are passed as pointers to NUL-terminated copies) in
   *  `ints` and float args in `floats`, in their own register order. `ret`: 0 void, 1 i32, 2 u32, 3 i64, 4 f64,
   *  5 pointer, 6 string (copied), 7 f32. The result is a number, or the string in text(). */
  call(fn: f64, ints: f64[], strs: string[], strAt: i32[], floats: f64[], ret: i32): f64;
  /** The string result of the last call with ret 6. */
  text(): string;
  alloc(n: i32): f64;
  free(p: f64): void;
  read(p: f64, n: i32): u8[];
  write(p: f64, data: u8[]): void;
  readCString(p: f64): string;
}
export default requireNative<Spec>('Ffi');

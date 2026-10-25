// zinc:markdown native side: md4c (vendor/md4c, MIT) parses the text and its callbacks are written as one string of records that
// index.ts reads back into a tree. Records are separated by \x1e, their six fields by \x1f: op ('B' enter block, 'b' leave block,
// 'S' enter span, 's' leave span, 'T' text), the md4c type, two integers and two strings (see markdown.host.cpp).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** The events of md4c's md_parse over `src` with the MD_FLAG_* `flags`. */
  events(src: string, flags: i32): string;
  /** `src` with the byte at `offset` (a task mark's, from the events) replaced by `mark` ('x' or ' '); `src` unchanged when out of range. */
  setByte(src: string, offset: i32, mark: string): string;
  /** md4c's version, "0.6.0". */
  version(): string;
}
export default requireNative<Spec>('Markdown');

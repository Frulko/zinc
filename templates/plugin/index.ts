// zinc:{{id}}: the plugin's API, compiled into every program that imports it.
//
//   import { greet, checksum } from 'zinc:{{id}}';
//   greet('Ada');        // 'Hello, Ada!'  in Zinc
//   checksum('hello');   // 1335831723     in C++ (native/{{id}}.host.cpp)
import N from './native/{{id}}.spec';

/** A greeting, in Zinc: most plugin code needs nothing else. */
export function greet(who: string): string {
  return 'Hello, ' + who + '!';
}

/** The 32-bit FNV-1a hash of the text's UTF-8 bytes, computed by the native part: the place for a C library, a system API or hardware. */
export function checksum(text: string): i32 {
  return N.fnv1a(text);
}

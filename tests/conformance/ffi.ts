// zinc-test: requires dynlib process
// zinc:ffi: libc / libm calls through dlopen('') (the sim emulates these few functions), strings in and out, C memory.
import { dlopen, alloc, free, read, write, readCString } from 'zinc:ffi';
import * as sys from 'zinc:sys';

const libc = dlopen('');
const strlen = libc.fn('strlen', 'i64', ['string']);
const atoi = libc.fn('atoi', 'i32', ['string']);
const abs = libc.fn('abs', 'i32', ['i32']);
const strcmp = libc.fn('strcmp', 'i32', ['string', 'string']);
const toupper = libc.fn('toupper', 'i32', ['i32']);
const getpid = libc.fn('getpid', 'i32', []);
const getenv = libc.fn('getenv', 'string', ['string']);
const pow = libc.fn('pow', 'f64', ['f64', 'f64']);
const sqrt = libc.fn('sqrt', 'f64', ['f64']);
const ldexp = libc.fn('ldexp', 'f64', ['f64', 'i32']);
const memset = libc.fn('memset', 'ptr', ['ptr', 'i32', 'i64']);

console.log(strlen.call(['héllo']), atoi.call(['-42x']), abs.call([-7]), toupper.call([97]));
const c = strcmp.call(['abc', 'abd']);
console.log(typeof c === 'number' ? c < 0 : false, strcmp.call(['same', 'same']));
console.log(getpid.call([]) === sys.pid(), pow.call([2, 10]), sqrt.call([2]), ldexp.call([1.5, 3]));
sys.setEnv('ZINC_FFI_TEST', 'from C');
console.log(getenv.call(['ZINC_FFI_TEST']), getenv.call(['ZINC_FFI_UNSET']) === null);

const p = alloc(8);
write(p, [72, 105, 0]);
console.log(readCString(p), read(p, 3));
memset.call([p, 65, 4]);
console.log(read(p, 6), readCString(p));
free(p);

try { libc.fn('no_such_symbol_zinc', 'void', []); } catch (e) { console.log(e.message); }
try { libc.fn('strlen', 'i64', ['struct']); } catch (e) { console.log(e.name, e.message); }
try { strlen.call([]); } catch (e) { console.log(e.name, e.message); }
try { dlopen('/nonexistent/libnope.so'); } catch (e) { console.log('dlopen failed', e.message.length > 0); }
libc.close();

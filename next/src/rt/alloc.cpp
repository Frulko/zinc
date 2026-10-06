// The allocator of the runtime: mimalloc serves every global `new`/`delete` (the heap objects, their vectors, the compiler's own
// data) so interpreter and compiled programs allocate the same way. Objects themselves use zn::rt::alloc below.
#include <mimalloc-new-delete.h>

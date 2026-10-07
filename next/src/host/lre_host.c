/* What libregexp asks of its embedder (third_party/quickjs-ng/libregexp.h, "must be provided by the user"). quickjs.c defines its own versions that take the JSContext
   as `opaque`; it is compiled with those three names changed (CMakeLists.txt) so that this one copy serves both. The host passes a null `opaque`; QuickJS passes its
   context, whose three answers are the originals (registered by src/qjs with zn_lre_delegate). */
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

/* QuickJS passes its context as `opaque` and has its own answers (its memory accounting, stack limit and interrupt handler): src/qjs registers them. */
static void *(*delegate_realloc)(void *, void *, size_t);
static int (*delegate_timeout)(void *);
static bool (*delegate_stack)(void *, size_t);
void zn_lre_delegate(void *(*re)(void *, void *, size_t), int (*to)(void *), bool (*st)(void *, size_t)) {
  delegate_realloc = re;
  delegate_timeout = to;
  delegate_stack = st;
}

static uintptr_t stack_top;
static unsigned long calls;
enum { kStackBudget = 4 << 20 };   /* bytes below the frame that started the match */
enum { kMaxChecks = 3000 };        /* lre_check_timeout runs about every 10000 steps: 30 million steps, then the match is abandoned */

void zn_lre_begin(void) {
  char here;
  stack_top = (uintptr_t)&here;
  calls = 0;
}

bool lre_check_stack_overflow(void *opaque, size_t alloca_size) {
  char here;
  if (opaque != NULL) return delegate_stack ? delegate_stack(opaque, alloca_size) : false;
  if (stack_top == 0) return false;
  uintptr_t used = stack_top > (uintptr_t)&here ? stack_top - (uintptr_t)&here : (uintptr_t)&here - stack_top;
  return used + alloca_size > kStackBudget;
}

int lre_check_timeout(void *opaque) {
  if (opaque != NULL) return delegate_timeout ? delegate_timeout(opaque) : 0;
  return ++calls > kMaxChecks;
}

void *lre_realloc(void *opaque, void *ptr, size_t size) {
  if (opaque != NULL && delegate_realloc) return delegate_realloc(opaque, ptr, size);
  if (size == 0) { free(ptr); return NULL; }
  return realloc(ptr, size);
}

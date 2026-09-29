#ifndef ZINC_VM_H
#define ZINC_VM_H
#include <stddef.h>
#include "zinc_abi.h"
#ifdef __cplusplus
extern "C" {
#endif

/* Embedded typed-bytecode runtime. This is not ScriptEngine's source/Dyn API.
 * Compile TS/JS using `zinc build file.ts --engine zinc-vm`, then pass app.zbc.
 * No compiler subprocess, filesystem import or generated native module is
 * installed by this API. The host explicitly registers every native capability.
 * All contexts use the same host thread (zrt globals are not thread-safe),
 * except interrupt. Destroy only after run returns and without concurrent calls.
 * A context loads one application, initializes it once, then accepts typed entries. */
typedef struct ZincVM ZincVM;
#define ZINC_VM_API_VERSION 1u
typedef struct {
  uint32_t version, size;
  size_t heap_bytes;          /* Managed heap only, minimum 4096; not total RSS. */
  size_t register_stack_bytes;/* Typed register stack, minimum 4096. */
  uint32_t timeout_ms;        /* Per run, 0 disables. */
  uint32_t jit;               /* 0 interpreter, 1 AArch64 baseline JIT. */
} ZincVMOptions;
/* NULL options selects 16 MiB heap, 8 MiB register stack, 1000 ms, interpreter.
 * Error bytes are borrowed until the next API call on the same thread. No C++
 * exception crosses this API. A failed load/initialization or execution-limit
 * failure requires destruction. Guest throws from named calls are recoverable.
 * Native descriptors survive until destroy. */
ZincVM* zinc_vm_create(const ZincVMOptions* options, ZincError* error);
const ZincHost* zinc_vm_host(ZincVM* vm);
/* Transfers module ownership on success only; its dispose runs at destruction. */
int32_t zinc_vm_register(ZincVM* vm, const ZincModule* module, ZincError* error);
int32_t zinc_vm_load(ZincVM* vm, const void* bytes, size_t length, ZincError* error);
/* Runs the entry and drains pending jobs/timers. PRINT uses process stdout. */
int32_t zinc_vm_run(ZincVM* vm, ZincError* error);
enum ZincVMExportKind { ZINC_VM_FUNCTION, ZINC_VM_GLOBAL };
typedef struct {
  const char* name;
  uint32_t kind, type; /* Function result or global value type. */
  const uint32_t* parameters;
  uint32_t parameter_count;
  uint32_t writable; /* Globals declared let/var; const bindings are read-only. */
} ZincVMExport;
/* Descriptors borrow names/signatures from the context until destroy. Lookup
 * works after load; call/get/set require successful initialization through run.
 * Exports are entry-module bindings (including aliases/reexports), or top-level
 * declarations in a script file. Only synchronous scalar signatures are exposed. */
int32_t zinc_vm_lookup(ZincVM* vm,const char* name,ZincVMExport* out,ZincError* error);
/* Arguments borrow scalar/string storage for the entry. Result string bytes
 * survive until the next call/get/set on this context. Each call gets a fresh
 * timeout and drains pending jobs/timers. Script mutation before a throw remains;
 * an ordinary guest throw permits subsequent calls. Reentrant entries forbidden. */
int32_t zinc_vm_call(ZincVM* vm,const char* name,const ZincValue* args,uint32_t count,ZincValue* out,ZincError* error);
int32_t zinc_vm_get(ZincVM* vm,const char* name,ZincValue* out,ZincError* error);
int32_t zinc_vm_set(ZincVM* vm,const char* name,const ZincValue* value,ZincError* error);
void zinc_vm_interrupt(ZincVM* vm);
size_t zinc_vm_memory_used(const ZincVM* vm);
void zinc_vm_destroy(ZincVM* vm);

#ifdef __cplusplus
}
#endif
#endif

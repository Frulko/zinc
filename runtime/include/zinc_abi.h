#ifndef ZINC_ABI_H
#define ZINC_ABI_H
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

/* In-process C ABI, v3. No C++ layout or engine-owned JSValue crosses this boundary.
 * Arguments are borrowed for the duration of invoke. Result/error bytes are borrowed
 * until the next invocation of that export (or module teardown). The adapter
 * copies them before yielding or calling the host again. Stack-local result bytes
 * are never valid. Callbacks may reenter exports; result bytes must survive until the adapter copies them.
 * Descriptors (including record fields) are immutable and remain alive, together
 * with their name strings, until the registry is destroyed.
 * BYTES are readonly value snapshots: adapters copy inputs and outputs; no alias
 * identity or native mutation is exposed. A nonempty snapshot requires nonnull data.
 * NUMBERS are readonly double-precision array snapshots borrowed during invoke,
 * with length counting elements (maximum INT32_MAX); only arguments are supported.
 * RECORD results and each of their string fields are borrowed until the next
 * invocation of that export, then copied by value before guest allocation. No
 * resource handles, nested records, cycles or alias identity cross as RECORD.
 * Scalars, scalar-field record snapshots, byte snapshots, opaque resources and scalar callbacks are implemented; record arguments and async completion are not. */
#define ZINC_ABI_VERSION 3u
enum ZincType { ZINC_VOID, ZINC_BOOL, ZINC_I32, ZINC_U32, ZINC_F32, ZINC_F64, ZINC_STRING, ZINC_RESOURCE, ZINC_CALLBACK, ZINC_BYTES, ZINC_RECORD, ZINC_NUMBERS };
typedef uint64_t ZincHandle;
/* Resource kind reserved for generated zrt::native::NativeResource adapters. */
#define ZINC_RESOURCE_ZRT 1ull
/* Engine-owned callback storage; modules cannot create or inspect this kind. */
#define ZINC_RESOURCE_CALLBACK 2ull
enum ZincStatus { ZINC_OK, ZINC_BAD_ARGUMENT, ZINC_HOST_ERROR };
typedef struct ZincValue ZincValue;
/* Immutable record snapshot. Scalar fields only, at most 256 fields. Names are
 * nonempty unique UTF-8 property names; types must be BOOL through STRING.
 * Results contain exactly field_count values, in descriptor order. A nonempty
 * record requires nonnull values; an empty record may use a null pointer. */
typedef struct { const char* name; uint32_t type; } ZincField;
typedef struct { const ZincField* fields; uint32_t field_count; } ZincRecord;
struct ZincValue {
  uint32_t type;
  uint32_t length; /* STRING: UTF-8 bytes; BYTES: byte count (maximum INT32_MAX); RECORD: field count; NUMBERS: element count. */
  union { double number; int32_t integer; uint32_t unsigned_integer; const char* string; const uint8_t* bytes; const double* numbers; const ZincValue* record; ZincHandle handle; } as;
};
typedef struct { const char* data; uint32_t length; } ZincError;
typedef int32_t (*ZincInvoke)(void* context, const ZincValue* args, uint32_t count, ZincValue* result, ZincError* error);
typedef struct {
  const char* name;
  const uint32_t* parameters;
  uint32_t parameter_count;
  uint32_t result;
  ZincInvoke invoke;
  void* context;
  const ZincRecord* result_record; /* Required exactly when result == ZINC_RECORD. */
} ZincExport;
typedef struct {
  uint32_t version;
  uint32_t size;
  const char* name; /* canonical import, e.g. zinc:math */
  const ZincExport* exports;
  uint32_t export_count;
  void* context;
  /* Called once after guest teardown, before unloading the library. No exceptions
   * or guest callbacks. Releases this instance, including descriptor storage. */
  void (*dispose)(void* context);
} ZincModule;
/* A dynamic library exports zinc_module_open with this signature. Successful
 * opens transfer a fresh instance to the registry. Failed opens clean up their
 * own partial state. The requested version must be checked before writing out. */
typedef struct {
  uint32_t version, size;
  void* context;
  /* All operations run on the owning engine thread. create consumes the owned
   * native reference only on success; get borrows it until release. Zero is null.
   * invoke RESOURCE arguments are borrowed; RESOURCE results transfer one handle
   * reference to the engine. Retain explicitly to keep an argument after invoke. */
  int32_t (*resource_create)(void*, void* value, uint64_t type, void (*destroy)(void*), ZincHandle* out, ZincError*);
  int32_t (*resource_get)(void*, ZincHandle, uint64_t type, void** out, ZincError*);
  int32_t (*resource_retain)(void*, ZincHandle, ZincError*);
  int32_t (*resource_release)(void*, ZincHandle, ZincError*);
  /* Callback arguments borrow a handle. Retain it for later calls; release it on
   * cancellation/disposal. Invoke only on the owning thread. Result/error bytes
   * remain valid until the next callback_invoke on this thread. Copy before any
   * further host call. No exceptions cross here. Scalar signatures are supported. */
  int32_t (*callback_invoke)(void*, ZincHandle, const ZincValue*, uint32_t count, uint32_t result_type, ZincValue*, ZincError*);
} ZincHost;
typedef int32_t (*ZincModuleOpen)(uint32_t version, const ZincHost* host, const ZincModule** out, ZincError* error);
#ifdef __cplusplus
}
#endif
#endif

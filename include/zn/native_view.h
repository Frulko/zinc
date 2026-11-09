/* Native views of plugins (ZN-1075, D210 layer 3): a plugin declares a component in its spec (props, events), `zinc native-gen --views` writes its
 * glue, and a native host (zinc:appkit) mounts the plugin's view for the component's kind as it mounts its own. The two plugins never link to each
 * other: the plugin registers a ZnViewClass with the engine, the host asks the engine for the class of a kind it does not know. Both declare the two
 * functions weak (a program that lays out without Yoga has no native host and does not link them). C99 and C++, nothing of the engine crosses it.
 *
 * A view is the platform's own object (an NSView* on macOS) handed over as void*, retained once by create and released by drop. Props cross as text,
 * as the host's records carry them (`a` records of lib/std/ui.ts's setNativeAttr): the glue parses each by the type the spec gives it. An event is its
 * name (`onChange`) and its arguments as text joined by US (0x1f); the host gives it to the program with the node's handle and generation, so the
 * event of a view whose node went is dropped.
 */
#ifndef ZN_NATIVE_VIEW_H
#define ZN_NATIVE_VIEW_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define ZN_VIEW_ABI 1u

/** The host's sink for a view's events: `token` is the one create got (the host's node and generation), `args` the arguments joined by 0x1f. */
typedef void (*ZnViewEmit)(uint64_t token, const char* event, const char* args);

typedef struct ZnViewClass {
  uint32_t abi;            /* ZN_VIEW_ABI */
  const char* kind;        /* the component's native kind: its spec interface's name ('LevelIndicator'); built-in kinds are lower case */
  void* (*create)(uint64_t token, ZnViewEmit emit);           /* a new view for one node, retained (+1) */
  void (*set)(void* view, const char* prop, const char* value); /* one prop as text; "" for the zero of its type */
  void (*done)(void* view);                                    /* after the props of one commit */
  void (*drop)(void* view);                                    /* releases what create returned */
} ZnViewClass;

/** Registers a class for its kind (the class stays the caller's, static); a later class of the same kind replaces it (a plugin rebuilt and loaded
 *  again). 0 on success; -1 when its ABI differs or a function is missing. */
int zn_host_register_view(const ZnViewClass* cls);
/** The class registered for `kind`, or null. */
const ZnViewClass* zn_host_view_class(const char* kind);

#ifdef __cplusplus
}
#endif

#endif

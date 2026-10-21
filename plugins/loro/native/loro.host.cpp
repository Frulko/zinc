// zinc:loro for macos and linux: the Spec of loro.spec.ts over the C ABI of plugins/loro/rust (libzinc_loro.a, built by
// cargo through the manifest's "cargo" entry). Each call passes strings and bytes as (pointer, length); a result lands in
// the crate's out buffer (zl_out) with its length as the return value, -1 when the call failed (the reason: zl_error).
#include "zinc_native_loro.h"
#include <stddef.h>
#include <string.h>

extern "C" {
typedef const uint8_t* P;
P zl_out(void);
int64_t zl_error(void);
int64_t zl_version(void);
int64_t zl_doc_new(void);
void zl_doc_free(int32_t);
int64_t zl_doc_listen(int32_t, int32_t);
int64_t zl_doc_events(int32_t);
int64_t zl_doc_next_update(int32_t);
int64_t zl_doc_peer(int32_t);
int64_t zl_doc_set_peer(int32_t, P, size_t);
int64_t zl_doc_commit(int32_t, P, size_t, P, size_t, double);
int64_t zl_doc_record_timestamp(int32_t, bool);
int64_t zl_doc_text_style(int32_t, P, size_t);
int64_t zl_doc_export(int32_t, int32_t, P, size_t);
int64_t zl_doc_import(int32_t, P, size_t);
int64_t zl_doc_frontiers(int32_t);
int64_t zl_doc_oplog_frontiers(int32_t);
int64_t zl_doc_version(int32_t, bool);
int64_t zl_doc_frontiers_to_vv(int32_t, P, size_t);
int64_t zl_doc_checkout(int32_t, P, size_t);
int64_t zl_doc_checkout_latest(int32_t);
int64_t zl_doc_detached(int32_t);
int64_t zl_doc_json(int32_t);
int64_t zl_doc_changes(int32_t);
int64_t zl_value(int32_t, P, size_t, bool);
int64_t zl_len(int32_t, P, size_t);
int64_t zl_map_set(int32_t, P, size_t, P, size_t, P, size_t);
int64_t zl_map_delete(int32_t, P, size_t, P, size_t);
int64_t zl_map_get(int32_t, P, size_t, P, size_t);
int64_t zl_map_keys(int32_t, P, size_t);
int64_t zl_map_set_container(int32_t, P, size_t, P, size_t, int32_t);
int64_t zl_list_insert(int32_t, P, size_t, uint32_t, P, size_t);
int64_t zl_list_delete(int32_t, P, size_t, uint32_t, uint32_t);
int64_t zl_list_get(int32_t, P, size_t, uint32_t);
int64_t zl_list_insert_container(int32_t, P, size_t, uint32_t, int32_t);
int64_t zl_text_insert(int32_t, P, size_t, uint32_t, P, size_t);
int64_t zl_text_delete(int32_t, P, size_t, uint32_t, uint32_t);
int64_t zl_text_mark(int32_t, P, size_t, uint32_t, uint32_t, P, size_t, P, size_t);
int64_t zl_text_unmark(int32_t, P, size_t, uint32_t, uint32_t, P, size_t);
int64_t zl_text_delta(int32_t, P, size_t);
int64_t zl_tree_create(int32_t, P, size_t, P, size_t, int32_t);
int64_t zl_tree_move(int32_t, P, size_t, P, size_t, P, size_t, int32_t);
int64_t zl_tree_delete(int32_t, P, size_t, P, size_t);
int64_t zl_tree_parent(int32_t, P, size_t, P, size_t);
int64_t zl_tree_children(int32_t, P, size_t, P, size_t);
int64_t zl_tree_nodes(int32_t, P, size_t);
int64_t zl_tree_state(int32_t, P, size_t, P, size_t);
int64_t zl_tree_meta(int32_t, P, size_t, P, size_t);
int64_t zl_tree_index(int32_t, P, size_t, P, size_t);
int64_t zl_vv_json(P, size_t);
int64_t zl_vv_encode(P, size_t);
int64_t zl_eph_new(double);
void zl_eph_free(int32_t);
int64_t zl_eph_set(int32_t, P, size_t, P, size_t);
int64_t zl_eph_delete(int32_t, P, size_t);
int64_t zl_eph_get(int32_t, P, size_t);
int64_t zl_eph_all(int32_t);
int64_t zl_eph_encode(int32_t, P, size_t);
int64_t zl_eph_apply(int32_t, P, size_t);
int64_t zl_eph_remove_outdated(int32_t);
int64_t zl_eph_events(int32_t);
int64_t zl_eph_next_update(int32_t);
}

static bool g_failed;
#define S(s) reinterpret_cast<P>((s).ptr()), static_cast<size_t>((s).bytes())
#define B(b) ((b).length() ? reinterpret_cast<P>((b).a->data) : reinterpret_cast<P>("")), static_cast<size_t>((b).length())

static int64_t chk(int64_t n) { g_failed = n < 0; return n; }
static zrt::String text(int64_t n) {
  if (chk(n) <= 0) return zrt::String::from("", 0);
  return zrt::String::from(reinterpret_cast<const char*>(zl_out()), static_cast<uint32_t>(n));
}
static zrt::Array<uint8_t> bytes(int64_t n) {
  if (chk(n) <= 0) return zrt::Array<uint8_t>::with_cap(0);
  zrt::Array<uint8_t> r = zrt::Array<uint8_t>::with_cap(static_cast<int32_t>(n));
  memcpy(r.a->data, zl_out(), static_cast<size_t>(n));
  r.a->len = static_cast<int32_t>(n);
  return r;
}

struct HostLoro : NativeLoro {
  zrt::String version() override { return text(zl_version()); }
  bool failed() override { return g_failed; }
  zrt::String error() override { int64_t n = zl_error(); return n <= 0 ? zrt::String::from("", 0) : zrt::String::from(reinterpret_cast<const char*>(zl_out()), static_cast<uint32_t>(n)); }

  int32_t docNew() override { return static_cast<int32_t>(chk(zl_doc_new())); }
  void docFree(int32_t d) override { zl_doc_free(d); g_failed = false; }
  void listen(int32_t d, int32_t what) override { chk(zl_doc_listen(d, what)); }
  zrt::String events(int32_t d) override { return text(zl_doc_events(d)); }
  zrt::Array<uint8_t> nextUpdate(int32_t d) override { return bytes(zl_doc_next_update(d)); }
  zrt::String peerId(int32_t d) override { return text(zl_doc_peer(d)); }
  void setPeerId(int32_t d, zrt::String p) override { chk(zl_doc_set_peer(d, S(p))); }
  void commit(int32_t d, zrt::String m, zrt::String o, double ts) override { chk(zl_doc_commit(d, S(m), S(o), ts)); }
  void recordTimestamp(int32_t d, bool on) override { chk(zl_doc_record_timestamp(d, on)); }
  void textStyle(int32_t d, zrt::String j) override { chk(zl_doc_text_style(d, S(j))); }
  zrt::Array<uint8_t> exportDoc(int32_t d, int32_t mode, zrt::Array<uint8_t> from) override { return bytes(zl_doc_export(d, mode, B(from))); }
  zrt::String importDoc(int32_t d, zrt::Array<uint8_t> b) override { return text(zl_doc_import(d, B(b))); }
  zrt::String frontiers(int32_t d) override { return text(zl_doc_frontiers(d)); }
  zrt::String oplogFrontiers(int32_t d) override { return text(zl_doc_oplog_frontiers(d)); }
  zrt::Array<uint8_t> versionOf(int32_t d, bool oplog) override { return bytes(zl_doc_version(d, oplog)); }
  zrt::Array<uint8_t> frontiersToVV(int32_t d, zrt::String f) override { return bytes(zl_doc_frontiers_to_vv(d, S(f))); }
  void checkout(int32_t d, zrt::String f) override { chk(zl_doc_checkout(d, S(f))); }
  void checkoutLatest(int32_t d) override { chk(zl_doc_checkout_latest(d)); }
  bool detached(int32_t d) override { return chk(zl_doc_detached(d)) == 1; }
  zrt::String toJSON(int32_t d) override { return text(zl_doc_json(d)); }
  zrt::String changes(int32_t d) override { return text(zl_doc_changes(d)); }

  zrt::String value(int32_t d, zrt::String c, bool deep) override { return text(zl_value(d, S(c), deep)); }
  int32_t len(int32_t d, zrt::String c) override { return static_cast<int32_t>(chk(zl_len(d, S(c)))); }
  void mapSet(int32_t d, zrt::String c, zrt::String k, zrt::String v) override { chk(zl_map_set(d, S(c), S(k), S(v))); }
  void mapDelete(int32_t d, zrt::String c, zrt::String k) override { chk(zl_map_delete(d, S(c), S(k))); }
  zrt::String mapGet(int32_t d, zrt::String c, zrt::String k) override { return text(zl_map_get(d, S(c), S(k))); }
  zrt::String mapKeys(int32_t d, zrt::String c) override { return text(zl_map_keys(d, S(c))); }
  zrt::String mapSetContainer(int32_t d, zrt::String c, zrt::String k, int32_t kind) override { return text(zl_map_set_container(d, S(c), S(k), kind)); }
  void listInsert(int32_t d, zrt::String c, int32_t pos, zrt::String v) override { chk(zl_list_insert(d, S(c), static_cast<uint32_t>(pos), S(v))); }
  void listDelete(int32_t d, zrt::String c, int32_t pos, int32_t n) override { chk(zl_list_delete(d, S(c), static_cast<uint32_t>(pos), static_cast<uint32_t>(n))); }
  zrt::String listGet(int32_t d, zrt::String c, int32_t pos) override { return text(zl_list_get(d, S(c), static_cast<uint32_t>(pos))); }
  zrt::String listInsertContainer(int32_t d, zrt::String c, int32_t pos, int32_t kind) override { return text(zl_list_insert_container(d, S(c), static_cast<uint32_t>(pos), kind)); }
  void textInsert(int32_t d, zrt::String c, int32_t pos, zrt::String s) override { chk(zl_text_insert(d, S(c), static_cast<uint32_t>(pos), S(s))); }
  void textDelete(int32_t d, zrt::String c, int32_t pos, int32_t n) override { chk(zl_text_delete(d, S(c), static_cast<uint32_t>(pos), static_cast<uint32_t>(n))); }
  void textMark(int32_t d, zrt::String c, int32_t a, int32_t b, zrt::String k, zrt::String v) override { chk(zl_text_mark(d, S(c), static_cast<uint32_t>(a), static_cast<uint32_t>(b), S(k), S(v))); }
  void textUnmark(int32_t d, zrt::String c, int32_t a, int32_t b, zrt::String k) override { chk(zl_text_unmark(d, S(c), static_cast<uint32_t>(a), static_cast<uint32_t>(b), S(k))); }
  zrt::String textDelta(int32_t d, zrt::String c) override { return text(zl_text_delta(d, S(c))); }
  zrt::String treeCreate(int32_t d, zrt::String c, zrt::String p, int32_t i) override { return text(zl_tree_create(d, S(c), S(p), i)); }
  void treeMove(int32_t d, zrt::String c, zrt::String n, zrt::String p, int32_t i) override { chk(zl_tree_move(d, S(c), S(n), S(p), i)); }
  void treeDelete(int32_t d, zrt::String c, zrt::String n) override { chk(zl_tree_delete(d, S(c), S(n))); }
  zrt::String treeParent(int32_t d, zrt::String c, zrt::String n) override { return text(zl_tree_parent(d, S(c), S(n))); }
  zrt::String treeChildren(int32_t d, zrt::String c, zrt::String p) override { return text(zl_tree_children(d, S(c), S(p))); }
  zrt::String treeNodes(int32_t d, zrt::String c) override { return text(zl_tree_nodes(d, S(c))); }
  int32_t treeState(int32_t d, zrt::String c, zrt::String n) override { return static_cast<int32_t>(chk(zl_tree_state(d, S(c), S(n)))); }
  zrt::String treeMeta(int32_t d, zrt::String c, zrt::String n) override { return text(zl_tree_meta(d, S(c), S(n))); }
  int32_t treeIndex(int32_t d, zrt::String c, zrt::String n) override { return static_cast<int32_t>(chk(zl_tree_index(d, S(c), S(n)))); }

  zrt::String vvJSON(zrt::Array<uint8_t> b) override { return text(zl_vv_json(B(b))); }
  zrt::Array<uint8_t> vvEncode(zrt::String j) override { return bytes(zl_vv_encode(S(j))); }

  int32_t ephNew(double t) override { return static_cast<int32_t>(chk(zl_eph_new(t))); }
  void ephFree(int32_t h) override { zl_eph_free(h); g_failed = false; }
  void ephSet(int32_t h, zrt::String k, zrt::String v) override { chk(zl_eph_set(h, S(k), S(v))); }
  void ephDelete(int32_t h, zrt::String k) override { chk(zl_eph_delete(h, S(k))); }
  zrt::String ephGet(int32_t h, zrt::String k) override { return text(zl_eph_get(h, S(k))); }
  zrt::String ephAll(int32_t h) override { return text(zl_eph_all(h)); }
  zrt::Array<uint8_t> ephEncode(int32_t h, zrt::String k) override { return bytes(zl_eph_encode(h, S(k))); }
  void ephApply(int32_t h, zrt::Array<uint8_t> b) override { chk(zl_eph_apply(h, B(b))); }
  void ephRemoveOutdated(int32_t h) override { chk(zl_eph_remove_outdated(h)); }
  zrt::String ephEvents(int32_t h) override { return text(zl_eph_events(h)); }
  zrt::Array<uint8_t> ephNextUpdate(int32_t h) override { return bytes(zl_eph_next_update(h)); }
};

NativeLoro* zinc_create_Loro() {
  static HostLoro inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}

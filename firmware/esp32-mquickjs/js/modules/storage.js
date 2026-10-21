// zinc:storage on the ESP32 (lib/modules.d.ts; main/mod_storage.c): keys and values in the NVS partition, namespace "zinc"; they survive
// a new program and a new firmware. Keys are 15 bytes at most (NVS), values 1,900 bytes.
export function get(key) { return __host_storageGet(key); }
export function set(key, value) { __host_storageSet(key, "" + value); }
export function remove(key) { __host_storageRemove(key); }
export function keys() { var k = __host_storageKeys(); return k === "" ? [] : k.split("\n"); }

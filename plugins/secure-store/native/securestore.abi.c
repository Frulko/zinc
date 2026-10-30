/* zinc:secure-store on the native ABI (include/zn/native.h, the export table of zinc_native_securestore_abi.h generated from securestore.spec.ts).
   macOS: generic passwords of the Keychain (Security.framework, kSecClassGenericPassword, service + account). Any other target has no keychain
   here yet: available() is false and every other call fails with a clear error. Never a plain-file fallback. */
#include "zinc_native_securestore_abi.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const ZnHostApi *host;

#ifdef __APPLE__
#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>

static CFStringRef str(const ZnVal *v) { return CFStringCreateWithBytes(0, (const UInt8 *)v->s.p, (CFIndex)v->s.n, kCFStringEncodingUTF8, false); }

/* the query that names one item: generic password, service, account */
static CFMutableDictionaryRef query(const ZnVal *args)
{
    CFMutableDictionaryRef q = CFDictionaryCreateMutable(0, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFStringRef service = str(&args[0]), account = str(&args[1]);
    CFDictionarySetValue(q, kSecClass, kSecClassGenericPassword);
    CFDictionarySetValue(q, kSecAttrService, service);
    CFDictionarySetValue(q, kSecAttrAccount, account);
    CFRelease(service);
    CFRelease(account);
    return q;
}

static int32_t fail(ZnCtx *cx, const char *what, OSStatus st)
{
    char msg[512], why[256] = "";
    CFStringRef s = SecCopyErrorMessageString(st, 0);
    if (s) { CFStringGetCString(s, why, sizeof why, kCFStringEncodingUTF8); CFRelease(s); }
    snprintf(msg, sizeof msg, "zinc:secure-store: the keychain refused to %s (OSStatus %d: %s)", what, (int)st, why);
    host->set_error(cx, msg);
    return ZN_ERROR;
}

int32_t zn_securestore_available(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret) { (void)self; (void)cx; (void)args; ret->i = 1; return ZN_OK; }

int32_t zn_securestore_get(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self;
    CFMutableDictionaryRef q = query(args);
    CFDictionarySetValue(q, kSecReturnData, kCFBooleanTrue);
    CFDictionarySetValue(q, kSecMatchLimit, kSecMatchLimitOne);
    CFTypeRef data = 0;
    OSStatus st = SecItemCopyMatching(q, &data);
    CFRelease(q);
    if (st == errSecItemNotFound) { ret->s = host->ret_str(cx, "", 0); return ZN_OK; }
    if (st != errSecSuccess) return fail(cx, "read a secret", st);
    CFIndex n = CFDataGetLength((CFDataRef)data);
    char *buf = (char *)malloc((size_t)n + 1);
    if (!buf) { CFRelease(data); host->set_error(cx, "zinc:secure-store: out of memory"); return ZN_ERROR; }
    buf[0] = '=';
    memcpy(buf + 1, CFDataGetBytePtr((CFDataRef)data), (size_t)n);
    ret->s = host->ret_str(cx, buf, (uint32_t)n + 1);
    free(buf);
    CFRelease(data);
    return ZN_OK;
}

int32_t zn_securestore_set(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self; (void)ret;
    CFDataRef value = CFDataCreate(0, (const UInt8 *)args[2].s.p, (CFIndex)args[2].s.n);
    CFMutableDictionaryRef q = query(args);
    CFMutableDictionaryRef change = CFDictionaryCreateMutable(0, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFDictionarySetValue(change, kSecValueData, value);
    OSStatus st = SecItemUpdate(q, change);
    if (st == errSecItemNotFound) {
        CFDictionarySetValue(q, kSecValueData, value);
        st = SecItemAdd(q, 0);
    }
    CFRelease(change);
    CFRelease(q);
    CFRelease(value);
    return st == errSecSuccess ? ZN_OK : fail(cx, "store a secret", st);
}

int32_t zn_securestore_remove(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self; (void)ret;
    CFMutableDictionaryRef q = query(args);
    OSStatus st = SecItemDelete(q);
    CFRelease(q);
    return st == errSecSuccess || st == errSecItemNotFound ? ZN_OK : fail(cx, "delete a secret", st);
}
#else
/* ponytail: Linux (libsecret) and Windows (Credential Manager) come with the cross-platform pass */
#define NO_KEYCHAIN "zinc:secure-store: this target has no system keychain (secrets are never written to a plain file)"
int32_t zn_securestore_available(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret) { (void)self; (void)cx; (void)args; ret->i = 0; return ZN_OK; }
int32_t zn_securestore_get(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret) { (void)self; (void)args; (void)ret; host->set_error(cx, NO_KEYCHAIN); return ZN_ERROR; }
int32_t zn_securestore_set(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret) { (void)self; (void)args; (void)ret; host->set_error(cx, NO_KEYCHAIN); return ZN_ERROR; }
int32_t zn_securestore_remove(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret) { (void)self; (void)args; (void)ret; host->set_error(cx, NO_KEYCHAIN); return ZN_ERROR; }
#endif

static int32_t init(const ZnHostApi *h, void **self)
{
    host = h;
    *self = 0;
    return ZN_OK;
}

static const ZnExport exports[] = {ZN_securestore_EXPORTS};

const ZnModule *zn_module_SecureStore(void)
{
    static const ZnModule m = {ZN_ABI_VERSION, sizeof(ZnModule), "SecureStore", exports, sizeof exports / sizeof exports[0], 0, 0, 0, init, 0, 0};
    return &m;
}

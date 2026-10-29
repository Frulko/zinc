// The Android screen of Sidecar: the Mac's stream (plugins/display-rmpp/stream.h's wire, as app/sidecar/mac/receiver.swift reads it) into
// the activity's Surface. The Mac reaches it on the USB cable through adb (sidecar-screen --host adb), or on the network. The picture is
// kept here in RGBA; each RECT is decoded into it (lz4 or zstd, PNG's Sub, B G R to R G B A), and at a picture's last message it is
// copied whole into the window's next buffer and posted by the presenter thread, so the stream never waits for the display's vsync.
#include <jni.h>
#include <android/native_window_jni.h>
#include <android/log.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <pthread.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <stdio.h>
#include <sys/sysinfo.h>
#include "lz4.h"
#include "zstd.h"

#define LOG(...) __android_log_print(ANDROID_LOG_INFO, "sidecar", __VA_ARGS__)
#define PORT 7710

static int W, H;
static uint32_t *fb;                       // the picture, R G B A bytes, W x H
static ANativeWindow *win;                 // the Surface while it lives (under winLock)
static pthread_mutex_t winLock = PTHREAD_MUTEX_INITIALIZER, wire = PTHREAD_MUTEX_INITIALIZER;
// picLock: the picture between two whole pictures (held by the stream thread from a picture's first message to its last, by the presenter
// while it copies); the presenter takes the newest whole picture (pending), one wait for the display at a time
static pthread_mutex_t picLock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t ready = PTHREAD_COND_INITIALIZER;
static int pending; static uint32_t pendingLast, pendingDecode;
static volatile int client = -1, pictures;
static int32_t acked;
static char name[256] = "Android";   // the device's name, percent-encoded (the hello's +name:, the Mac's name for the screen)

static uint32_t now_us(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return (uint32_t)(t.tv_sec * 1000000ull + t.tv_nsec / 1000); }

// the screen's answers: 16 bytes [u8 kind][u8 type][u16 id][i32 a][i32 b][i32 c], little-endian as this CPU
static void send16(uint8_t kind, uint8_t type, int32_t a, int32_t b, int32_t c, int ack) {
    pthread_mutex_lock(&wire);
    if (client >= 0) {
        uint8_t m[16] = {kind, type};
        if (ack) a = ++acked;
        memcpy(m + 4, &a, 4); memcpy(m + 8, &b, 4); memcpy(m + 12, &c, 4);
        send(client, m, 16, MSG_NOSIGNAL);
    }
    pthread_mutex_unlock(&wire);
}
static int readFull(int c, void *p, size_t n) {
    size_t got = 0;
    while (got < n) { ssize_t r = read(c, (uint8_t *)p + got, n - got); if (r <= 0) return 0; got += (size_t)r; }
    return 1;
}
static int skip(int c, size_t n) {
    uint8_t b[16384];
    while (n > 0) { size_t k = n < sizeof b ? n : sizeof b; if (!readFull(c, b, k)) return 0; n -= k; }
    return 1;
}

static uint8_t *plain; static size_t plainCap;
static ZSTD_DCtx *dctx;
/** One RECT's B G R rows (compressed or not, Sub-filtered or not) into the picture. */
static int decodeRect(const uint8_t *data, size_t len, int x, int y, int w, int h, int codec, int sub) {
    size_t stride = (size_t)w * 3, raw = stride * h;
    const uint8_t *src = data;
    if (codec) {
        if (plainCap < raw) { free(plain); plain = malloc(raw); plainCap = raw; }
        if (codec == 1) { if (LZ4_decompress_safe((const char *)data, (char *)plain, (int)len, (int)raw) != (int)raw) return 0; }
        else { if (!dctx) dctx = ZSTD_createDCtx(); if (ZSTD_decompressDCtx(dctx, plain, raw, data, len) != raw) return 0; }
        src = plain;
    } else if (len < raw) return 0;
    for (int r = 0; r < h; r++) {
        const uint8_t *s = src + r * stride;
        uint8_t *d = (uint8_t *)(fb + (size_t)(y + r) * W + x);
        uint8_t b = 0, g = 0, rr = 0;
        for (int i = 0; i < w; i++) {
            if (sub) { b += s[i * 3]; g += s[i * 3 + 1]; rr += s[i * 3 + 2]; } else { b = s[i * 3]; g = s[i * 3 + 1]; rr = s[i * 3 + 2]; }
            d[i * 4] = rr; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
        }
    }
    return 1;
}
/** The picture into the window's next buffer, whole: a posted buffer comes back later with an older picture in it.
 *  ponytail: 4 MB copied a picture on a 1280x800 screen (8-12 ms on a Tegra 3); dirty rows per buffer if it shows in a profile. */
static void show(void) {
    pthread_mutex_lock(&winLock);
    ANativeWindow_Buffer b;
    if (win && ANativeWindow_lock(win, &b, NULL) == 0) {   // waits for a free buffer (the display's pace): no picture held meanwhile
        pthread_mutex_lock(&picLock);
        int w = b.width < W ? b.width : W, h = b.height < H ? b.height : H;
        for (int y = 0; y < h; y++) memcpy((uint32_t *)b.bits + (size_t)y * b.stride, fb + (size_t)y * W, (size_t)w * 4);
        pthread_mutex_unlock(&picLock);
        ANativeWindow_unlockAndPost(win);
    }
    pthread_mutex_unlock(&winLock);
}
static void *presenter(void *unused) {
    (void)unused;
    for (;;) {
        pthread_mutex_lock(&picLock);
        while (!pending) pthread_cond_wait(&ready, &picLock);
        pending = 0; uint32_t last = pendingLast, dec = pendingDecode;
        pthread_mutex_unlock(&picLock);
        show();
        send16(12, 0, (int32_t)(now_us() - last), (int32_t)dec, 0, 0);
        pictures++;
    }
    return NULL;
}
/** The stream thread's picture is whole: the presenter shows the newest (a picture it had no time for is replaced). picLock is held. */
static void present(uint32_t lastByte, uint32_t decodeUs) {
    pending = 1; pendingLast = lastByte; pendingDecode = decodeUs;
    pthread_cond_signal(&ready);
}
static void beginPicture(int *inPicture) { if (!*inPicture) { pthread_mutex_lock(&picLock); *inPicture = 1; } }
static void endPicture(int *inPicture, uint32_t decodeUs) { present(now_us(), decodeUs); pthread_mutex_unlock(&picLock); *inPicture = 0; }

// HOST (kind 10), every 2 s: type 0 [temperature m°C, CPU permille of all cores, free MB], 1 [MHz now, MHz max, -1], 2 [MB, uptime s, 0]
static long long cpuBusy0, cpuAll0;
static long readLong(const char *path) { FILE *f = fopen(path, "r"); long v = -1; if (f) { if (fscanf(f, "%ld", &v) != 1) v = -1; fclose(f); } return v; }
static void sendHost(void) {
    long long u, n, sy, id, io, irq, sirq; int load = -1;
    FILE *f = fopen("/proc/stat", "r");
    if (f && fscanf(f, "cpu %lld %lld %lld %lld %lld %lld %lld", &u, &n, &sy, &id, &io, &irq, &sirq) == 7) {
        long long busy = u + n + sy + irq + sirq, all = busy + id + io;
        if (all > cpuAll0 && cpuAll0) load = (int)((busy - cpuBusy0) * 1000 / (all - cpuAll0));
        cpuBusy0 = busy; cpuAll0 = all;
    }
    if (f) fclose(f);
    long t = readLong("/sys/class/thermal/thermal_zone0/temp");   // m°C, or °C on some kernels
    if (t >= 0 && t < 200) t *= 1000;
    struct sysinfo si; sysinfo(&si);
    send16(10, 0, (int32_t)t, load, (int32_t)((si.freeram + si.bufferram) * si.mem_unit >> 20), 0);
    long cur = readLong("/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq"), max = readLong("/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq");
    send16(10, 1, cur < 0 ? -1 : (int32_t)(cur / 1000), max < 0 ? -1 : (int32_t)(max / 1000), -1, 0);
    send16(10, 2, (int32_t)(si.totalram * si.mem_unit >> 20), (int32_t)si.uptime, 0, 0);
}

static void serve(int c) {
    int one = 1;
    setsockopt(c, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
    char hello[384];
    int n = snprintf(hello, sizeof hello, "RMPP %d %d Android +lz4 +copy +zstd +sub +sink +rgb +name:%s\n", W, H, name);
    if (write(c, hello, (size_t)n) != n) return;
    pthread_mutex_lock(&wire); client = c; acked = 0; pthread_mutex_unlock(&wire);
    uint8_t h[16];
    uint8_t *data = NULL; size_t cap = 0;
    uint32_t t0 = 0, decodeUs = 0, hostAt = now_us(); int inPicture = 0;
    sendHost();
    while (readFull(c, h, 16)) {
        int type = h[0], depth = h[1], x = h[2] | h[3] << 8, y = h[4] | h[5] << 8, w = h[6] | h[7] << 8, hh = h[8] | h[9] << 8;
        int codec = h[10] & 0x7f, sub = (h[10] & 0x80) != 0, more = h[11] & 1;
        size_t len = (size_t)h[12] | (size_t)h[13] << 8 | (size_t)h[14] << 16 | (size_t)h[15] << 24;
        if (type == 1) {   // RECT, depth 24
            size_t raw = (size_t)w * hh * 3;
            if (depth != 24 || codec > 2 || x + w > W || y + hh > H || len > raw + raw / 255 + 64 || len > (size_t)W * H * 3 + 64) break;
            if (cap < len) { free(data); data = malloc(len); cap = len; }
            if (!readFull(c, data, len)) break;
            if (!inPicture) { beginPicture(&inPicture); t0 = now_us(); decodeUs = 0; }
            uint32_t t = now_us();
            if (!decodeRect(data, len, x, y, w, hh, codec, sub)) break;
            decodeUs += now_us() - t;
            send16(1, 0, 0, (int32_t)(now_us() - t), 0, 1);
            if (!more) endPicture(&inPicture, decodeUs);
        } else if (type == 6) {   // COPY: the rectangle moves by [i16 dx][i16 dy]
            int16_t d[2];
            if (len != 4 || !readFull(c, d, 4)) break;
            int dx = d[0], dy = d[1];
            if (x + w > W || y + hh > H || x + dx < 0 || y + dy < 0 || x + dx + w > W || y + dy + hh > H) break;
            for (int j = 0; j < hh; j++) { int r = dy > 0 ? hh - 1 - j : j; memmove(fb + (size_t)(y + dy + r) * W + x + dx, fb + (size_t)(y + r) * W + x, (size_t)w * 4); }
            if (!inPicture) { beginPicture(&inPicture); t0 = now_us(); decodeUs = 0; }
            if (!more) endPicture(&inPicture, decodeUs);
        } else if (type == 9) {   // SINK: read, dropped, ECHO
            if (!skip(c, len)) break;
            send16(11, 0, (int32_t)len, x | y << 16, 0, 0);
        } else {   // MODE, FULL, CURSOR, POINTER, SET, QUIT, VIDEO: nothing for this screen (no +h264 in its hello)
            if (!skip(c, len)) break;
            if ((type == 4 || type == 5) && !more && inPicture) endPicture(&inPicture, decodeUs);
        }
        if (now_us() - hostAt > 2000000) { hostAt = now_us(); sendHost(); }
    }
    if (inPicture) pthread_mutex_unlock(&picLock);   // half a picture: shown with the next one
    (void)t0;
    free(data);
    pthread_mutex_lock(&wire); client = -1; pthread_mutex_unlock(&wire);
    LOG("the sender left");
}
static void *serving(void *arg) { int c = (int)(intptr_t)arg; serve(c); close(c); return NULL; }
/** One Mac at a time, the newest: a connection that died without closing (a cable pulled, a sender killed) would hold the screen for
 *  ever, so a new sender takes over and the old connection is shut. */
static void *listener(void *unused) {
    (void)unused;
    int ls = socket(AF_INET, SOCK_STREAM, 0), one = 1;
    setsockopt(ls, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
    struct sockaddr_in a = {0}; a.sin_family = AF_INET; a.sin_port = htons(PORT); a.sin_addr.s_addr = htonl(INADDR_ANY);
    if (bind(ls, (struct sockaddr *)&a, sizeof a) != 0 || listen(ls, 1) != 0) { LOG("cannot listen on %d", PORT); return NULL; }
    LOG("%dx%d, listening on port %d", W, H, PORT);
    pthread_t current; int busy = 0;
    for (;;) {
        int c = accept(ls, NULL, NULL);
        if (c < 0) continue;
        LOG("a sender connected");
        if (busy) {
            pthread_mutex_lock(&wire); if (client >= 0) shutdown(client, SHUT_RDWR); pthread_mutex_unlock(&wire);
            pthread_join(current, NULL);
        }
        busy = pthread_create(&current, NULL, serving, (void *)(intptr_t)c) == 0;
        if (!busy) close(c);
    }
}

// --- Java (dev.zinc.sidecar.Screen)
JNIEXPORT void JNICALL Java_dev_zinc_sidecar_Screen_start(JNIEnv *env, jclass cls, jobject surface, jint w, jint h, jstring device) {
    (void)cls;
    const char *d = (*env)->GetStringUTFChars(env, device, NULL);
    size_t k = 0;
    for (const unsigned char *p = (const unsigned char *)d; *p && k + 4 < sizeof name; p++) {   // percent-encoded: one word
        if ((*p >= '0' && *p <= '9') || (*p >= 'A' && *p <= 'Z') || (*p >= 'a' && *p <= 'z')) name[k++] = (char)*p;
        else k += (size_t)snprintf(name + k, 4, "%%%02X", *p);
    }
    name[k] = 0;
    (*env)->ReleaseStringUTFChars(env, device, d);
    pthread_mutex_lock(&winLock);
    if (win) ANativeWindow_release(win);
    win = ANativeWindow_fromSurface(env, surface);
    // the Surface's size is the stream's: it changes once the bars hide (immersive), taken while no Mac is connected
    // ponytail: a Mac connecting at that very instant reads the old size; the app runs in landscape only, so it happens at the start alone
    if (!fb || ((w != W || h != H) && client < 0)) {
        pthread_mutex_lock(&picLock);
        free(fb);
        W = w; H = h; fb = calloc((size_t)W * H, 4);
        for (size_t i = 0; i < (size_t)W * H; i++) fb[i] = 0xFF000000u;
        pthread_mutex_unlock(&picLock);
        static int listening;
        if (!listening) {
            listening = 1;
            pthread_t t; pthread_create(&t, NULL, listener, NULL); pthread_detach(t);
            pthread_create(&t, NULL, presenter, NULL); pthread_detach(t);
        }
    }
    ANativeWindow_setBuffersGeometry(win, W, H, WINDOW_FORMAT_RGBX_8888);   // opaque: the compositor blends nothing
    pthread_mutex_unlock(&winLock);
    pthread_mutex_lock(&picLock); present(now_us(), 0); pthread_mutex_unlock(&picLock);   // what it showed before the Surface went
}
JNIEXPORT void JNICALL Java_dev_zinc_sidecar_Screen_stop(JNIEnv *env, jclass cls) {
    (void)env; (void)cls;
    pthread_mutex_lock(&winLock);
    if (win) { ANativeWindow_release(win); win = NULL; }
    pthread_mutex_unlock(&winLock);
}
/** Whether a Mac is connected and has shown a picture (the page saying how to start hides then). */
JNIEXPORT jboolean JNICALL Java_dev_zinc_sidecar_Screen_connected(JNIEnv *env, jclass cls) {
    (void)env; (void)cls;
    return client >= 0 && pictures > 1;
}

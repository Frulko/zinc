// The Android screen of Sidecar: the Mac's stream (plugins/display-rmpp/stream.h's wire, as app/sidecar/mac/receiver.swift reads it) into
// the activity's Surface. The Mac reaches it on the USB cable through adb (sidecar-screen --host adb), or on the network. The picture is
// kept here in RGBA; each RECT is decoded into it (lz4 or zstd, PNG's Sub, B G R to R G B A), and at a picture's last message it is
// copied whole into the window's next buffer and posted by the presenter thread, so the stream never waits for the display's vsync.
// A video (VIDEO, +h264 when the device has an H.264 decoder) is decoded in hardware (MediaCodec) straight into a second Surface laid
// over its place.
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
#include <media/NdkMediaCodec.h>
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
static void callPlace(int x, int y, int w, int h); static volatile int hideVideo;   // the video, below

// the screen's answers: 16 bytes [u8 kind][u8 type][u16 id][i32 a][i32 b][i32 c], little-endian as this CPU
static void send16id(uint8_t kind, uint8_t type, int id, int32_t a, int32_t b, int32_t c, int ack) {
    pthread_mutex_lock(&wire);
    if (client >= 0) {
        uint8_t m[16] = {kind, type, (uint8_t)(id & 255), (uint8_t)(id >> 8 & 255)};
        if (ack) a = ++acked;
        memcpy(m + 4, &a, 4); memcpy(m + 8, &b, 4); memcpy(m + 12, &c, 4);
        send(client, m, 16, MSG_NOSIGNAL);
    }
    pthread_mutex_unlock(&wire);
}
static void send16(uint8_t kind, uint8_t type, int32_t a, int32_t b, int32_t c, int ack) { send16id(kind, type, 0, a, b, c, ack); }
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

/** One RECT's B G R rows (compressed or not, Sub-filtered or not) into the picture; plain and dctx are the decoding thread's own. */
static int decodeRect(const uint8_t *data, size_t len, int x, int y, int w, int h, int codec, int sub, uint8_t **plain, size_t *plainCap, ZSTD_DCtx **dctx) {
    size_t stride = (size_t)w * 3, raw = stride * h;
    const uint8_t *src = data;
    if (codec) {
        if (*plainCap < raw) { free(*plain); *plain = malloc(raw); *plainCap = raw; }
        if (codec == 1) { if (LZ4_decompress_safe((const char *)data, (char *)*plain, (int)len, (int)raw) != (int)raw) return 0; }
        else { if (!*dctx) *dctx = ZSTD_createDCtx(); if (ZSTD_decompressDCtx(*dctx, *plain, raw, data, len) != raw) return 0; }
        src = *plain;
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

// The RECTs of a picture are decoded by WORKERS threads while the stream thread reads the next ones: one Tegra 3 core decodes about
// 7 Mbit/s of zstd, the cable carries 27. The rectangles of a picture do not overlap (the Mac's dirty tiles); a COPY and a picture's end
// wait for the queue to be empty.
#define WORKERS 3
typedef struct Job { struct Job *next; uint8_t *data; size_t len; int x, y, w, h, codec, sub; } Job;
static Job *jobs, **jobsTail = &jobs;
static int outstanding, failed; static uint32_t decodedUs;
static pthread_mutex_t jobLock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t jobReady = PTHREAD_COND_INITIALIZER, jobDone = PTHREAD_COND_INITIALIZER;
static void *worker(void *unused) {
    (void)unused;
    uint8_t *plain = NULL; size_t plainCap = 0; ZSTD_DCtx *dctx = NULL;
    for (;;) {
        pthread_mutex_lock(&jobLock);
        while (!jobs) pthread_cond_wait(&jobReady, &jobLock);
        Job *j = jobs; jobs = j->next; if (!jobs) jobsTail = &jobs;
        pthread_mutex_unlock(&jobLock);
        uint32_t t = now_us();
        int ok = decodeRect(j->data, j->len, j->x, j->y, j->w, j->h, j->codec, j->sub, &plain, &plainCap, &dctx);
        uint32_t dt = now_us() - t;
        free(j->data); free(j);
        send16(1, 0, 0, (int32_t)dt, 0, 1);
        pthread_mutex_lock(&jobLock);
        decodedUs += dt; if (!ok) failed = 1;
        if (--outstanding == 0) pthread_cond_broadcast(&jobDone);
        pthread_mutex_unlock(&jobLock);
    }
    return NULL;
}
static void queueRect(Job *j) {
    pthread_mutex_lock(&jobLock);
    j->next = NULL; *jobsTail = j; jobsTail = &j->next; outstanding++;
    pthread_cond_signal(&jobReady);
    pthread_mutex_unlock(&jobLock);
}
/** Waits for the queued RECTs; false when one did not decode. */
static int drain(void) {
    pthread_mutex_lock(&jobLock);
    while (outstanding) pthread_cond_wait(&jobDone, &jobLock);
    int ok = !failed; failed = 0;
    pthread_mutex_unlock(&jobLock);
    return ok;
}
static uint32_t takeDecoded(void) { pthread_mutex_lock(&jobLock); uint32_t d = decodedUs; decodedUs = 0; pthread_mutex_unlock(&jobLock); return d; }

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
        if (hideVideo) { hideVideo = 0; callPlace(0, 0, 0, 0); }
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

// --- the video (VIDEO, type 10): Annex B H.264 units, MediaCodec in hardware, into the Java side's video Surface laid over (x, y, w, h)
static JavaVM *jvm; static jclass screenClass; static jmethodID placeMethod;
static int h264;   // the device decodes H.264 (the hello's +h264)
typedef struct Unit { struct Unit *next; uint8_t *data; size_t len; int x, y, w, h; uint32_t t; } Unit;
static Unit *units, **unitsTail = &units;
static pthread_mutex_t unitLock = PTHREAD_MUTEX_INITIALIZER, vLock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t unitReady = PTHREAD_COND_INITIALIZER, vSurfaceCame = PTHREAD_COND_INITIALIZER;
static AMediaCodec *codec; static ANativeWindow *vwin; static int vw, vh;   // under vLock
static int place[4];
/** The video Surface over (x, y, w, h), w 0: none (Screen.place, on the UI thread; the Surface comes to Screen.videoSurface). */
static void callPlace(int x, int y, int w, int h) {
    JNIEnv *env; int attached = 0;
    if ((*jvm)->GetEnv(jvm, (void **)&env, JNI_VERSION_1_6) != JNI_OK) { (*jvm)->AttachCurrentThread(jvm, &env, NULL); attached = 1; }
    (*env)->CallStaticVoidMethod(env, screenClass, placeMethod, x, y, w, h);
    if (attached) (*jvm)->DetachCurrentThread(jvm);
}
static void stopCodec(void) { if (codec) { AMediaCodec_stop(codec); AMediaCodec_delete(codec); codec = NULL; } }   // vLock held
/** The SPS (7) or PPS (8) of an Annex B unit, with its start code (MediaCodec's csd-0, csd-1). */
static const uint8_t *paramSet(const uint8_t *d, size_t n, int type, size_t *len) {
    for (size_t i = 0; i + 3 < n; i++) {
        if (d[i] || d[i + 1] || d[i + 2] != 1 || (d[i + 3] & 31) != type) continue;
        size_t s = i > 0 && d[i - 1] == 0 ? i - 1 : i, e = i + 3;
        while (e + 2 < n && !(d[e] == 0 && d[e + 1] == 0 && d[e + 2] == 1)) e++;
        if (e + 2 >= n) e = n; else if (d[e - 1] == 0) e--;
        *len = e - s; return d + s;
    }
    return NULL;
}
static int startCodec(const Unit *u) {   // vLock held, vwin the place's size
    size_t sl, pl; const uint8_t *sps = paramSet(u->data, u->len, 7, &sl), *pps = paramSet(u->data, u->len, 8, &pl);
    if (!sps || !pps) return 0;   // not a key picture: the next one is (a new place starts with one)
    AMediaFormat *f = AMediaFormat_new();
    AMediaFormat_setString(f, AMEDIAFORMAT_KEY_MIME, "video/avc");
    AMediaFormat_setInt32(f, AMEDIAFORMAT_KEY_WIDTH, u->w); AMediaFormat_setInt32(f, AMEDIAFORMAT_KEY_HEIGHT, u->h);
    AMediaFormat_setBuffer(f, "csd-0", (void *)sps, sl); AMediaFormat_setBuffer(f, "csd-1", (void *)pps, pl);
    codec = AMediaCodec_createDecoderByType("video/avc");
    int ok = codec && AMediaCodec_configure(codec, f, vwin, NULL, 0) == AMEDIA_OK && AMediaCodec_start(codec) == AMEDIA_OK;
    AMediaFormat_delete(f);
    if (!ok && codec) { AMediaCodec_delete(codec); codec = NULL; }
    if (!ok) LOG("MediaCodec refused the %dx%d video", u->w, u->h);
    return ok;
}
/** One unit decoded and rendered to the video Surface; the µs from its last byte to the decoder's picture, -1 when none came out. */
static int decodeUnit(const Unit *u) {
    if (!codec || memcmp(place, (int[]){u->x, u->y, u->w, u->h}, sizeof place)) {   // a new place or size: a new Surface and decoder
        stopCodec();
        place[0] = u->x; place[1] = u->y; place[2] = u->w; place[3] = u->h; hideVideo = 0;
        if (!vwin || vw != u->w || vh != u->h) {
            if (vwin) { ANativeWindow_release(vwin); vwin = NULL; }
            pthread_mutex_unlock(&vLock); callPlace(u->x, u->y, u->w, u->h); pthread_mutex_lock(&vLock);
            struct timespec until; clock_gettime(CLOCK_REALTIME, &until); until.tv_sec += 1;
            while (!(vwin && vw == u->w && vh == u->h)) if (pthread_cond_timedwait(&vSurfaceCame, &vLock, &until)) return -1;
        } else { pthread_mutex_unlock(&vLock); callPlace(u->x, u->y, u->w, u->h); pthread_mutex_lock(&vLock); }
        if (!startCodec(u)) { place[2] = 0; return -1; }
    }
    ssize_t in = AMediaCodec_dequeueInputBuffer(codec, 100000);
    if (in < 0) return -1;
    size_t cap; uint8_t *b = AMediaCodec_getInputBuffer(codec, (size_t)in, &cap);
    if (!b || cap < u->len) { AMediaCodec_queueInputBuffer(codec, (size_t)in, 0, 0, 0, 0); return -1; }
    memcpy(b, u->data, u->len);
    AMediaCodec_queueInputBuffer(codec, (size_t)in, 0, u->len, (uint64_t)u->t, 0);
    // the picture of this unit (no reordering in the stream: it comes out of the decoder at once, or the decoder holds one back)
    int us = -1;
    for (int tries = 0; tries < 20; tries++) {
        AMediaCodecBufferInfo info;
        ssize_t out = AMediaCodec_dequeueOutputBuffer(codec, &info, us < 0 ? 10000 : 0);
        if (out >= 0) { AMediaCodec_releaseOutputBuffer(codec, (size_t)out, 1); us = (int)(now_us() - u->t); }
        else if (out == AMEDIACODEC_INFO_TRY_AGAIN_LATER && us >= 0) break;
    }
    return us;
}
static void *videoThread(void *unused) {
    (void)unused;
    for (;;) {
        pthread_mutex_lock(&unitLock);
        while (!units) pthread_cond_wait(&unitReady, &unitLock);
        Unit *u = units; units = u->next; if (!units) unitsTail = &units;
        pthread_mutex_unlock(&unitLock);
        int us = 0;
        pthread_mutex_lock(&vLock);
        if (u->len == 0) { stopCodec(); place[2] = 0; hideVideo = u->x >= 0; }   // the video ends: hidden once the RECTs that follow are shown
        else us = decodeUnit(u);
        pthread_mutex_unlock(&vLock);
        if (u->x < 0) callPlace(0, 0, 0, 0);   // the sender left
        else send16(1, 10, 0, us < 0 ? 0 : us, 0, 1);   // always answered, or the sender waits for ever
        free(u->data); free(u);
    }
    return NULL;
}
static void queueUnit(Unit *u) {
    pthread_mutex_lock(&unitLock);
    u->next = NULL; *unitsTail = u; unitsTail = &u->next;
    pthread_cond_signal(&unitReady);
    pthread_mutex_unlock(&unitLock);
}

static void serve(int c) {
    int one = 1;
    setsockopt(c, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
    char hello[384];
    int n = snprintf(hello, sizeof hello, "RMPP %d %d Android +lz4 +copy +zstd +sub +sink +rgb%s +name:%s\n", W, H, h264 ? " +h264" : "", name);
    if (write(c, hello, (size_t)n) != n) return;
    pthread_mutex_lock(&wire); client = c; acked = 0; pthread_mutex_unlock(&wire);
    uint8_t h[16];
    uint32_t hostAt = now_us(); int inPicture = 0;
    sendHost();
    while (readFull(c, h, 16)) {
        int type = h[0], depth = h[1], x = h[2] | h[3] << 8, y = h[4] | h[5] << 8, w = h[6] | h[7] << 8, hh = h[8] | h[9] << 8;
        int codec = h[10] & 0x7f, sub = (h[10] & 0x80) != 0, more = h[11] & 1;
        size_t len = (size_t)h[12] | (size_t)h[13] << 8 | (size_t)h[14] << 16 | (size_t)h[15] << 24;
        if (type == 1) {   // RECT, depth 24
            size_t raw = (size_t)w * hh * 3;
            if (depth != 24 || codec > 2 || x + w > W || y + hh > H || len > raw + raw / 255 + 64 || len > (size_t)W * H * 3 + 64) break;
            Job *j = malloc(sizeof *j);
            j->data = malloc(len ? len : 1); j->len = len; j->x = x; j->y = y; j->w = w; j->h = hh; j->codec = codec; j->sub = sub;
            if (!readFull(c, j->data, len)) { free(j->data); free(j); break; }
            beginPicture(&inPicture);
            queueRect(j);
            if (!more) { if (!drain()) break; endPicture(&inPicture, takeDecoded()); }
        } else if (type == 6) {   // COPY: the rectangle moves by [i16 dx][i16 dy]
            int16_t d[2];
            if (len != 4 || !readFull(c, d, 4)) break;
            int dx = d[0], dy = d[1];
            if (x + w > W || y + hh > H || x + dx < 0 || y + dy < 0 || x + dx + w > W || y + dy + hh > H) break;
            if (!drain()) break;   // the rectangles before it are in the picture
            for (int j = 0; j < hh; j++) { int r = dy > 0 ? hh - 1 - j : j; memmove(fb + (size_t)(y + dy + r) * W + x + dx, fb + (size_t)(y + r) * W + x, (size_t)w * 4); }
            beginPicture(&inPicture);
            if (!more) endPicture(&inPicture, takeDecoded());
        } else if (type == 9) {   // SINK: read, dropped, ECHO
            if (!skip(c, len)) break;
            send16(11, 0, (int32_t)len, x | y << 16, 0, 0);
        } else if (type == 10 && h264) {   // VIDEO
            if (x + w > W || y + hh > H || len > 8u << 20) break;
            Unit *u = malloc(sizeof *u);
            u->data = malloc(len ? len : 1); u->len = len; u->x = x; u->y = y; u->w = w; u->h = hh;
            if (!readFull(c, u->data, len)) { free(u->data); free(u); break; }
            u->t = now_us();
            queueUnit(u);
        } else {   // MODE, FULL, CURSOR, POINTER, SET, QUIT: nothing for this screen
            if (!skip(c, len)) break;
            if ((type == 4 || type == 5) && !more && inPicture) { if (!drain()) break; endPicture(&inPicture, takeDecoded()); }
        }
        if (now_us() - hostAt > 2000000) { hostAt = now_us(); sendHost(); }
    }
    drain(); takeDecoded();   // no worker writes the picture once the stream has left
    if (h264) { Unit *u = calloc(1, sizeof *u); u->x = -1; queueUnit(u); }   // and its video goes, at once (no picture follows)
    if (inPicture) pthread_mutex_unlock(&picLock);   // half a picture: shown with the next one
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
            (*env)->GetJavaVM(env, &jvm);
            screenClass = (*env)->NewGlobalRef(env, cls);
            placeMethod = (*env)->GetStaticMethodID(env, cls, "place", "(IIII)V");
            AMediaCodec *test = AMediaCodec_createDecoderByType("video/avc");   // the hello's +h264
            if (test) { AMediaCodec_delete(test); h264 = 1; pthread_t v; pthread_create(&v, NULL, videoThread, NULL); pthread_detach(v); }
            pthread_t t; pthread_create(&t, NULL, listener, NULL); pthread_detach(t);
            pthread_create(&t, NULL, presenter, NULL); pthread_detach(t);
            for (int i = 0; i < WORKERS; i++) { pthread_create(&t, NULL, worker, NULL); pthread_detach(t); }
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
/** The video Surface came (its size) or went (null): the decoder renders into it alone. */
JNIEXPORT void JNICALL Java_dev_zinc_sidecar_Screen_videoSurface(JNIEnv *env, jclass cls, jobject surface, jint w, jint h) {
    (void)cls;
    pthread_mutex_lock(&vLock);
    if (!surface) { stopCodec(); place[2] = 0; }
    if (vwin) { ANativeWindow_release(vwin); vwin = NULL; }
    if (surface) { vwin = ANativeWindow_fromSurface(env, surface); vw = w; vh = h; pthread_cond_broadcast(&vSurfaceCame); }
    pthread_mutex_unlock(&vLock);
}
/** The touches (INPUT, SCROLL of stream.h): the Mac plays them as its mouse. */
JNIEXPORT void JNICALL Java_dev_zinc_sidecar_Screen_input(JNIEnv *env, jclass cls, jint kind, jint type, jint id, jint a, jint b, jint c) {
    (void)env; (void)cls;
    send16id((uint8_t)kind, (uint8_t)type, id, a, b, c, 0);
}

// SPDX-License-Identifier: GPL-3.0-only
#include <jni.h>
#include <sys/socket.h>
#include <sys/kern_control.h>
#include <sys/ioctl.h>
#include <sys/sys_domain.h>
#include <net/if.h>
#include <net/if_utun.h>
#include <arpa/inet.h>
#include <poll.h>
#include <unistd.h>
#include <cerrno>
#include <cstring>
#include <string>

namespace {
void error(JNIEnv* e, const char* operation) {
    std::string message = std::string(operation) + ": " + strerror(errno);
    e->ThrowNew(e->FindClass("java/io/IOException"), message.c_str());
}
}
extern "C" {
JNIEXPORT jint JNICALL Java_com_shilapi_xcertplay_transport_NativeTun_open(JNIEnv* e, jobject) {
    int fd = socket(PF_SYSTEM, SOCK_DGRAM, SYSPROTO_CONTROL);
    if (fd < 0) { error(e, "utun socket"); return -1; }
    ctl_info info{};
    strlcpy(info.ctl_name, UTUN_CONTROL_NAME, sizeof(info.ctl_name));
    if (ioctl(fd, CTLIOCGINFO, &info) < 0) { error(e, "utun control"); close(fd); return -1; }
    sockaddr_ctl address{};
    address.sc_len = sizeof(address);
    address.sc_family = AF_SYSTEM;
    address.ss_sysaddr = AF_SYS_CONTROL;
    address.sc_id = info.ctl_id;
    if (connect(fd, reinterpret_cast<sockaddr*>(&address), sizeof(address)) < 0) {
        error(e, "utun connect (requires root)"); close(fd); return -1;
    }
    return fd;
}
JNIEXPORT jstring JNICALL Java_com_shilapi_xcertplay_transport_NativeTun_name(JNIEnv* e, jobject, jint fd) {
    char name[IFNAMSIZ]{};
    socklen_t size = sizeof(name);
    if (getsockopt(fd, SYSPROTO_CONTROL, UTUN_OPT_IFNAME, name, &size) < 0) { error(e, "utun name"); return nullptr; }
    return e->NewStringUTF(name);
}
JNIEXPORT jbyteArray JNICALL Java_com_shilapi_xcertplay_transport_NativeTun_read(JNIEnv* e, jobject, jint fd) {
    pollfd waiting{fd, POLLIN, 0};
    int status = poll(&waiting, 1, 500);
    if (status == 0 || (status < 0 && errno == EINTR)) return nullptr;
    if (status < 0) { error(e, "utun poll"); return nullptr; }
    unsigned char buffer[65540];
    ssize_t size = read(fd, buffer, sizeof(buffer));
    if (size < 0) { error(e, "utun read"); return nullptr; }
    if (size < 4) return nullptr;
    uint32_t family;
    memcpy(&family, buffer, 4);
    if (ntohl(family) != AF_INET6) return nullptr;
    auto result = e->NewByteArray(static_cast<jsize>(size - 4));
    e->SetByteArrayRegion(result, 0, static_cast<jsize>(size - 4), reinterpret_cast<jbyte*>(buffer + 4));
    return result;
}
JNIEXPORT void JNICALL Java_com_shilapi_xcertplay_transport_NativeTun_write(JNIEnv* e, jobject, jint fd, jbyteArray bytes) {
    jsize size = e->GetArrayLength(bytes);
    if (size < 40 || size > 65535) {
        e->ThrowNew(e->FindClass("java/io/IOException"), "Invalid utun IPv6 packet length"); return;
    }
    unsigned char buffer[65539];
    uint32_t family = htonl(AF_INET6);
    memcpy(buffer, &family, 4);
    e->GetByteArrayRegion(bytes, 0, size, reinterpret_cast<jbyte*>(buffer + 4));
    if (write(fd, buffer, size + 4) != size + 4) error(e, "utun write");
}
JNIEXPORT void JNICALL Java_com_shilapi_xcertplay_transport_NativeTun_close(JNIEnv*, jobject, jint fd) { close(fd); }
}

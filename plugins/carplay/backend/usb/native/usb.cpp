// SPDX-License-Identifier: GPL-3.0-only
// Native Mac host boundary for DiPlay's USBMUX and NCM protocol ports.
#include "descriptors.h"
#include <jni.h>
#include <algorithm>
#include <cctype>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
void checked(int result, const char* operation) {
    if (result < 0) throw std::runtime_error(std::string(operation) + ": " + libusb_error_name(result));
}
struct Context {
    libusb_context* value = nullptr;
    Context() { checked(libusb_init(&value), "libusb_init"); }
    ~Context() { libusb_exit(value); }
};
struct Devices {
    libusb_device** value = nullptr;
    ssize_t count;
    explicit Devices(libusb_context* c) : count(libusb_get_device_list(c, &value)) {
        checked(static_cast<int>(count), "list devices");
    }
    ~Devices() { libusb_free_device_list(value, 1); }
};
struct Device {
    Context context;
    libusb_device_handle* handle = nullptr;
    carplay::Configuration config;
    std::vector<int> claimed;
    bool detached = false;
    ~Device() {
        if (!handle) return;
        for (auto i = claimed.rbegin(); i != claimed.rend(); ++i)
            libusb_release_interface(handle, *i);
        if (detached) libusb_attach_kernel_driver(handle, config.mux.interface);
        libusb_close(handle);
    }
    void claim(int interface) {
        if (std::find(claimed.begin(), claimed.end(), interface) != claimed.end()) return;
        checked(libusb_claim_interface(handle, interface), "claim USB interface (macOS driver may own it)");
        claimed.push_back(interface);
    }
};
carplay::Configuration configuration(libusb_device* device, bool requireNcm = true) {
    libusb_device_descriptor desc{};
    checked(libusb_get_device_descriptor(device, &desc), "device descriptor");
    carplay::Configuration best;
    for (int i = 0; i < desc.bNumConfigurations; ++i) {
        libusb_config_descriptor* config = nullptr;
        checked(libusb_get_config_descriptor(device, i, &config), "configuration descriptor");
        auto candidate = carplay::discover(*config);
        libusb_free_config_descriptor(config);
        if (candidate.mux && (candidate || !requireNcm) &&
            (!best.value || (candidate && !best) || candidate.appleEthernet)) best = candidate;
    }
    return best;
}
std::string serial(libusb_device_handle* handle, const libusb_device_descriptor& desc) {
    unsigned char text[256];
    if (!desc.iSerialNumber) return {};
    int count = libusb_get_string_descriptor_ascii(handle, desc.iSerialNumber, text, sizeof(text));
    checked(count, "read USB serial");
    return std::string(reinterpret_cast<char*>(text), count);
}
void fail(JNIEnv* env, const std::exception& error) {
    env->ThrowNew(env->FindClass("java/io/IOException"), error.what());
}
Device& device(jlong handle) {
    if (!handle) throw std::runtime_error("USB device is closed");
    return *reinterpret_cast<Device*>(handle);
}
}
extern "C" {
JNIEXPORT jobjectArray JNICALL Java_com_shilapi_xcertplay_transport_NativeUsb_list(JNIEnv* env, jobject) {
    try {
        Context context;
        Devices devices(context.value);
        std::vector<std::string> found;
        for (ssize_t i = 0; i < devices.count; ++i) {
            libusb_device_descriptor desc{};
            checked(libusb_get_device_descriptor(devices.value[i], &desc), "device descriptor");
            if (desc.idVendor != 0x05ac) continue;
            // Do not open unrelated Apple peripherals.
            if (!configuration(devices.value[i], false).mux) continue;
            libusb_device_handle* h = nullptr;
            int status = libusb_open(devices.value[i], &h);
            if (status < 0) {
                found.push_back(std::string("unavailable: ") + libusb_error_name(status));
                continue;
            }
            try { found.push_back(serial(h, desc)); }
            catch (...) { libusb_close(h); throw; }
            libusb_close(h);
        }
        auto result = env->NewObjectArray(static_cast<jsize>(found.size()), env->FindClass("java/lang/String"), nullptr);
        for (size_t i = 0; i < found.size(); ++i) {
            auto text = env->NewStringUTF(found[i].c_str());
            env->SetObjectArrayElement(result, static_cast<jsize>(i), text);
            env->DeleteLocalRef(text);
        }
        return result;
    } catch (const std::exception& e) { fail(env, e); return nullptr; }
}
JNIEXPORT jlong JNICALL Java_com_shilapi_xcertplay_transport_NativeUsb_open(JNIEnv* env, jobject, jstring requested, jboolean switchMode) {
    try {
        const char* text = env->GetStringUTFChars(requested, nullptr);
        std::string wanted(text);
        env->ReleaseStringUTFChars(requested, text);
        if (wanted.empty()) throw std::runtime_error("An explicit iPhone USB serial is required");
        auto owned = std::make_unique<Device>();
        Devices devices(owned->context.value);
        for (ssize_t i = 0; i < devices.count; ++i) {
            auto* current = devices.value[i];
            libusb_device_descriptor desc{};
            checked(libusb_get_device_descriptor(current, &desc), "device descriptor");
            if (desc.idVendor != 0x05ac) continue;
            auto config = configuration(current, false);
            if (!config.mux) continue;
            libusb_device_handle* h = nullptr;
            checked(libusb_open(current, &h), "open iPhone");
            bool matches;
            try { matches = serial(h, desc) == wanted; }
            catch (...) { libusb_close(h); throw; }
            if (!matches) { libusb_close(h); continue; }
            owned->handle = h;
            owned->config = config;
            break;
        }
        if (!owned->handle) throw std::runtime_error("No matching Apple USBMUX/NCM device; unlock/connect iPhone");
        if (switchMode) {
            unsigned char response = 0;
            int count = libusb_control_transfer(owned->handle, 0xc0, 0x52, 0, 4, &response, 1, 2000);
            checked(count, "request CarPlay USB mode");
            if (count != 1) throw std::runtime_error("CarPlay mode request returned a short response");
            // The request invalidates this device. Never continue using stale descriptors/endpoints.
            throw std::runtime_error("CarPlay mode requested; wait for re-enumeration and open again without --switch-mode");
        }
        if (!owned->config || !owned->config.appleEthernet)
            throw std::runtime_error("Phone is not in CarPlay mode; explicitly request --switch-mode first");
        int active = 0;
        checked(libusb_get_configuration(owned->handle, &active), "get configuration");
        checked(libusb_set_auto_detach_kernel_driver(owned->handle, 1), "enable macOS USB capture (requires root)");
        if (libusb_kernel_driver_active(owned->handle, owned->config.mux.interface) == 1 ||
            libusb_kernel_driver_active(owned->handle, owned->config.ncm.interface) == 1) {
            checked(libusb_detach_kernel_driver(owned->handle, owned->config.mux.interface), "capture iPhone from macOS drivers (requires root)");
            owned->detached = true;
        }
        if (active != owned->config.value)
            checked(libusb_set_configuration(owned->handle, owned->config.value), "select CarPlay configuration");
        owned->claim(owned->config.mux.interface);
        owned->claim(owned->config.control);
        owned->claim(owned->config.ncm.interface);
        checked(libusb_set_interface_alt_setting(owned->handle, owned->config.ncm.interface, owned->config.ncm.alternate), "select NCM alternate");
        return reinterpret_cast<jlong>(owned.release());
    } catch (const std::exception& e) { fail(env, e); return 0; }
}
JNIEXPORT jbyteArray JNICALL Java_com_shilapi_xcertplay_transport_NativeUsb_read(JNIEnv* env, jobject, jlong handle, jboolean ncm, jint timeout) {
    try {
        if (timeout < 1 || timeout > 1000) throw std::runtime_error("Read timeout must be 1..1000 ms");
        auto& d = device(handle);
        std::vector<unsigned char> bytes(65536);
        int transferred = 0;
        int result = libusb_bulk_transfer(d.handle, ncm ? d.config.ncm.in : d.config.mux.in, bytes.data(), static_cast<int>(bytes.size()), &transferred, timeout);
        // libusb may return bytes together with TIMEOUT. They belong to the stream.
        if (result != LIBUSB_ERROR_TIMEOUT) checked(result, "USB bulk read");
        if (!transferred) return nullptr;
        auto array = env->NewByteArray(transferred);
        env->SetByteArrayRegion(array, 0, transferred, reinterpret_cast<jbyte*>(bytes.data()));
        return array;
    } catch (const std::exception& e) { fail(env, e); return nullptr; }
}
JNIEXPORT void JNICALL Java_com_shilapi_xcertplay_transport_NativeUsb_write(JNIEnv* env, jobject, jlong handle, jboolean ncm, jbyteArray array, jint timeout) {
    try {
        if (timeout < 1 || timeout > 5000) throw std::runtime_error("Write timeout must be 1..5000 ms");
        auto& d = device(handle);
        int length = env->GetArrayLength(array);
        if (length > 65536) throw std::runtime_error("USB write exceeds transfer bound");
        std::vector<unsigned char> bytes(length);
        env->GetByteArrayRegion(array, 0, length, reinterpret_cast<jbyte*>(bytes.data()));
        int transferred = 0;
        int status = libusb_bulk_transfer(d.handle, ncm ? d.config.ncm.out : d.config.mux.out, bytes.data(), length, &transferred, timeout);
        if (ncm && status == LIBUSB_ERROR_TIMEOUT && transferred == 0) return; // Phone NAKs NCM before StartSession.
        checked(status, "USB bulk write");
        if (transferred != length) throw std::runtime_error("Short USB bulk write; stream must be closed");
    } catch (const std::exception& e) { fail(env, e); }
}
JNIEXPORT jint JNICALL Java_com_shilapi_xcertplay_transport_NativeUsb_interfaceNumber(JNIEnv* env, jobject, jlong handle) {
    try { return device(handle).config.ncm.interface; }
    catch (const std::exception& e) { fail(env, e); return -1; }
}
JNIEXPORT jint JNICALL Java_com_shilapi_xcertplay_transport_NativeUsb_packetSize(JNIEnv* env, jobject, jlong handle, jboolean input) {
    try {
        auto& p = device(handle).config.ncm;
        return input ? p.inPacketSize : p.outPacketSize;
    } catch (const std::exception& e) { fail(env, e); return 0; }
}
JNIEXPORT jstring JNICALL Java_com_shilapi_xcertplay_transport_NativeUsb_hostMac(JNIEnv* env, jobject, jlong handle) {
    try {
        auto& d = device(handle);
        if (!d.config.macString) return nullptr;
        unsigned char bytes[256];
        int size = libusb_get_string_descriptor(d.handle, static_cast<uint8_t>(d.config.macString), 0x0409, bytes, sizeof(bytes));
        checked(size, "read NCM MAC descriptor");
        if (size < 26 || bytes[1] != LIBUSB_DT_STRING) throw std::runtime_error("Invalid NCM MAC descriptor");
        std::string mac;
        for (int i = 2; i < 26; i += 2) {
            if (bytes[i + 1] != 0 || !std::isxdigit(bytes[i])) throw std::runtime_error("Invalid NCM MAC hex digit");
            mac += static_cast<char>(bytes[i]);
        }
        return env->NewStringUTF(mac.c_str());
    } catch (const std::exception& e) { fail(env, e); return nullptr; }
}
JNIEXPORT void JNICALL Java_com_shilapi_xcertplay_transport_NativeUsb_close(JNIEnv*, jobject, jlong handle) {
    delete reinterpret_cast<Device*>(handle);
}
}

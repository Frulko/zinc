// SPDX-License-Identifier: GPL-3.0-only
package com.shilapi.xcertplay.transport

import java.io.Closeable

/** macOS bulk-transfer boundary; the USBMUX host owns this pipe after open. */
interface Iap2UsbSession : Closeable {
    fun write(data: ByteArray, timeoutMillis: Int)
    fun read(timeoutMillis: Long): ByteArray?
}

interface UsbIo : Closeable {
    fun read(ncm: Boolean, timeoutMillis: Int): ByteArray?
    fun write(ncm: Boolean, data: ByteArray, timeoutMillis: Int)
}

/** Finite reads let close drain in-flight native operations without freeing an active handle. */
class MacUsbSession(private val io: UsbIo, private val ncm: Boolean = false, private val ownsDevice: Boolean = true) : Iap2UsbSession {
    private val closed = java.util.concurrent.atomic.AtomicBoolean(false)
    override fun read(timeoutMillis: Long): ByteArray? {
        checkOpen()
        require(timeoutMillis > 0) { "USB read timeout must be positive (got $timeoutMillis)" }
        return io.read(ncm, timeoutMillis.coerceAtMost(1000).toInt())
    }
    override fun write(data: ByteArray, timeoutMillis: Int) {
        checkOpen()
        require(timeoutMillis in 1..5000) { "USB write timeout must be 1..5000 ms (got $timeoutMillis)" }
        if (data.isNotEmpty()) io.write(ncm, data, timeoutMillis)
    }
    override fun close() {
        if (closed.compareAndSet(false, true) && ownsDevice) io.close()
    }
    private fun checkOpen() {
        if (closed.get()) throw IphoneUsbException.DeviceUnavailable("USB session is closed")
    }
}

/** Each instance owns a complete native USB device. MUX and NCM calls can run concurrently. */
class MacUsbDevice(serial: String, modeSwitch: Boolean) : UsbIo {
    private val lock = java.util.concurrent.locks.ReentrantReadWriteLock()
    private var handle = NativeUsb.open(serial, modeSwitch)
    fun packetSize(input: Boolean): Int = locked { NativeUsb.packetSize(it, input) }
    val hostMac: ByteArray? get() = locked { NativeUsb.hostMac(it)?.let { hex ->
        ByteArray(6) { index -> hex.substring(index * 2, index * 2 + 2).toInt(16).toByte() }
    } }
    val carPlayInterface: Int get() = locked { NativeUsb.interfaceNumber(it) }
    override fun read(ncm: Boolean, timeoutMillis: Int): ByteArray? = locked {
        try { NativeUsb.read(it, ncm, timeoutMillis) }
        catch (error: java.io.IOException) { throw IphoneUsbException.DeviceUnavailable("USB read failed: ${error.message}", error) }
    }
    override fun write(ncm: Boolean, data: ByteArray, timeoutMillis: Int) = locked {
        try { NativeUsb.write(it, ncm, data, timeoutMillis) }
        catch (error: java.io.IOException) { throw IphoneUsbException.DeviceUnavailable("USB write failed: ${error.message}", error) }
    }
    override fun close() {
        lock.writeLock().lock()
        try {
            if (handle != 0L) {
                NativeUsb.close(handle)
                handle = 0
            }
        } finally { lock.writeLock().unlock() }
    }
    private fun <T> locked(action: (Long) -> T): T {
        lock.readLock().lock()
        try {
            check(handle != 0L) { "USB device is closed" }
            return action(handle)
        } finally { lock.readLock().unlock() }
    }
}

object NativeUsb {
    init { System.load(System.getenv("ZINC_CARPLAY_USB_LIBRARY")) }
    external fun list(): Array<String>
    external fun open(serial: String, modeSwitch: Boolean): Long
    external fun read(handle: Long, ncm: Boolean, timeoutMillis: Int): ByteArray?
    external fun write(handle: Long, ncm: Boolean, data: ByteArray, timeoutMillis: Int)
    external fun packetSize(handle: Long, input: Boolean): Int
    external fun hostMac(handle: Long): String?
    external fun interfaceNumber(handle: Long): Int
    external fun close(handle: Long)
}

// SPDX-License-Identifier: GPL-3.0-only
package com.shilapi.xcertplay.transport

import java.io.Closeable
import java.util.ArrayDeque

/** Incremental NTB16 framing, retaining partial blocks and the optional short-packet pad. */
class NcmFrames(private val packetSize: Int = 512) {
    private var bytes = ByteArray(0)
    private var padAllowed = false
    private val frames = ArrayDeque<ByteArray>()
    private var queuedBytes = 0
    fun append(chunk: ByteArray) {
        if (bytes.size + chunk.size > 131072) throw IphoneUsbException.Protocol("NCM buffer limit")
        bytes += chunk
        while (true) {
            if (padAllowed && bytes.isNotEmpty()) {
                if (bytes[0] == 0.toByte()) bytes = bytes.copyOfRange(1, bytes.size)
                padAllowed = false
            }
            if (bytes.size < 12) return
            if (!bytes.copyOfRange(0, 4).contentEquals(byteArrayOf(0x4e, 0x43, 0x4d, 0x48)))
                throw IphoneUsbException.Protocol("Invalid NCM NTB16 signature")
            val length = (bytes[8].toInt() and 255) or ((bytes[9].toInt() and 255) shl 8)
            if (length < 12) throw IphoneUsbException.Protocol("Invalid NCM block length")
            if (bytes.size < length) return
            val parsed = Ntb16Codec.parse(bytes, 0, length)
            if (parsed.isEmpty()) throw IphoneUsbException.Protocol("Invalid NCM datagram table")
            if (frames.size + parsed.size > 256) throw IphoneUsbException.Protocol("NCM frame queue limit")
            queuedBytes += parsed.sumOf { it.size }
            if (queuedBytes > 1048576) throw IphoneUsbException.Protocol("NCM byte queue limit")
            frames.addAll(parsed)
            bytes = bytes.copyOfRange(length, bytes.size)
            padAllowed = length % packetSize == 0
        }
    }
    fun take(): ByteArray? = frames.pollFirst()?.also { queuedBytes -= it.size }
}

/** Owns the utun fd; the device remains owned by the encompassing wired session. */
class NcmNetwork(private val io: UsbIo, val address: String = "fe80::1", descriptorMac: ByteArray? = null, private val inPacketSize: Int = 512, private val outPacketSize: Int = 512, private val failed: (Throwable) -> Unit) : Closeable {
    private val fd = NativeTun.open()
    val name: String = try { NativeTun.name(fd) } catch (error: Throwable) {
        NativeTun.close(fd)
        throw error
    }
    private val hostMac = descriptorMac ?: byteArrayOf(0x02, 0x5a, 0x49, 0x4e, 0x43, 0x01)
    @Volatile private var peerMac: ByteArray? = null
    @Volatile private var running = true
    private val threads = java.util.concurrent.CopyOnWriteArrayList<Thread>()
    private var sequence = 0
    private val writeLock = Any()
    private val localAddress = java.net.InetAddress.getByName(address).address
    init {
        try {
            val process = ProcessBuilder("/sbin/ifconfig", name, "inet6", address + "/64", "up").inheritIO().start()
            check(process.waitFor() == 0) { "Cannot configure $name; wired USB requires root" }
        } catch (error: Throwable) { close(); throw error }
    }
    fun start() {
        check(running && threads.isEmpty()) { "NCM network is closed or started" }
            launch("ncm-in") {
                val frames = NcmFrames(inPacketSize)
                while (running) {
                    io.read(true, 500)?.let(frames::append)
                    while (true) {
                        val frame = frames.take() ?: break
                        val ipv6 = EthernetIpv6Codec.parseIpv6(frame) ?: continue
                        peerMac = ipv6.sourceMac
                        val reply = NcmNeighbor.reply(ipv6.ipv6, localAddress, hostMac)
                        if (reply != null) {
                            val destination = EthernetIpv6Codec.multicastDestinationMac(reply) ?: ipv6.sourceMac
                            send(EthernetIpv6Codec.build(hostMac, destination, reply))
                        } else NativeTun.write(fd, ipv6.ipv6)
                    }
                }
            }
            launch("ncm-out") {
                while (running) {
                    val packet = NativeTun.read(fd) ?: continue
                    val ipv6 = EthernetIpv6Codec.addNeighborAdvertisementTargetMac(packet, hostMac)
                    val destination = EthernetIpv6Codec.multicastDestinationMac(ipv6) ?: peerMac ?: continue
                    val frame = EthernetIpv6Codec.build(hostMac, destination, ipv6)
                    send(frame)
                }
            }
    }
    private fun send(frame: ByteArray) = synchronized(writeLock) {
        io.write(true, Ntb16Codec.build(frame, sequence, outPacketSize), 20)
        sequence = (sequence + 1) and 65535
    }
    private fun launch(name: String, action: () -> Unit) {
        val thread = Thread({
            try { action() } catch (error: Throwable) { if (running) failed(error) }
        }, name).apply { isDaemon = true }
        threads += thread
        thread.start()
    }
    override fun close() {
        synchronized(this) {
            if (!running) return
            running = false
        }
        threads.filter { it !== Thread.currentThread() }.forEach { it.join(2000) }
        NativeTun.close(fd)
    }
}

object NativeTun {
    init { Class.forName(NativeUsb::class.java.name) }
    external fun open(): Int
    external fun name(fd: Int): String
    external fun read(fd: Int): ByteArray?
    external fun write(fd: Int, data: ByteArray)
    external fun close(fd: Int)
}

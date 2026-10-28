// SPDX-License-Identifier: GPL-3.0-only
package com.playport.server

import com.shilapi.xcertplay.transport.*
import com.shilapi.xcertplay.iap2.session.Iap2Session
import com.shilapi.xcertplay.mfi.Iap2MfiAuthenticationClient
import java.io.Closeable
import org.slf4j.LoggerFactory

/** Owns USB, IPv6 routing, Lockdown and iAP2 in the separately distributed GPL process. */
class WiredBootstrap(private val serial: String) : Closeable {
    private val log = LoggerFactory.getLogger("wired")
    private val device = MacUsbDevice(serial, false)
    private var network: NcmNetwork? = null
    @Volatile private var mux: Iap2UsbMuxHost? = null
    @Volatile private var session: Iap2Session? = null
    @Volatile private var closed = false
    private var worker: Thread? = null
    val bindAddress: String get() = "${network!!.address}%${network!!.name}"
    init {
        try {
            network = NcmNetwork(device, descriptorMac = device.hostMac,
                inPacketSize = device.packetSize(true), outPacketSize = device.packetSize(false)) { error ->
                log.error("NCM network failed: {}", error.message)
                close()
            }
        } catch (error: Throwable) { device.close(); throw error }
    }
    fun start(server: CarPlayServer) {
        network!!.start(server.config.airPlayPort)
        worker = Thread({
            try {
                if (closed) return@Thread
                // The device belongs to this bootstrap; mux.close only closes this view.
                val pipe = MacUsbSession(device, ownsDevice = false)
                log.info("Opening wired USBMUX v2 channel")
                val host = Iap2UsbMuxHost.open(pipe, onDiagnostic = { log.debug(it) })
                mux = host
                if (closed) { host.close(); return@Thread }
                val stream = LockdownSavedSession.open(
                    host, LockdownPairStore(server.config.stateDir, serial), "ZincCarPlay",
                    timeoutMillis = 120000, isCancelled = { closed }, onProgress = { log.info(it) },
                )
                val control = Iap2Session.open(stream, onArtwork = { server.hub.artwork(it) }, onTrace = { log.debug(it) })
                session = control
                if (closed) { control.close(); return@Thread }
                val identification = Iap2IdentificationConfig(
                    name = server.config.deviceName, modelIdentifier = server.config.model,
                    manufacturer = server.config.manufacturer,
                    serialNumber = "ZINC-" + server.deviceId.replace(":", ""),
                    firmwareVersion = "1.0", hardwareVersion = "1.0", carPlayUsbInterfaceNumber = device.carPlayInterface,
                    locationInformationEnabled = true,
                )
                log.info("Wired endpoint host={} port={} deviceIdentifier={}", network!!.address, server.config.airPlayPort, network!!.deviceIdentifier)
                Iap2WiredControlClient(control, Iap2MfiAuthenticationClient(server.mfi)).run(
                    identification,
                    Iap2WiredCarPlayEndpoint(
                        listOf(network!!.address), server.config.airPlayPort,
                        server.identity.publicKeyHex, server.config.sourceVersion, network!!.deviceIdentifier,
                    ),
                    availableCurrentMilliAmps = 0,
                    timeoutMillis = Iap2WiredControlClient.NO_TIMEOUT_MILLIS,
                    locationProvider = server.debugGps,
                    onIncoming = { server.debugTelemetry.accept(it) },
                onProgress = { log.info(it) },
                )
            } catch (error: Exception) {
                if (!closed) log.error("Wired CarPlay ended", error)
            } finally { close() }
        }, "wired-bootstrap").apply { isDaemon = true; start() }
    }
    override fun close() {
        synchronized(this) {
            if (closed) return
            closed = true
        }
        runCatching { session?.close() }
        runCatching { mux?.close() }
        runCatching { network?.close() }
        device.close()
        worker?.takeIf { it !== Thread.currentThread() }?.join(6000)
    }
}

/** Safe descriptor-only discovery, or an explicitly requested Apple mode transition. */
fun main(args: Array<String>) {
    when {
        args.contentEquals(arrayOf("--list")) -> NativeUsb.list().let { devices ->
            if (devices.isEmpty()) println("No Apple USBMUX/NCM device found; connect and unlock an iPhone")
            else devices.forEach(::println)
        }
        args.size == 2 && args[0] == "--switch-mode" -> MacUsbDevice(args[1], true).use { }
        else -> error("Usage: USB tools --list | --switch-mode SERIAL")
    }
}

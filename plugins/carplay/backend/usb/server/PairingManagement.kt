package com.playport.server

import com.shilapi.xcertplay.airplay.PairingStore
import java.util.concurrent.TimeUnit
import kotlinx.serialization.Serializable

@Serializable data class PairedDevice(val id: String, val bluetooth: Boolean, val airPlay: Boolean)
@Serializable data class PairingsSnapshot(val devices: List<PairedDevice>, val bluetoothAvailable: Boolean)
@Serializable data class ServerLiveSnapshot(
    val deviceName: String, val wireless: Boolean, val sessionActive: Boolean,
    val phoneName: String?, val phoneModel: String?, val batteryPercent: Int?,
    val iap2Connected: Boolean, val gpsSubscribed: Boolean,
    val ultraTheme: Boolean, val clusterEnabled: Boolean, val autoInvite: Boolean,
    val uptimeSeconds: Long,
)

interface BluetoothPairings {
    /** Null means this host cannot inspect BlueZ. */
    fun list(): Set<String>?
    fun remove(id: String)
}

class BluezPairings : BluetoothPairings {
    private fun command(vararg arguments: String): String {
        val process = ProcessBuilder(listOf("bluetoothctl", *arguments)).redirectErrorStream(true).start()
        if (!process.waitFor(4, TimeUnit.SECONDS)) {
            process.destroyForcibly()
            error("Bluetooth timed out")
        }
        val output = process.inputStream.bufferedReader().readText()
        if (process.exitValue() != 0) error(output.take(180).ifBlank { "Bluetooth command failed" })
        return output
    }

    override fun list(): Set<String>? {
        if (System.getProperty("os.name").contains("Mac", ignoreCase = true)) return null
        return try {
            Regex("(?i)Device ((?:[0-9a-f]{2}:){5}[0-9a-f]{2})")
                .findAll(command("devices", "Paired"))
                .map { it.groupValues[1].uppercase() }.toSet()
        } catch (_: Exception) { null }
    }

    override fun remove(id: String) {
        command("remove", id)
        check(id !in (list() ?: error("Cannot verify Bluetooth removal"))) { "Bluetooth removal was not confirmed" }
    }
}

class PairingManager(private val store: PairingStore, private val bluetooth: BluetoothPairings = BluezPairings()) {
    fun snapshot(): PairingsSnapshot {
        val bt = bluetooth.list()
        val airplay = store.identifiers().map { it.uppercase() }.toSet()
        return PairingsSnapshot((airplay + (bt ?: emptySet())).sorted().map {
            PairedDevice(it, bt?.contains(it) == true, it in airplay)
        }, bt != null)
    }

    fun forget(identifier: String) {
        val id = identifier.uppercase()
        require(Regex("(?:[0-9A-F]{2}:){5}[0-9A-F]{2}").matches(id)) { "Invalid paired identifier" }
        val current = snapshot()
        val device = current.devices.firstOrNull { it.id == id } ?: error("Identifier is not paired")
        if (device.bluetooth) bluetooth.remove(id)
        if (device.airPlay) {
            val storedId = store.identifiers().firstOrNull { it.equals(id, ignoreCase = true) }
                ?: error("AirPlay identifier disappeared")
            store.remove(storedId)
        }
    }
}

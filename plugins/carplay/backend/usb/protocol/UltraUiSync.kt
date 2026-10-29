// SPDX-License-Identifier: GPL-3.0-or-later
// Session fields cross-checked against LIVI's GPL UI Sync implementation.
package com.shilapi.xcertplay.transport

import com.shilapi.xcertplay.airplay.BplistCodec

/** Bounded UI Sync reset and command acknowledgement state for one DataStream. */
class UltraUiSync {
    data class Choice(val type: Long, val values: Map<*, *>?)

    companion object {
        fun displayPanels(displays: List<*>): List<Map<String, Any?>> = displays.filterIsInstance<Map<*, *>>().mapNotNull { display ->
            val uuid = display["uuid"] as? String ?: return@mapNotNull null
            val cluster = (display["type"] as? Number)?.toInt() == 111
            val panel = linkedMapOf<String, Any?>(
                "uid" to "$uuid-panel",
                "widthPixels" to display["widthPixels"], "heightPixels" to display["heightPixels"],
                "widthPhysical" to display["widthPhysical"], "heightPhysical" to display["heightPhysical"],
                "properties" to if (cluster) listOf("showsInstruments") else emptyList<String>(),
                "initialVideoStreams" to listOf(mapOf("uuid" to uuid, "originXPixels" to 0L,
                    "originYPixels" to 0L, "zIndex" to 0L)),
            )
            if (cluster) panel["displayPlugins"] = listOf(mapOf("uid" to "$uuid-panel", "videoStreams" to listOf(uuid)))
            panel
        }
    }

    private var session = 0L
    private var nextTx = 0L
    private var lastRx = 0L
    private var waitingForReset = false
    private var ready = false
    private var phoneId: Any? = null
    private var panel = emptyMap<String, Any?>()
    private val choices = ArrayList<Choice>()

    @Synchronized fun reset() {
        session = 0; nextTx = 0; lastRx = 0
        waitingForReset = false; ready = false; phoneId = null
        panel = emptyMap(); choices.clear()
    }

    @Synchronized fun takeChoices(): List<Choice> = choices.toList().also { choices.clear() }

    @Synchronized fun handle(bytes: ByteArray): List<ByteArray> {
        val frame = runCatching { AppleOpack.decode(bytes) as? Map<*, *> }.getOrNull() ?: return emptyList()
        val header = decodePlist(frame["data"] as? ByteArray) ?: return emptyList()
        val kind = (header["type"] as? Number)?.toLong() ?: return emptyList()
        panel = frame.entries.mapNotNull { (key, value) ->
            if (key is String && key != "data") key to value else null
        }.toMap()
        if (kind == 0L) {
            if (waitingForReset && nextTx == 2L) return emptyList()
            session++; nextTx = 1; lastRx = 0
            ready = false; waitingForReset = true; phoneId = header["id"]
            return listOf(message(0, extra = mapOf("version" to 2L) + id()))
        }
        if ((header["ssn"] as? Number)?.toLong() != session) return emptyList()
        return when (kind) {
            1L -> {
                if (!waitingForReset) return emptyList()
                waitingForReset = false; ready = true
                lastRx = (header["psn"] as? Number)?.toLong() ?: 0L
                val version = minOf(2L, (header["version"] as? Number)?.toLong() ?: 1L)
                listOf(
                    message(1, extra = mapOf("version" to version) + if (version >= 2) id() else emptyMap()),
                    message(2, command = mapOf("type" to 0x11L, "data" to mapOf("allow" to true))),
                    message(2, command = mapOf("type" to 0x07L, "data" to mapOf("tokenID" to 4711L))),
                )
            }
            2L -> {
                if (!ready) return emptyList()
                lastRx = (header["psn"] as? Number)?.toLong() ?: lastRx
                val command = decodePlist(header["data"] as? ByteArray)
                val commandType = (command?.get("type") as? Number)?.toLong()
                if (commandType != null) choices.add(Choice(commandType, command["data"] as? Map<*, *>))
                buildList {
                    if (header["noAck"] != true) add(message(3))
                    if (commandType == 0x08L) add(message(2, command = mapOf("type" to 0x07L, "data" to mapOf("tokenID" to 4711L))))
                }
            }
            3L -> {
                lastRx = (header["psn"] as? Number)?.toLong() ?: lastRx
                emptyList()
            }
            else -> emptyList()
        }
    }

    private fun id(): Map<String, Any?> = phoneId?.let { mapOf("id" to it) } ?: emptyMap()

    private fun message(kind: Long, command: Map<String, Any?>? = null, extra: Map<String, Any?> = emptyMap()): ByteArray {
        val header = linkedMapOf<String, Any?>("type" to kind, "ssn" to session, "psn" to nextTx++, "asn" to lastRx)
        header.putAll(extra)
        if (command != null) header["data"] = BplistCodec.encode(command)
        return AppleOpack.encode(panel + ("data" to BplistCodec.encode(header)))
    }

    private fun decodePlist(bytes: ByteArray?): Map<*, *>? {
        if (bytes == null || bytes.size !in 40..65_536 || !bytes.copyOfRange(0, 8).contentEquals("bplist00".toByteArray())) return null
        val trailer = bytes.size - 32
        val objects = readUnsigned(bytes, trailer + 8)
        val top = readUnsigned(bytes, trailer + 16)
        val offset = readUnsigned(bytes, trailer + 24)
        val offsetSize = bytes[trailer + 6].toInt() and 255
        val refSize = bytes[trailer + 7].toInt() and 255
        if (objects !in 1..4096 || top !in 0 until objects || offsetSize !in 1..8 || refSize !in 1..8 || offset < 8 || offset + objects * offsetSize > trailer) return null
        return runCatching { BplistCodec.decode(bytes) as? Map<*, *> }.getOrNull()
    }

    private fun readUnsigned(bytes: ByteArray, start: Int): Long {
        var value = 0L
        for (index in start until start + 8) value = (value shl 8) or (bytes[index].toLong() and 255)
        return value
    }
}

// SPDX-License-Identifier: GPL-3.0-only
package com.playport.server

import com.shilapi.xcertplay.iap2.body.Iap2BodyReader
import com.shilapi.xcertplay.iap2.wire.Iap2Frame
import kotlinx.serialization.Serializable

@Serializable
data class HudSnapshot(
    val active: Boolean = false, val road: String = "", val instruction: String = "",
    val distance: Long = 0, val remaining: Long = 0, val maneuver: Int = -1,
    val distanceKnown: Boolean = false, val remainingKnown: Boolean = false,
    val destination: String = "", val source: String = "", val remainingSeconds: Long? = null,
    val routePackets: Long = 0, val mediaPackets: Long = 0,
    val title: String = "", val artist: String = "", val album: String = "", val mediaApp: String = "",
    val durationMs: Long? = null, val elapsedMs: Long? = null, val playbackStatus: Int? = null,
    val artworkId: Int? = null, val stale: Boolean = true,
)

/** Partial iAP2 updates retain absent fields; the viewer receives only bounded decoded metadata. */
class DebugTelemetry(private val publish: (String, HudSnapshot) -> Unit) {
    private var hud = HudSnapshot()
    private val maneuvers = linkedMapOf<Int, Triple<String, Int, String>>()
    private var currentIndex = -1
    @Synchronized fun accept(frame: Iap2Frame) {
        try {
            val body = Iap2BodyReader.of(frame)
            when (frame.messageId) {
                0x5001 -> {
                    hud = hud.copy(mediaPackets = hud.mediaPackets + 1)
                    body.optionalGroup(0)?.let { item ->
                        hud = hud.copy(title = item.optionalString(1)?.take(160) ?: hud.title,
                            artist = item.optionalString(12)?.take(160) ?: hud.artist,
                            album = item.optionalString(6)?.take(160) ?: hud.album,
                            artworkId = item.optionalU8(26) ?: hud.artworkId,
                            durationMs = item.optionalU32(4) ?: hud.durationMs, stale = false)
                    }
                    body.optionalGroup(1)?.let { playback ->
                        hud = hud.copy(mediaApp = playback.optionalString(7)?.take(80) ?: hud.mediaApp,
                            elapsedMs = playback.optionalU32(1) ?: hud.elapsedMs,
                            playbackStatus = playback.optionalU8(0) ?: hud.playbackStatus, stale = false)
                    }
                }
                0x5201 -> {
                    hud = hud.copy(routePackets = hud.routePackets + 1)
                    val state = body.optionalU8(1)
                    if (state == 0 || state == 2) {
                        hud = hud.copy(active = false, road = "", instruction = "", distance = 0, remaining = 0, distanceKnown = false, remainingKnown = false, remainingSeconds = null, destination = "", maneuver = -1, stale = false)
                        currentIndex = -1; maneuvers.clear()
                    } else {
                        body.optionalU16List(13)?.let { currentIndex = it.firstOrNull() ?: -1 }
                        hud = hud.copy(active = true, road = body.optionalString(3)?.take(160) ?: hud.road,
                            distance = body.optionalU32(10) ?: hud.distance,
                            distanceKnown = body.has(10) || hud.distanceKnown,
                            remainingKnown = body.has(7) || hud.remainingKnown,
                            destination = body.optionalString(4)?.take(160) ?: hud.destination,
                            source = body.optionalString(19)?.take(80) ?: hud.source,
                            remainingSeconds = body.optionalU64(6) ?: hud.remainingSeconds,
                            remaining = body.optionalU32(7) ?: hud.remaining, stale = false)
                    }
                }
                0x5202 -> {
                    hud = hud.copy(routePackets = hud.routePackets + 1, stale = false)
                    val rawInstruction = body.optionalRaw(2)
                    if (rawInstruction != null) {
                        val validUtf8 = runCatching { rawInstruction.decodeToString(throwOnInvalidSequence = true) }.isSuccess
                        if (!validUtf8 || rawInstruction.any { it == 63.toByte() }) {
                            publish("iAP2 instruction source: UTF8=$validUtf8 questionByte=${rawInstruction.any { it == 63.toByte() }}", hud)
                        }
                    }
                    val index = body.optionalU16(1) ?: -1
                    if (index >= 0) {
                        val old = maneuvers[index] ?: Triple("", -1, "")
                        maneuvers[index] = Triple(body.optionalString(2)?.take(160) ?: old.first,
                            body.optionalU8(3) ?: old.second, body.optionalString(4)?.take(160) ?: old.third)
                        while (maneuvers.size > 128) maneuvers.remove(maneuvers.keys.first())
                    }
                }
            }
            if (hud.active) maneuvers[currentIndex]?.let {
                hud = hud.copy(instruction = it.first, maneuver = it.second, road = it.third.ifEmpty { hud.road })
            }
            publish("iAP2 RX 0x${frame.messageId.toString(16).padStart(4, '0')} bytes=${frame.payload.size}", hud)
        } catch (_: Exception) {
            publish("iAP2 malformed 0x${frame.messageId.toString(16)} bytes=${frame.payload.size}", hud)
        }
    }
    @Synchronized fun ended() { hud = hud.copy(stale = true); publish("iAP2 session ended", hud) }
}

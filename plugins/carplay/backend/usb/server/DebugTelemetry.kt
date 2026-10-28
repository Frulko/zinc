// SPDX-License-Identifier: GPL-3.0-only
package com.playport.server

import com.shilapi.xcertplay.iap2.body.Iap2BodyReader
import com.shilapi.xcertplay.iap2.wire.Iap2Frame
import kotlinx.serialization.Serializable

@Serializable
data class HudSnapshot(
    val active: Boolean = false, val road: String = "", val instruction: String = "",
    val distance: Long = 0, val remaining: Long = 0, val maneuver: Int = -1,
    val title: String = "", val artist: String = "", val stale: Boolean = true,
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
                0x5001 -> body.optionalGroup(0)?.let { item ->
                    hud = hud.copy(title = item.optionalString(1)?.take(160) ?: hud.title,
                        artist = item.optionalString(12)?.take(160) ?: hud.artist, stale = false)
                }
                0x5201 -> {
                    val state = body.optionalU8(1)
                    if (state == 0 || state == 2) {
                        hud = hud.copy(active = false, road = "", instruction = "", distance = 0, remaining = 0, maneuver = -1, stale = false)
                        currentIndex = -1; maneuvers.clear()
                    } else {
                        body.optionalU16List(13)?.let { currentIndex = it.firstOrNull() ?: -1 }
                        hud = hud.copy(active = true, road = body.optionalString(3)?.take(160) ?: hud.road,
                            distance = body.optionalU32(10) ?: hud.distance,
                            remaining = body.optionalU32(7) ?: hud.remaining, stale = false)
                    }
                }
                0x5202 -> {
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

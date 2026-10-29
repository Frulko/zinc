package com.shilapi.xcertplay.transport

import com.shilapi.xcertplay.iap2.catalog.*
import com.shilapi.xcertplay.iap2.catalog.Iap2WireType.*

/** Names/types for telemetry TLVs, decoded by the existing bounded frame formatter. */
object Iap2TelemetrySchema {
    private fun f(id: Int, name: String, type: Iap2WireType) = Iap2FieldSpec(id, name, type)
    fun endpoint(id: Int): Iap2Endpoint? {
        val fields = when (id) {
            0xae01 -> listOf(f(0, "maximumCurrentMa", U16), f(1, "willCharge", U8), f(2, "powerMode", U8),
                f(4, "externalChargerConnected", U8), f(5, "chargingState", U8), f(6, "batteryChargeLevel", U16))
            0x4158 -> listOf(f(0, "signalStrength", BYTES), f(1, "registrationStatus", BYTES), f(2, "airplaneMode", U8),
                f(4, "carrierName", STRING), f(5, "cellularSupported", U8))
            0x4155 -> listOf(f(0, "remoteId", STRING), f(1, "displayName", STRING), f(2, "status", U8),
                f(3, "direction", U8), f(4, "callUuid", STRING), f(11, "disconnectReason", U8))
            0x5001 -> listOf(
                Iap2FieldSpec(0, "media", GROUP, children = listOf(
                    f(0, "persistentId", U64), f(1, "title", STRING), f(4, "durationMs", U32),
                    f(6, "album", STRING), f(12, "artist", STRING), f(14, "albumArtist", STRING),
                    f(16, "genre", STRING), f(26, "artworkTransferId", U8))),
                Iap2FieldSpec(1, "playback", GROUP, children = listOf(
                    f(0, "status", U8), f(1, "elapsedMs", U32), f(7, "appName", STRING), f(16, "bundleId", STRING))))
            0x5201 -> listOf(
                f(0, "componentId", U16), f(1, "state", U8), f(2, "maneuverState", U8),
                f(3, "currentRoad", STRING), f(4, "destination", STRING), f(5, "eta", U64),
                f(6, "remainingSeconds", U64), f(7, "remainingMeters", U32), f(8, "remainingDisplay", STRING),
                f(9, "remainingUnits", U8), f(10, "distanceToManeuver", U32), f(11, "distanceDisplay", STRING),
                f(12, "distanceUnits", U8), f(13, "maneuverIndices", U16_LIST), f(14, "maneuverCount", U16),
                f(15, "visibleInApp", U8), f(16, "laneIndex", U16), f(17, "laneCount", U16),
                f(18, "laneShown", U8), f(19, "sourceName", STRING), f(20, "sourceSupportsGuidance", U8), f(21, "destinationTimeZone", I16))
            0x5202 -> listOf(
                f(0, "componentId", U16), f(1, "index", U16), f(2, "instruction", STRING),
                f(3, "maneuverType", U8), f(4, "nextRoad", STRING), f(5, "distanceBetween", U32),
                f(6, "distanceDisplay", STRING), f(7, "distanceUnits", U8), f(8, "drivingSide", U8),
                f(9, "junctionType", U8), f(10, "junctionAngle", I16), f(11, "exitAngle", I16),
                f(12, "linkedLane", U16), f(13, "exitInfo", STRING))
            0x5204 -> listOf(f(0, "componentId", U16), f(1, "index", U16),
                Iap2FieldSpec(2, "lane", GROUP, repeatable = true, children = listOf(
                    f(0, "index", U16), f(1, "status", U8), f(2, "angle", I16), f(3, "highlightAngle", I16))),
                f(3, "description", STRING))
            else -> return null
        }
        return (Iap2Endpoints.byId(id) ?: Iap2Endpoint(id, "LaneGuidanceInformation", "Navigation", Iap2Direction.IPHONE_TO_ACCESSORY)).copy(fields = fields)
    }
}

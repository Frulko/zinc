package com.playport.server

import com.shilapi.xcertplay.iap2.body.Iap2BodyBuilder
import org.junit.Assert.*
import org.junit.Test

class DebugTelemetryTest {
    @Test fun partialMediaUpdatesKeepMetadataAndAllowExplicitClear() {
        var latest = HudSnapshot()
        val state = DebugTelemetry { _, hud -> latest = hud }
        state.accept(Iap2BodyBuilder.opaque(0x5001).group(0) { string(1, "Song"); string(6, "Album"); u32(4, 180000) }.build())
        state.accept(Iap2BodyBuilder.opaque(0x5001).group(1) { u8(0, 1); u32(1, 1200); string(7, "Music") }.build())
        assertEquals("Song", latest.title); assertEquals("Album", latest.album)
        assertEquals(180000L, latest.durationMs); assertEquals(1200L, latest.elapsedMs)
        assertEquals(1, latest.playbackStatus); assertEquals("Music", latest.mediaApp)
        state.accept(Iap2BodyBuilder.opaque(0x5001).group(0) { string(1, "") }.build())
        assertEquals("", latest.title); assertEquals("Album", latest.album)
    }
    @Test fun partialGuidanceUpdatesResolveManeuverAndClearOnArrival() {
        var latest = HudSnapshot()
        val events = mutableListOf<String>()
        val state = DebugTelemetry { line, hud -> events += line; latest = hud }
        state.accept(Iap2BodyBuilder.opaque(0x5202).u16(1, 7).string(2, "Turn left").u8(3, 2).string(4, "Next road").build())
        state.accept(Iap2BodyBuilder.opaque(0x5201).u8(1, 1).u16List(13, listOf(7)).u32(10, 120).u32(7, 5000).build())
        assertTrue(latest.active); assertEquals("Next road", latest.road)
        assertEquals("Turn left", latest.instruction); assertEquals(120L, latest.distance); assertTrue(latest.distanceKnown); assertTrue(latest.remainingKnown)
        state.accept(Iap2BodyBuilder.opaque(0x5201).u32(10, 80).build())
        assertEquals("Turn left", latest.instruction); assertEquals(5000L, latest.remaining)
        state.accept(Iap2BodyBuilder.opaque(0x5001).group(0) { string(1, "Song"); string(12, "Artist") }.build())
        assertEquals("Song", latest.title); assertEquals(1L, latest.mediaPackets)
        state.accept(Iap2BodyBuilder.opaque(0x5201).u8(1, 2).build())
        assertFalse(latest.active); assertEquals("", latest.instruction)
        state.ended(); assertTrue(latest.stale)
        assertTrue(events.first().contains("0x5202"))
    }
}

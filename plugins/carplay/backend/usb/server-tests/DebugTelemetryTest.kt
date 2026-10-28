package com.playport.server

import com.shilapi.xcertplay.iap2.body.Iap2BodyBuilder
import org.junit.Assert.*
import org.junit.Test

class DebugTelemetryTest {
    @Test fun partialGuidanceUpdatesResolveManeuverAndClearOnArrival() {
        var latest = HudSnapshot()
        val events = mutableListOf<String>()
        val state = DebugTelemetry { line, hud -> events += line; latest = hud }
        state.accept(Iap2BodyBuilder.opaque(0x5202).u16(1, 7).string(2, "Turn left").u8(3, 2).string(4, "Next road").build())
        state.accept(Iap2BodyBuilder.opaque(0x5201).u8(1, 1).u16List(13, listOf(7)).u32(10, 120).u32(7, 5000).build())
        assertTrue(latest.active); assertEquals("Next road", latest.road)
        assertEquals("Turn left", latest.instruction); assertEquals(120L, latest.distance)
        state.accept(Iap2BodyBuilder.opaque(0x5201).u32(10, 80).build())
        assertEquals("Turn left", latest.instruction); assertEquals(5000L, latest.remaining)
        state.accept(Iap2BodyBuilder.opaque(0x5001).group(0) { string(1, "Song"); string(12, "Artist") }.build())
        assertEquals("Song", latest.title)
        state.accept(Iap2BodyBuilder.opaque(0x5201).u8(1, 2).build())
        assertFalse(latest.active); assertEquals("", latest.instruction)
        state.ended(); assertTrue(latest.stale)
        assertTrue(events.first().contains("0x5202"))
    }
}

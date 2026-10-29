package com.playport.server

import com.shilapi.xcertplay.iap2.body.Iap2BodyBuilder
import com.shilapi.xcertplay.iap2.body.Iap2BodyReader
import com.shilapi.xcertplay.iap2.wire.Iap2Frame
import com.shilapi.xcertplay.iap2.trace.*
import org.junit.Assert.*
import org.junit.Test

class Iap2LiveTraceTest {
    @Test fun liveTraceTracksDirectionsAndSubscriptionsWithoutLeakingSecrets() {
        val lines = mutableListOf<String>()
        val trace = Iap2LiveTrace(false) { lines += it }
        trace.accept("IAP2 TX [wired] 0x5000 StartNowPlayingUpdates\n flags")
        assertTrue(lines.isEmpty())
        trace.tracing(true)
        trace.accept("IAP2 RX [wired] 0x5001 NowPlayingUpdate\n title")
        trace.accept("IAP2 TX [wired] 0x5703 AccessoryWiFiConfigurationInformation\nSECRET-WIFI")
        trace.accept("IAP2 TX [wireless] 0x4301 CarPlayStartSession\nSECRET-START-WIFI")
        trace.accept("IAP2 TX [wired] 0xaa03 AuthenticationResponse\nSECRET-SIGNATURE")
        assertEquals(4, lines.size)
        assertFalse(lines.joinToString().contains("SECRET"))
        val snapshot = trace.snapshot()
        assertFalse(snapshot.connected); assertTrue(snapshot.tracing)
        assertTrue(0x5000 in snapshot.subscriptions)
        assertEquals(1L, snapshot.catalog.single { it.id == 0x5001 }.rx)
        assertTrue(snapshot.catalog.single { it.id == 0x5001 }.schema.contains("title"))
        trace.accept("IAP2 RX [wired] 0xeff1 Unknown\n raw-body=00")
        assertEquals(1L, trace.snapshot().catalog.single { it.id == 0xeff1 }.rx)
        trace.accept("IAP2 TX [wired] 0x5002 StopNowPlayingUpdates")
        assertTrue(trace.snapshot().subscriptions.isEmpty())
        assertThrows(IllegalArgumentException::class.java) { trace.send(0xaa03, "") }
        assertThrows(IllegalArgumentException::class.java) { trace.send(0x4301, "") }
    }
    @Test fun catalogSubscriptionPayloadRequestsAllKnownMediaFields() {
        val catalog = Iap2LiveTrace(false) { }.snapshot().catalog
        val sample = catalog.single { it.id == 0x5000 }.samplePayload
        val body = Iap2BodyReader.of(Iap2Frame(0x5000, Iap2LiveTrace.payload(sample)))
        assertTrue(body.group(0).has(14)); assertTrue(body.group(0).has(16)); assertTrue(body.group(1).has(16))
    }
    @Test fun nestedTelemetryUsesFieldNamesAndUnicodeValues() {
        val frame = Iap2BodyBuilder.opaque(0x5001).group(0) { string(1, "L’été"); string(12, "Artiste") }.build()
        val text = Iap2FrameFormatter.format(Iap2TraceDirection.RX, "test", frame)
        assertTrue(text.contains("media")); assertTrue(text.contains("title: \"L’été\"")); assertTrue(text.contains("artist"))
    }
    @Test fun composerRejectsMalformedOrOversizedTlv() {
        assertArrayEquals(byteArrayOf(0, 4, 0, 1), Iap2LiveTrace.payload("00 04 00 01"))
        for (bad in listOf("g0", "a", "00030001", "00".repeat(4097))) {
            assertThrows(Exception::class.java) { Iap2LiveTrace.payload(bad) }
        }
    }
}
